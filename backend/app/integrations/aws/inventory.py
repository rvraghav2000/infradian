import logging
from typing import Dict, List, Any
from .client import AWSClient

logger = logging.getLogger(__name__)

class AWSInventoryCollector:
    """Collects read-only raw dictionaries from AWS."""

    def __init__(self, client: AWSClient):
        self.aws = client

    def collect_all(self) -> Dict[str, List[Dict[str, Any]]]:
        """Runs all collectors and returns a categorized dictionary of raw resources."""
        inventory = {
            "vpcs": self.get_vpcs(),
            "subnets": self.get_subnets(),
            "ec2_instances": self.get_ec2_instances(),
            "security_groups": self.get_security_groups(),
            "load_balancers": self.get_load_balancers(),
            "target_groups": self.get_target_groups(),
            "rds_instances": self.get_rds_instances(),
            "lambda_functions": self.get_lambda_functions(),
        }
        return inventory

    def get_vpcs(self) -> List[Dict[str, Any]]:
        ec2 = self.aws.get_client("ec2")
        try:
            return ec2.describe_vpcs().get("Vpcs", [])
        except Exception as e:
            logger.warning(f"Failed to collect VPCs: {e}")
            return []

    def get_subnets(self) -> List[Dict[str, Any]]:
        ec2 = self.aws.get_client("ec2")
        try:
            paginator = ec2.get_paginator('describe_subnets')
            subnets = []
            for page in paginator.paginate():
                subnets.extend(page.get("Subnets", []))
            return subnets
        except Exception as e:
            logger.warning(f"Failed to collect Subnets: {e}")
            return []

    def get_ec2_instances(self) -> List[Dict[str, Any]]:
        ec2 = self.aws.get_client("ec2")
        try:
            paginator = ec2.get_paginator('describe_instances')
            instances = []
            for page in paginator.paginate():
                for reservation in page.get("Reservations", []):
                    instances.extend(reservation.get("Instances", []))
            return instances
        except Exception as e:
            logger.warning(f"Failed to collect EC2 Instances: {e}")
            return []

    def get_security_groups(self) -> List[Dict[str, Any]]:
        ec2 = self.aws.get_client("ec2")
        try:
            paginator = ec2.get_paginator('describe_security_groups')
            sgs = []
            for page in paginator.paginate():
                sgs.extend(page.get("SecurityGroups", []))
            return sgs
        except Exception as e:
            logger.warning(f"Failed to collect Security Groups: {e}")
            return []

    def get_load_balancers(self) -> List[Dict[str, Any]]:
        try:
            elbv2 = self.aws.get_client("elbv2")
            paginator = elbv2.get_paginator('describe_load_balancers')
            lbs = []
            for page in paginator.paginate():
                lbs.extend(page.get("LoadBalancers", []))
            return lbs
        except Exception as e:
            logger.warning(f"Failed to collect Load Balancers: {e}")
            return []

    def get_target_groups(self) -> List[Dict[str, Any]]:
        try:
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
        except Exception as e:
            logger.warning(f"Failed to collect Target Groups: {e}")
            return []

    def get_rds_instances(self) -> List[Dict[str, Any]]:
        try:
            rds = self.aws.get_client("rds")
            paginator = rds.get_paginator('describe_db_instances')
            db_instances = []
            for page in paginator.paginate():
                db_instances.extend(page.get("DBInstances", []))
            return db_instances
        except Exception as e:
            logger.warning(f"Failed to collect RDS Instances: {e}")
            return []

    def get_lambda_functions(self) -> List[Dict[str, Any]]:
        try:
            lmbda = self.aws.get_client("lambda")
            paginator = lmbda.get_paginator('list_functions')
            functions = []
            for page in paginator.paginate():
                functions.extend(page.get("Functions", []))
            return functions
        except Exception as e:
            logger.warning(f"Failed to collect Lambda Functions: {e}")
            return []
