import logging
from typing import List, Optional, Tuple, Dict
from azure.identity import ClientSecretCredential
from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.network import NetworkManagementClient
from azure.mgmt.compute import ComputeManagementClient
from azure.core.exceptions import HttpResponseError

logger = logging.getLogger(__name__)

class AzureVerifier:
    """
    Diagnostic service for Azure connectivity and permissions.
    """

    def __init__(self, tenant_id: str, client_id: str, client_secret: str, subscription_id: Optional[str] = None):
        self.credential = ClientSecretCredential(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret
        )
        self.subscription_id = subscription_id
        self.account_id = subscription_id  # Azure uses subscription_id as the primary account reference

    def verify_identity(self) -> Tuple[bool, str]:
        """Validate connection by listing subscriptions."""
        try:
            sub_client = SubscriptionClient(self.credential)
            subs = list(sub_client.subscriptions.list())
            if not subs:
                return False, "Tenant verified, but no active subscriptions found."
            
            # If no subscription_id was provided, pick the first one
            if not self.subscription_id:
                self.subscription_id = subs[0].subscription_id
                self.account_id = self.subscription_id
            
            return True, f"Identity verified. Found {len(subs)} subscriptions."
        except HttpResponseError as e:
            if e.status_code == 401:
                return False, "Invalid Client ID or Client Secret."
            return False, f"Identity check failed: {e.message}"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    def _probe_networking(self) -> Dict:
        """Probe Virtual Networks."""
        try:
            client = NetworkManagementClient(self.credential, self.subscription_id)
            vnets = list(client.virtual_networks.list_all())
            return {
                "service": "Networking (VNet)",
                "status": "PASS",
                "message": f"Found {len(vnets)} Virtual Networks.",
                "missing_permissions": [],
                "suggested_policy_snippet": None
            }
        except HttpResponseError as e:
            return self._handle_error("Networking (VNet)", e, "Microsoft.Network/virtualNetworks/read")

    def _probe_compute(self) -> Dict:
        """Probe Virtual Machines."""
        try:
            client = ComputeManagementClient(self.credential, self.subscription_id)
            vms = list(client.virtual_machines.list_all())
            return {
                "service": "Compute (VM)",
                "status": "PASS",
                "message": f"Found {len(vms)} Virtual Machines.",
                "missing_permissions": [],
                "suggested_policy_snippet": None
            }
        except HttpResponseError as e:
            return self._handle_error("Compute (VM)", e, "Microsoft.Compute/virtualMachines/read")

    def _probe_ghost_assets(self) -> List[Dict]:
        """Probe Unattached Public IPs and Managed Disks."""
        results = []
        
        # Public IPs
        try:
            net_client = NetworkManagementClient(self.credential, self.subscription_id)
            ips = list(net_client.public_ip_addresses.list_all())
            unattached_ips = [ip for ip in ips if not ip.ip_configuration]
            results.append({
                "service": "Ghost Assets (IPs)",
                "status": "PASS",
                "message": f"Found {len(unattached_ips)} unattached Public IPs.",
                "missing_permissions": [],
                "suggested_policy_snippet": None
            })
        except HttpResponseError as e:
            results.append(self._handle_error("Ghost Assets (IPs)", e, "Microsoft.Network/publicIPAddresses/read"))

        # Managed Disks
        try:
            comp_client = ComputeManagementClient(self.credential, self.subscription_id)
            disks = list(comp_client.disks.list())
            unattached_disks = [d for d in disks if not d.managed_by]
            results.append({
                "service": "Ghost Assets (Disks)",
                "status": "PASS",
                "message": f"Found {len(unattached_disks)} unattached Managed Disks.",
                "missing_permissions": [],
                "suggested_policy_snippet": None
            })
        except HttpResponseError as e:
            results.append(self._handle_error("Ghost Assets (Disks)", e, "Microsoft.Compute/disks/read"))

        return results

    def _handle_error(self, service_label: str, error: HttpResponseError, action: str) -> Dict:
        """Standard error handler for Azure diagnostic probes."""
        if error.status_code == 403:
            return {
                "service": service_label,
                "status": "FAIL",
                "message": "Authorization Failed (403)",
                "missing_permissions": [action],
                "suggested_policy_snippet": "Assign the 'Reader' role at the Subscription level or relevant Resource Group."
            }
        return {
            "service": service_label,
            "status": "FAIL",
            "message": f"Service error: {error.message}",
            "missing_permissions": [],
            "suggested_policy_snippet": None
        }

    def run_comprehensive_check(self) -> List[Dict]:
        """Run all Azure probes."""
        if not self.subscription_id:
            return []
            
        checks = []
        checks.append(self._probe_networking())
        checks.append(self._probe_compute())
        checks.extend(self._probe_ghost_assets())
        return checks
