from typing import Dict, List, Any, Tuple
from app.models import Node, Edge, NodeMetrics, NodeStatus
import hashlib
import json
from datetime import datetime

def get_tag_value(tags: List[Dict[str, str]], key: str) -> str:
    """Helper to extract a tag value from AWS tags."""
    if not tags: return ""
    for tag in tags:
        if tag.get("Key") == key:
            return tag.get("Value", "")
    return ""

def _sanitize_for_neo4j(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Flatten an AWS response dict into Neo4j-safe flat primitives.
    
    Neo4j properties can only be: str, int, float, bool, or homogeneous lists of those.
    Nested dicts, datetimes, and heterogeneous lists are JSON-serialized to strings.
    """
    safe = {}
    for k, v in raw.items():
        if k.startswith("_"):  # skip internal keys like _target_health
            continue
        if v is None:
            continue
        if isinstance(v, (str, int, float, bool)):
            safe[k] = v
        elif isinstance(v, datetime):
            safe[k] = v.isoformat()
        elif isinstance(v, (list, dict)):
            try:
                safe[k] = json.dumps(v, default=str)
            except (TypeError, ValueError):
                safe[k] = str(v)
        else:
            safe[k] = str(v)
    return safe

def _build_node(
    id: str,
    aws_type: str,
    raw_obj: Dict[str, Any],
    label_fallback: str,
    tags_key: str = "Tags",
    parent_id: str = None
) -> Node:
    """Base helper to build a Node from an AWS resource."""
    tags = raw_obj.get(tags_key, [])
    if not isinstance(tags, list):
        tags = []
    name = get_tag_value(tags, "Name") or label_fallback
    env = get_tag_value(tags, "Environment") or "production"
    business = get_tag_value(tags, "BusinessFunction") or "general"
    
    return Node(
        id=id,
        type=f"aws_{aws_type}",
        label=name,
        status=NodeStatus.LIVE,
        parent_id=parent_id,
        metrics=NodeMetrics(current_load=0.0),
        environment=env,
        business_function=business,
        attributes=_sanitize_for_neo4j(raw_obj)
    )

def _build_edge(source_id: str, target_id: str, label: str = "DEPENDS_ON") -> Edge:
    """Helper to build a directed Edge."""
    edge_id = hashlib.md5(f"{source_id}-{target_id}-{label}".encode()).hexdigest()
    return Edge(
        id=edge_id,
        source=source_id,
        target=target_id,
        label=label,
        confidence=1.0,
        dependency_mode="sync"
    )

class AWSGraphNormalizer:
    """Translates generic AWS inventory dicts into Infradian Graph Models."""

    def __init__(self, region: str, account_id: str = "unknown"):
        self.region = region
        self.account_id = account_id
        self.nodes: Dict[str, Node] = {}
        self.edges: List[Edge] = []

    def normalize(self, inventory: Dict[str, List[Dict[str, Any]]]) -> Tuple[List[Node], List[Edge]]:
        """Run normalization pipeline."""
        
        # 1. Normalize VPCs
        for vpc in inventory.get("vpcs", []):
            vpc_id = vpc.get("VpcId")
            if not vpc_id:
                continue
            self.nodes[vpc_id] = _build_node(vpc_id, "vpc", vpc, vpc_id)

        # 2. Normalize Subnets
        for subnet in inventory.get("subnets", []):
            subnet_id = subnet.get("SubnetId")
            if not subnet_id:
                continue
            vpc_id = subnet.get("VpcId")
            self.nodes[subnet_id] = _build_node(subnet_id, "subnet", subnet, subnet_id, parent_id=vpc_id)
            if vpc_id and vpc_id in self.nodes:
                self.edges.append(_build_edge(vpc_id, subnet_id, "CONTAINS"))

        # 3. Normalize EC2
        for ec2 in inventory.get("ec2_instances", []):
            instance_id = ec2.get("InstanceId")
            if not instance_id:
                continue
            subnet_id = ec2.get("SubnetId")
            
            node = _build_node(instance_id, "instance", ec2, instance_id)
            self.nodes[instance_id] = node
            
            if subnet_id and subnet_id in self.nodes:
                self.edges.append(_build_edge(subnet_id, instance_id, "CONTAINS"))
                
            for sg in ec2.get("SecurityGroups", []):
                sg_id = sg.get("GroupId")
                if sg_id:
                    self.edges.append(_build_edge(instance_id, sg_id, "SECURED_BY"))

        # 4. Normalize Security Groups
        for sg in inventory.get("security_groups", []):
            sg_id = sg.get("GroupId")
            if not sg_id:
                continue
            vpc_id = sg.get("VpcId")
            self.nodes[sg_id] = _build_node(sg_id, "security_group", sg, sg.get("GroupName", sg_id), parent_id=vpc_id)

        # 5. Normalize RDS
        for rds in inventory.get("rds_instances", []):
            rds_id = rds.get("DBInstanceIdentifier")
            if not rds_id:
                continue
            # Subnet parsing for RDS is nested
            subnet_group = rds.get("DBSubnetGroup", {})
            subnets = subnet_group.get("Subnets", [])
            primary_subnet_id = subnets[0].get("SubnetIdentifier") if subnets else None
            
            self.nodes[rds_id] = _build_node(rds_id, "db_instance", rds, rds_id, tags_key="TagList", parent_id=primary_subnet_id)
            
            if primary_subnet_id and primary_subnet_id in self.nodes:
                self.edges.append(_build_edge(primary_subnet_id, rds_id, "CONTAINS"))

            for sg in rds.get("VpcSecurityGroups", []):
                sg_id = sg.get("VpcSecurityGroupId")
                if sg_id:
                    self.edges.append(_build_edge(rds_id, sg_id, "SECURED_BY"))

        # 6. Normalize Load Balancers & Target Groups
        lbs = {}
        for lb in inventory.get("load_balancers", []):
            lb_arn = lb.get("LoadBalancerArn")
            if not lb_arn:
                continue
            lb_id = lb.get("LoadBalancerName", lb_arn.split('/')[-1] if lb_arn else "lb-unknown")
            vpc_id = lb.get("VpcId")
            
            self.nodes[lb_arn] = _build_node(lb_arn, "alb", lb, lb_id, parent_id=vpc_id)
            lbs[lb_arn] = lb_id
            
        for tg in inventory.get("target_groups", []):
            tg_arn = tg.get("TargetGroupArn")
            if not tg_arn:
                continue
            tg_id = tg.get("TargetGroupName", tg_arn.split('/')[-1] if tg_arn else "tg-unknown")
            vpc_id = tg.get("VpcId")
            
            self.nodes[tg_arn] = _build_node(tg_arn, "target_group", tg, tg_id, parent_id=vpc_id)
            
            # Link LB -> TG
            for lb_arn in tg.get("LoadBalancerArns", []):
                self.edges.append(_build_edge(lb_arn, tg_arn, "ROUTES_TO"))
                
            # Link TG -> Instances
            for health_desc in tg.get("_target_health", []):
                target_id = health_desc.get("Target", {}).get("Id")
                if target_id:
                    self.edges.append(_build_edge(tg_arn, target_id, "TARGETS"))

        # 7. Normalize Lambda
        for fn in inventory.get("lambda_functions", []):
            arn = fn.get("FunctionArn")
            if not arn:
                continue
            name = fn.get("FunctionName")
            vpc_config = fn.get("VpcConfig", {})
            subnets = vpc_config.get("SubnetIds", [])
            primary_subnet = subnets[0] if subnets else None
            
            self.nodes[arn] = _build_node(arn, "lambda_function", fn, name, parent_id=primary_subnet)
            if primary_subnet and primary_subnet in self.nodes:
                self.edges.append(_build_edge(primary_subnet, arn, "CONTAINS"))
                
            for sg_id in vpc_config.get("SecurityGroupIds", []):
                self.edges.append(_build_edge(arn, sg_id, "SECURED_BY"))

        # 8. Normalize S3 Buckets (top-level, no parent)
        for bucket in inventory.get("s3_buckets", []):
            name = bucket.get("Name")
            if not name:
                continue
            bucket_id = f"s3-{name}"
            self.nodes[bucket_id] = _build_node(bucket_id, "s3", bucket, name)

        # Stamp the ledger account onto every node before returning
        for node in self.nodes.values():
            node.account_id = self.account_id

        return list(self.nodes.values()), list(self.edges)
