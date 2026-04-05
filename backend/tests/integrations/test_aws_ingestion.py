import pytest
from app.integrations.aws.normalize import AWSGraphNormalizer

def test_vpc_normalization():
    raw_inventory = {
        "vpcs": [
            {"VpcId": "vpc-0abc", "Tags": [{"Key": "Name", "Value": "prod-vpc"}]}
        ]
    }
    
    normalizer = AWSGraphNormalizer("us-east-1")
    nodes, edges = normalizer.normalize(raw_inventory)
    
    assert len(nodes) == 1
    assert len(edges) == 0
    assert nodes[0].id == "vpc-0abc"
    assert nodes[0].label == "prod-vpc"
    assert nodes[0].type == "aws_vpc"

def test_subnet_and_ec2_containment():
    raw_inventory = {
        "vpcs": [{"VpcId": "vpc-123"}],
        "subnets": [
            {"SubnetId": "subnet-001", "VpcId": "vpc-123", "Tags": [{"Key": "Name", "Value": "public"}]}
        ],
        "ec2_instances": [
            {
                "InstanceId": "i-0abc123", 
                "SubnetId": "subnet-001",
                "SecurityGroups": [{"GroupId": "sg-999"}]
            }
        ],
        "security_groups": [
            {"GroupId": "sg-999", "VpcId": "vpc-123", "GroupName": "web-sg"}
        ]
    }
    
    normalizer = AWSGraphNormalizer("us-east-1")
    nodes, edges = normalizer.normalize(raw_inventory)
    
    # 4 nodes (vpc, subnet, ec2, sg)
    assert len(nodes) == 4
    
    # edges: vpc->subnet, subnet->ec2, ec2->sg, sg->vpc is implicit actually, normaliser binds parent_id
    # let's count structural edges created by normalize function
    # VPC contains subnet (1)
    # subnet contains EC2 (1)
    # EC2 secured by SG (1)
    # Total edges = 3
    assert len(edges) == 3
    
    contains_edges = [e for e in edges if e.label == "CONTAINS"]
    assert len(contains_edges) == 2
    
    secured_by_edges = [e for e in edges if e.label == "SECURED_BY"]
    assert len(secured_by_edges) == 1
    assert secured_by_edges[0].source == "i-0abc123"
    assert secured_by_edges[0].target == "sg-999"
