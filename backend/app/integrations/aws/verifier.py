import logging
import json
from typing import List, Optional, Tuple, Dict
from botocore.exceptions import ClientError, EndpointConnectionError
from .client import AWSClient

logger = logging.getLogger(__name__)

class AWSVerifier:
    """
    Granular diagnostic service for AWS connectivity and permissions.
    Performs identity handshake and service-specific probes.
    """

    def __init__(self, client: AWSClient):
        self.client = client
        self.account_id = None
        self.user_arn = None
        self.user_id = None

    def verify_identity(self) -> Tuple[bool, str]:
        """Handshake check: can we even talk to AWS?"""
        try:
            sts = self.client.get_client("sts")
            identity = sts.get_caller_identity()
            self.account_id = identity.get("Account")
            self.user_arn = identity.get("Arn")
            self.user_id = identity.get("UserId")
            return True, "Identity verified successfully."
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ["InvalidClientTokenId", "SignatureDoesNotMatch", "AuthFailure"]:
                return False, "Invalid Access/Secret Key pair."
            return False, f"Identity check failed: {str(e)}"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    def _probe_service(self, service_name: str, method_name: str, params: dict = None) -> Tuple[bool, str, List[str], Optional[dict]]:
        """Generic probe wrapper for a single AWS service call."""
        params = params or {}
        try:
            aws_client = self.client.get_client(service_name)
            method = getattr(aws_client, method_name)
            response = method(**params)
            
            # Basic pass logic: if we didn't raise, we have some level of access
            msg = "Access verified."
            if "Volumes" in response: msg = f"Found {len(response['Volumes'])} volumes."
            elif "Vpcs" in response: msg = f"Found {len(response['Vpcs'])} VPCs."
            elif "Buckets" in response: msg = f"Found {len(response['Buckets'])} buckets."
            elif "DBInstances" in response: msg = f"Found {len(response['DBInstances'])} RDS instances."
            elif "Functions" in response: msg = f"Found {len(response['Functions'])} Lambda functions."
            elif "Users" in response: msg = f"Found {len(response['Users'])} IAM users."
            elif "HostedZones" in response: msg = f"Found {len(response['HostedZones'])} Route53 zones."
            
            return True, msg, [], None
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            error_msg = e.response.get("Error", {}).get("Message", "")
            
            if error_code in ["AccessDenied", "UnauthorizedOperation"]:
                # Attempt to extract action (e.g., ec2:DescribeVpcs)
                action = f"{service_name}:" + "".join([word.capitalize() for word in method_name.split("_")])
                # Special cases for mapping method names to IAM actions
                action_map = {
                    "s3:ListBuckets": "s3:ListAllMyBuckets",
                }
                action = action_map.get(action, action)
                
                return False, "Access Denied", [action], self._generate_policy_snippet(action)
            
            return False, f"Service error: {error_code}", [], None
        except Exception as e:
            return False, f"Unexpected error: {str(e)}", [], None

    def _generate_policy_snippet(self, action: str) -> dict:
        """Generates a minimal IAM policy snippet for a missing action."""
        return {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [action],
                    "Resource": "*"
                }
            ]
        }

    def run_comprehensive_check(self) -> List[Dict]:
        """Iterates through the 6 core services and returns results."""
        probes = [
            ("EC2/VPC", "ec2", "describe_vpcs", {"MaxResults": 5}),
            ("S3", "s3", "list_buckets", {}),
            ("RDS", "rds", "describe_db_instances", {"MaxRecords": 20}),
            ("Lambda", "lambda", "list_functions", {"MaxItems": 1}),
            ("IAM", "iam", "list_users", {"MaxItems": 1}),
            ("Route53", "route53", "list_hosted_zones", {"MaxItems": 1}),
        ]
        
        results = []
        for label, svc, method, params in probes:
            passed, msg, missing, policy = self._probe_service(svc, method, params)
            results.append({
                "service": label,
                "status": "PASS" if passed else "FAIL",
                "message": msg,
                "missing_permissions": missing,
                "suggested_policy_snippet": policy
            })
            
        return results
