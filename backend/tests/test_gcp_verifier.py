import unittest
from unittest.mock import MagicMock, patch
from google.api_core.exceptions import PermissionDenied
from app.integrations.gcp.verifier import GCPVerifier

class TestGCPVerifier(unittest.TestCase):

    def setUp(self):
        self.sa_info = {"project_id": "test-project"}
        
        with patch('google.oauth2.service_account.Credentials.from_service_account_info'):
            self.verifier = GCPVerifier(self.sa_info)

    @patch('google.cloud.compute_v1.InstancesClient')
    def test_verify_identity_success(self, mock_client):
        # Mock aggregated_list
        mock_client.return_value.aggregated_list.return_value = []

        success, msg = self.verifier.verify_identity()
        
        self.assertTrue(success)
        self.assertIn("Identity verified", msg)

    @patch('google.cloud.compute_v1.NetworksClient')
    def test_probe_networking_success(self, mock_net_client):
        # Mock list
        mock_net_client.return_value.list.return_value = [MagicMock()]

        result = self.verifier._probe_networking()
        
        self.assertEqual(result["status"], "PASS")
        self.assertIn("Found 1 VPC Networks", result["message"])

    @patch('google.cloud.compute_v1.InstancesClient')
    def test_probe_compute_permission_denied(self, mock_inst_client):
        # Mock PermissionDenied
        mock_inst_client.return_value.aggregated_list.side_effect = PermissionDenied("Forbidden")

        result = self.verifier._probe_compute()
        
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["missing_permissions"], ["compute.instances.list"])
        self.assertIn("Compute Viewer", result["suggested_policy_snippet"])

    @patch('google.cloud.compute_v1.DisksClient')
    @patch('google.cloud.compute_v1.AddressesClient')
    def test_probe_ghost_assets_success(self, mock_addr, mock_disks):
        # Mock disks
        mock_disk = MagicMock()
        mock_disk.users = [] # Orphaned
        mock_disks.return_value.aggregated_list.return_value = [("zone-a", MagicMock(disks=[mock_disk]))]
        
        # Mock addresses
        mock_addr_obj = MagicMock()
        mock_addr_obj.status = "RESERVED" # Unattached
        mock_addr.return_value.aggregated_list.return_value = [("region-a", MagicMock(addresses=[mock_addr_obj]))]

        results = self.verifier._probe_ghost_assets()
        
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["service"], "Ghost Assets (Disks)")
        self.assertIn("Found 1 orphaned", results[0]["message"])
        self.assertEqual(results[1]["service"], "Ghost Assets (IPs)")
        self.assertIn("Found 1 unattached", results[1]["message"])

if __name__ == '__main__':
    unittest.main()
