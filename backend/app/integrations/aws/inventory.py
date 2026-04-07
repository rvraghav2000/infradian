import logging
from typing import Dict, List, Any
from .client import AWSClient

logger = logging.getLogger(__name__)

class AWSInventoryCollector:
    """Collects read-only raw dictionaries from AWS."""

    def __init__(self, client: AWSClient):
        self.aws = client
        self.errors: List[str] = []

    def collect_all(self) -> Dict[str, List[Dict[str, Any]]]:
        """Runs all collectors and returns a categorized dictionary of raw resources.
        
        Errors from individual collectors are accumulated in self.errors
        so callers can report which services failed without crashing the pipeline.
        """
        self.errors = []
        inventory = {
            "vpcs": self._safe_collect("VPCs", self.get_vpcs),
            "subnets": self._safe_collect("Subnets", self.get_subnets),
            "ec2_instances": self._safe_collect("EC2 Instances", self.get_ec2_instances),
            "security_groups": self._safe_collect("Security Groups", self.get_security_groups),
            "load_balancers": self._safe_collect("Load Balancers", self.get_load_balancers),
            "target_groups": self._safe_collect("Target Groups", self.get_target_groups),
            "rds_instances": self._safe_collect("RDS Instances", self.get_rds_instances),
            "lambda_functions": self._safe_collect("Lambda Functions", self.get_lambda_functions),
            "s3_buckets": self._safe_collect("S3 Buckets", self.get_s3_buckets),
        }
        return inventory

    def _safe_collect(self, label: str, fn) -> List[Dict[str, Any]]:
        """Wrapper that catches errors per-collector and accumulates them."""
        try:
            result = fn()
            if result:
                logger.info(f"Collected {len(result)} {label}")
            return result
        except Exception as e:
            error_str = str(e)
            if "AccessDenied" in error_str or "UnauthorizedOperation" in error_str:
                msg = f"{label}: Missing IAM permissions (Access Denied)"
            else:
                msg = f"{label}: {error_str.split(':', 1)[-1].strip() if ':' in error_str else error_str}"
            logger.warning(f"Failed to collect {msg}")
            self.errors.append(msg)
            return []

    def get_vpcs(self) -> List[Dict[str, Any]]:
        ec2 = self.aws.get_client("ec2")
        return ec2.describe_vpcs().get("Vpcs", [])

    def get_subnets(self) -> List[Dict[str, Any]]:
        ec2 = self.aws.get_client("ec2")
        paginator = ec2.get_paginator('describe_subnets')
        subnets = []
        for page in paginator.paginate():
            subnets.extend(page.get("Subnets", []))
        return subnets

    def get_ec2_instances(self) -> List[Dict[str, Any]]:
        ec2 = self.aws.get_client("ec2")
        paginator = ec2.get_paginator('describe_instances')
        instances = []
        for page in paginator.paginate():
            for reservation in page.get("Reservations", []):
                instances.extend(reservation.get("Instances", []))
        return instances

    def get_security_groups(self) -> List[Dict[str, Any]]:
        ec2 = self.aws.get_client("ec2")
        paginator = ec2.get_paginator('describe_security_groups')
        sgs = []
        for page in paginator.paginate():
            sgs.extend(page.get("SecurityGroups", []))
        return sgs

    def get_load_balancers(self) -> List[Dict[str, Any]]:
        elbv2 = self.aws.get_client("elbv2")
        paginator = elbv2.get_paginator('describe_load_balancers')
        lbs = []
        for page in paginator.paginate():
            lbs.extend(page.get("LoadBalancers", []))
        return lbs

    def get_target_groups(self) -> List[Dict[str, Any]]:
        elbv2 = self.aws.get_client("elbv2")
        paginator = elbv2.get_paginator('describe_target_groups')
        tgs = []
        for page in paginator.paginate():
            for tg in page.get("TargetGroups", []):
                # Attempt to fetch health targets to know which ec2 instances are attached
                try:
                    health = elbv2.describe_target_health(TargetGroupArn=tg['TargetGroupArn'])
                    tg['_target_health'] = health.get("TargetHealthDescriptions", [])
                except Exception:
                    tg['_target_health'] = []
                tgs.append(tg)
        return tgs

    def get_rds_instances(self) -> List[Dict[str, Any]]:
        rds = self.aws.get_client("rds")
        paginator = rds.get_paginator('describe_db_instances')
        db_instances = []
        for page in paginator.paginate():
            db_instances.extend(page.get("DBInstances", []))
        return db_instances

    def get_lambda_functions(self) -> List[Dict[str, Any]]:
        lmbda = self.aws.get_client("lambda")
        paginator = lmbda.get_paginator('list_functions')
        functions = []
        for page in paginator.paginate():
            functions.extend(page.get("Functions", []))
        return functions

    def get_s3_buckets(self) -> List[Dict[str, Any]]:
        s3 = self.aws.get_client("s3")
        response = s3.list_buckets()
        return response.get("Buckets", [])
