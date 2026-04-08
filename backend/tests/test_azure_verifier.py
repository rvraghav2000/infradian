import unittest
from unittest.mock import MagicMock, patch
from azure.core.exceptions import HttpResponseError
from app.integrations.azure.verifier import AzureVerifier

class TestAzureVerifier(unittest.TestCase):

    def setUp(self):
        self.tenant_id = "test-tenant"
        self.client_id = "test-client"
        self.client_secret = "test-secret"
        self.subscription_id = "test-sub"
        
        with patch('app.integrations.azure.verifier.ClientSecretCredential'):
            self.verifier = AzureVerifier(self.tenant_id, self.client_id, self.client_secret, self.subscription_id)

    @patch('app.integrations.azure.verifier.SubscriptionClient')
    def test_verify_identity_success(self, mock_client):
        # Test with no subscription_id provided
        self.verifier.subscription_id = None
        # Mock Subscription list
        mock_sub = MagicMock()
        mock_sub.subscription_id = "sub-123"
        mock_client.return_value.subscriptions.list.return_value = [mock_sub]

        success, msg = self.verifier.verify_identity()
        
        self.assertTrue(success)
        self.assertIn("verified", msg)
        self.assertEqual(self.verifier.subscription_id, "sub-123")

    @patch('app.integrations.azure.verifier.NetworkManagementClient')
    def test_probe_networking_success(self, mock_net_client):
        # Mock VNet list
        mock_net_client.return_value.virtual_networks.list_all.return_value = [MagicMock(), MagicMock()]

        result = self.verifier._probe_networking()
        
        self.assertEqual(result["status"], "PASS")
        self.assertIn("Found 2 Virtual Networks", result["message"])

    @patch('app.integrations.azure.verifier.ComputeManagementClient')
    def test_probe_compute_auth_failed(self, mock_comp_client):
        # Mock 403 Error
        error = HttpResponseError("Authorization Failed")
        error.status_code = 403
        mock_comp_client.return_value.virtual_machines.list_all.side_effect = error

        result = self.verifier._probe_compute()
        
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["missing_permissions"], ["Microsoft.Compute/virtualMachines/read"])
        self.assertIn("Assign the 'Reader' role", result["suggested_policy_snippet"])

    @patch('app.integrations.azure.verifier.NetworkManagementClient')
    @patch('app.integrations.azure.verifier.ComputeManagementClient')
    def test_run_comprehensive_check(self, mock_comp, mock_net):
        mock_net.return_value.virtual_networks.list_all.return_value = []
        mock_comp.return_value.virtual_machines.list_all.return_value = []
        mock_net.return_value.public_ip_addresses.list_all.return_value = []
        mock_comp.return_value.disks.list.return_value = []

        results = self.verifier.run_comprehensive_check()
        
        self.assertEqual(len(results), 4)
        for r in results:
            self.assertEqual(r["status"], "PASS")

if __name__ == '__main__':
    unittest.main()
