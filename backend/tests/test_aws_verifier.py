import unittest
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError
from app.integrations.aws.verifier import AWSVerifier
from app.integrations.aws.client import AWSClient

class TestAWSVerifier(unittest.TestCase):

    def setUp(self):
        # Mock AWSClient
        self.mock_client = MagicMock(spec=AWSClient)
        self.verifier = AWSVerifier(self.mock_client)

    def test_verify_identity_success(self):
        # Mock STS response
        mock_sts = MagicMock()
        mock_sts.get_caller_identity.return_value = {
            "Account": "123456789012",
            "Arn": "arn:aws:iam::123456789012:user/test",
            "UserId": "AIDAXMPL"
        }
        self.mock_client.get_client.return_value = mock_sts

        success, msg = self.verifier.verify_identity()
        
        self.assertTrue(success)
        self.assertEqual(self.verifier.account_id, "123456789012")
        self.assertIn("verified", msg)

    def test_verify_identity_failure(self):
        # Mock STS AccessDenied
        mock_sts = MagicMock()
        error_response = {'Error': {'Code': 'InvalidClientTokenId', 'Message': 'Invalid token'}}
        mock_sts.get_caller_identity.side_effect = ClientError(error_response, "GetCallerIdentity")
        self.mock_client.get_client.return_value = mock_sts

        success, msg = self.verifier.verify_identity()
        
        self.assertFalse(success)
        self.assertIn("Invalid Access/Secret Key pair", msg)

    def test_probe_service_access_denied(self):
        # Mock EC2 AccessDenied
        mock_ec2 = MagicMock()
        error_response = {'Error': {'Code': 'UnauthorizedOperation', 'Message': 'Access Denied'}}
        mock_ec2.describe_vpcs.side_effect = ClientError(error_response, "DescribeVpcs")
        self.mock_client.get_client.return_value = mock_ec2

        passed, msg, missing, policy = self.verifier._probe_service("ec2", "describe_vpcs")
        
        self.assertFalse(passed)
        self.assertEqual(msg, "Access Denied")
        self.assertIn("ec2:DescribeVpcs", missing)
        self.assertIsNotNone(policy)
        self.assertEqual(policy["Statement"][0]["Action"][0], "ec2:DescribeVpcs")

    def test_run_comprehensive_check(self):
        # Mock all services to pass
        self.mock_client.get_client.return_value.describe_vpcs.return_value = {"Vpcs": []}
        self.mock_client.get_client.return_value.list_buckets.return_value = {"Buckets": []}
        self.mock_client.get_client.return_value.describe_db_instances.return_value = {"DBInstances": []}
        self.mock_client.get_client.return_value.list_functions.return_value = {"Functions": []}
        self.mock_client.get_client.return_value.list_users.return_value = {"Users": []}
        self.mock_client.get_client.return_value.list_hosted_zones.return_value = {"HostedZones": []}

        results = self.verifier.run_comprehensive_check()
        
        self.assertEqual(len(results), 6)
        for r in results:
            self.assertEqual(r["status"], "PASS")

if __name__ == '__main__':
    unittest.main()
