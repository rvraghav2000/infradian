import logging
import json
from typing import List, Optional, Tuple, Dict
from google.oauth2 import service_account
from google.cloud import compute_v1
from google.api_core.exceptions import PermissionDenied, Unauthenticated

logger = logging.getLogger(__name__)

class GCPVerifier:
    """
    Diagnostic service for GCP connectivity and permissions.
    """

    def __init__(self, service_account_info: dict, project_id: Optional[str] = None):
        self.credentials = service_account.Credentials.from_service_account_info(service_account_info)
        self.project_id = project_id or service_account_info.get("project_id")
        self.account_id = self.project_id

    def verify_identity(self) -> Tuple[bool, str]:
        """Validate connection by attempting to access project info."""
        try:
            # We use InstancesClient as a proxy to verify project access
            client = compute_v1.InstancesClient(credentials=self.credentials)
            # Just a minimal call to verify if project exists and is accessible
            client.aggregated_list(project=self.project_id, max_results=1)
            return True, f"Identity verified for project: {self.project_id}"
        except Unauthenticated:
            return False, "Invalid Service Account credentials."
        except PermissionDenied:
            return False, f"Permission Denied accessing project: {self.project_id}"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    def _probe_networking(self) -> Dict:
        """Probe VPC Networks."""
        try:
            client = compute_v1.NetworksClient(credentials=self.credentials)
            networks = list(client.list(project=self.project_id))
            return {
                "service": "Networking (VPC)",
                "status": "PASS",
                "message": f"Found {len(networks)} VPC Networks.",
                "missing_permissions": [],
                "suggested_policy_snippet": None
            }
        except PermissionDenied:
            return self._handle_error("Networking (VPC)", "compute.networks.list", "Compute Network Viewer")

    def _probe_compute(self) -> Dict:
        """Probe Compute Engine instances."""
        try:
            client = compute_v1.InstancesClient(credentials=self.credentials)
            # aggregated_list returns a pager of (zone, zone_instances)
            pager = client.aggregated_list(project=self.project_id, max_results=5)
            count = 0
            for zone, zone_instances in pager:
                count += len(zone_instances.instances)
                if count >= 10: break
            
            return {
                "service": "Compute (GCE)",
                "status": "PASS",
                "message": f"Found {count}+ instances across zones.",
                "missing_permissions": [],
                "suggested_policy_snippet": None
            }
        except PermissionDenied:
            return self._handle_error("Compute (GCE)", "compute.instances.list", "Compute Viewer")

    def _probe_ghost_assets(self) -> List[Dict]:
        """Probe Orphaned Disks and Unattached Static IPs."""
        results = []
        
        # Disks
        try:
            client = compute_v1.DisksClient(credentials=self.credentials)
            pager = client.aggregated_list(project=self.project_id)
            orphaned_count = 0
            for zone, zone_disks in pager:
                # Disk is orphaned if users list is empty
                orphaned_count += len([d for d in zone_disks.disks if not d.users])
            
            results.append({
                "service": "Ghost Assets (Disks)",
                "status": "PASS",
                "message": f"Found {orphaned_count} orphaned Persistent Disks.",
                "missing_permissions": [],
                "suggested_policy_snippet": None
            })
        except PermissionDenied:
            results.append(self._handle_error("Ghost Assets (Disks)", "compute.disks.list", "Compute Viewer"))

        # Static IPs
        try:
            client = compute_v1.AddressesClient(credentials=self.credentials)
            pager = client.aggregated_list(project=self.project_id)
            unattached_count = 0
            for region, region_addresses in pager:
                # Unattached if status is RESERVED (not IN_USE)
                unattached_count += len([a for a in region_addresses.addresses if a.status == "RESERVED"])
            
            results.append({
                "service": "Ghost Assets (IPs)",
                "status": "PASS",
                "message": f"Found {unattached_count} unattached Static IPs.",
                "missing_permissions": [],
                "suggested_policy_snippet": None
            })
        except PermissionDenied:
            results.append(self._handle_error("Ghost Assets (IPs)", "compute.addresses.list", "Compute Network Viewer"))

        return results

    def _handle_error(self, service_label: str, permission: str, suggested_role: str) -> Dict:
        """Standard error handler for GCP diagnostic probes."""
        return {
            "service": service_label,
            "status": "FAIL",
            "message": f"Permission Denied: {permission}",
            "missing_permissions": [permission],
            "suggested_policy_snippet": f"Add the '{suggested_role}' role to your service account at the Project level."
        }

    def run_comprehensive_check(self) -> List[Dict]:
        """Run all GCP probes."""
        checks = []
        checks.append(self._probe_networking())
        checks.append(self._probe_compute())
        checks.extend(self._probe_ghost_assets())
        return checks
