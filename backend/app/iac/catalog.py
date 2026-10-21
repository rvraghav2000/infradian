"""Multi-cloud resource catalog.

Single source of truth for: which canvas node types exist per provider, which Terraform
resource they generate, how containment (parentId) and drawn edges turn into
Terraform references, and which attributes must become variables when unresolved.

Spec fields
  tf        real Terraform resource type (canvas pseudo-types map onto it)
  parent    {"types": [...], "attrs": {attr: suffix}}  — parentId => `attr = <parent>.<suffix>`
  links     {target_type: (attr, "single" | "list", suffix)} — an edge src→dst sets `attr` on src
  defaults  attributes emitted when the user has not set them (a "=" prefix means raw HCL expr)
  required  attr -> {"var": name, "type": "string", "sensitive": bool, "description": str}
            emitted as `attr = var.<name>` and registered as a variable when not satisfied elsewhere
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

PROVIDERS: Dict[str, Dict[str, Any]] = {
    "aws": {"source": "hashicorp/aws", "version": "~> 5.0", "label": "AWS", "prefixes": ["aws_"]},
    "azure": {"source": "hashicorp/azurerm", "version": "~> 4.0", "label": "Azure", "prefixes": ["azurerm_"]},
    "gcp": {"source": "hashicorp/google", "version": "~> 6.0", "label": "GCP", "prefixes": ["google_"]},
    "oci": {"source": "oracle/oci", "version": "~> 6.0", "label": "OCI", "prefixes": ["oci_"]},
}

PROVIDER_LOCAL_NAME = {"aws": "aws", "azure": "azurerm", "gcp": "google", "oci": "oci"}


def _r(provider, tf, label, category, icon, defaults=None, parent=None, links=None, required=None, nested=False):
    return {
        "provider": provider, "tf": tf, "label": label, "category": category, "icon": icon,
        "defaults": defaults or {}, "parent": parent, "links": links or {}, "required": required or {},
        "nested": nested,
    }


CATALOG: Dict[str, Dict[str, Any]] = {
    # ── AWS ──────────────────────────────────────────────────────────
    "aws_vpc": _r("aws", "aws_vpc", "VPC", "region", "🌐",
                  {"cidr_block": "10.0.0.0/16", "enable_dns_hostnames": True}, nested=True),
    "aws_subnet": _r("aws", "aws_subnet", "Subnet", "region", "📦", {"cidr_block": "10.0.1.0/24"},
                     parent={"types": ["aws_vpc"], "attrs": {"vpc_id": "id"}}, nested=True),
    "aws_security_group": _r("aws", "aws_security_group", "Security Group", "security", "🛡️",
                             {"description": "Managed by Infradian"},
                             parent={"types": ["aws_vpc"], "attrs": {"vpc_id": "id"}}),
    "aws_iam_role": _r("aws", "aws_iam_role", "IAM Role", "security", "🔑",
                       {"assume_role_policy": "=jsonencode({Version = \"2012-10-17\", Statement = [{Action = \"sts:AssumeRole\", Effect = \"Allow\", Principal = {Service = \"lambda.amazonaws.com\"}}]})"}),
    "aws_instance": _r("aws", "aws_instance", "EC2 Instance", "compute", "🖥️",
                       {"ami": "ami-0c02fb55956c7d316", "instance_type": "t3.micro"},
                       parent={"types": ["aws_subnet"], "attrs": {"subnet_id": "id"}},
                       links={"aws_security_group": ("vpc_security_group_ids", "list", "id")}),
    "aws_lambda": _r("aws", "aws_lambda_function", "Lambda", "compute", "⚡",
                     {"runtime": "python3.12", "handler": "main.handler", "filename": "lambda.zip"},
                     links={"aws_iam_role": ("role", "single", "arn")},
                     required={"role": {"var": "lambda_role_arn", "type": "string", "description": "IAM role ARN for the Lambda"}}),
    "aws_alb": _r("aws", "aws_lb", "Load Balancer", "network", "⚖️",
                  {"load_balancer_type": "application", "internal": False},
                  parent={"types": ["aws_subnet"], "attrs": {"subnets": "id"}},
                  links={"aws_security_group": ("security_groups", "list", "id")}),
    "aws_db_instance": _r("aws", "aws_db_instance", "RDS", "data", "🗄️",
                          {"engine": "postgres", "instance_class": "db.t3.micro", "allocated_storage": 20,
                           "skip_final_snapshot": True, "storage_encrypted": True},
                          links={"aws_security_group": ("vpc_security_group_ids", "list", "id")},
                          required={"password": {"var": "db_password", "type": "string", "sensitive": True,
                                                 "description": "Master password for the database"},
                                    "username": {"var": "db_username", "type": "string", "description": "Master username"}}),
    "aws_elasticache": _r("aws", "aws_elasticache_cluster", "ElastiCache", "data", "⚡",
                          {"engine": "redis", "node_type": "cache.t3.micro", "num_cache_nodes": 1}),
    "aws_s3": _r("aws", "aws_s3_bucket", "S3 Bucket", "data", "📁", {},
                 required={"bucket": {"var": "bucket_name", "type": "string", "description": "Globally unique bucket name"}}),
    "aws_route53": _r("aws", "aws_route53_zone", "Route 53 Zone", "network", "🔀", {}, required={"name": {"var": "domain_name", "type": "string", "description": "DNS zone name"}}),
    "aws_api_gateway": _r("aws", "aws_apigatewayv2_api", "API Gateway", "network", "🚪", {"protocol_type": "HTTP"}),
    "aws_cloudwatch": _r("aws", "aws_cloudwatch_log_group", "Log Group", "observability", "📊", {"retention_in_days": 30}),
    # ── Azure ────────────────────────────────────────────────────────
    "azurerm_resource_group": _r("azure", "azurerm_resource_group", "Resource Group", "region", "🧩", {"location": "eastus"}, nested=True),
    "azurerm_virtual_network": _r("azure", "azurerm_virtual_network", "Virtual Network", "region", "🌐",
                                  {"address_space": ["10.1.0.0/16"]},
                                  parent={"types": ["azurerm_resource_group"], "attrs": {"resource_group_name": "name", "location": "location"}}, nested=True),
    "azurerm_subnet": _r("azure", "azurerm_subnet", "Subnet", "region", "📦", {"address_prefixes": ["10.1.1.0/24"]},
                         parent={"types": ["azurerm_virtual_network"], "attrs": {"virtual_network_name": "name"}}, nested=True),
    "azurerm_storage_account": _r("azure", "azurerm_storage_account", "Storage Account", "data", "📁",
                                  {"account_tier": "Standard", "account_replication_type": "LRS"},
                                  parent={"types": ["azurerm_resource_group"], "attrs": {"resource_group_name": "name", "location": "location"}},
                                  required={"name": {"var": "storage_account_name", "type": "string", "description": "Globally unique storage account name"}}),
    "azurerm_linux_virtual_machine": _r("azure", "azurerm_linux_virtual_machine", "Virtual Machine", "compute", "🖥️",
                                        {"size": "Standard_B1s", "admin_username": "azureuser"},
                                        parent={"types": ["azurerm_resource_group"], "attrs": {"resource_group_name": "name", "location": "location"}}),
    "azurerm_postgresql_flexible_server": _r("azure", "azurerm_postgresql_flexible_server", "PostgreSQL Flexible", "data", "🗄️",
                                             {"sku_name": "B_Standard_B1ms", "version": "16", "storage_mb": 32768},
                                             parent={"types": ["azurerm_resource_group"], "attrs": {"resource_group_name": "name", "location": "location"}},
                                             required={"administrator_password": {"var": "pg_admin_password", "type": "string", "sensitive": True, "description": "PostgreSQL admin password"}}),
    "azurerm_kubernetes_cluster": _r("azure", "azurerm_kubernetes_cluster", "AKS Cluster", "compute", "⎈",
                                     {"dns_prefix": "infradian"},
                                     parent={"types": ["azurerm_resource_group"], "attrs": {"resource_group_name": "name", "location": "location"}}),
    # ── GCP ──────────────────────────────────────────────────────────
    "google_compute_network": _r("gcp", "google_compute_network", "VPC Network", "region", "🌐", {"auto_create_subnetworks": False}, nested=True),
    "google_compute_subnetwork": _r("gcp", "google_compute_subnetwork", "Subnetwork", "region", "📦",
                                    {"ip_cidr_range": "10.2.0.0/24", "region": "us-central1"},
                                    parent={"types": ["google_compute_network"], "attrs": {"network": "id"}}, nested=True),
    "google_compute_instance": _r("gcp", "google_compute_instance", "Compute Engine VM", "compute", "🖥️",
                                  {"machine_type": "e2-micro", "zone": "us-central1-a"},
                                  parent={"types": ["google_compute_subnetwork"], "attrs": {}}),
    "google_storage_bucket": _r("gcp", "google_storage_bucket", "Cloud Storage", "data", "📁", {"location": "US"},
                                required={"name": {"var": "gcs_bucket_name", "type": "string", "description": "Globally unique bucket name"}}),
    "google_sql_database_instance": _r("gcp", "google_sql_database_instance", "Cloud SQL", "data", "🗄️",
                                       {"database_version": "POSTGRES_16", "region": "us-central1", "deletion_protection": True}),
    "google_container_cluster": _r("gcp", "google_container_cluster", "GKE Cluster", "compute", "⎈",
                                   {"location": "us-central1", "initial_node_count": 1}),
    # ── OCI ──────────────────────────────────────────────────────────
    "oci_core_vcn": _r("oci", "oci_core_vcn", "VCN", "region", "🌐", {"cidr_blocks": ["10.3.0.0/16"]},
                       required={"compartment_id": {"var": "compartment_ocid", "type": "string", "description": "OCI compartment OCID"}}, nested=True),
    "oci_core_subnet": _r("oci", "oci_core_subnet", "Subnet", "region", "📦", {"cidr_block": "10.3.1.0/24"},
                          parent={"types": ["oci_core_vcn"], "attrs": {"vcn_id": "id"}},
                          required={"compartment_id": {"var": "compartment_ocid", "type": "string", "description": "OCI compartment OCID"}}, nested=True),
    "oci_core_instance": _r("oci", "oci_core_instance", "Compute Instance", "compute", "🖥️",
                            {"shape": "VM.Standard.E4.Flex"},
                            required={"compartment_id": {"var": "compartment_ocid", "type": "string", "description": "OCI compartment OCID"},
                                      "availability_domain": {"var": "availability_domain", "type": "string", "description": "Availability domain name"}}),
    "oci_objectstorage_bucket": _r("oci", "oci_objectstorage_bucket", "Object Storage", "data", "📁", {"access_type": "NoPublicAccess"},
                                   required={"compartment_id": {"var": "compartment_ocid", "type": "string", "description": "OCI compartment OCID"},
                                             "namespace": {"var": "os_namespace", "type": "string", "description": "Object Storage namespace"},
                                             "name": {"var": "oci_bucket_name", "type": "string", "description": "Bucket name"}}),
    "oci_database_autonomous_database": _r("oci", "oci_database_autonomous_database", "Autonomous DB", "data", "🗄️",
                                           {"db_workload": "OLTP", "cpu_core_count": 1, "data_storage_size_in_tbs": 1},
                                           required={"compartment_id": {"var": "compartment_ocid", "type": "string", "description": "OCI compartment OCID"},
                                                     "admin_password": {"var": "adb_admin_password", "type": "string", "sensitive": True, "description": "ADB admin password"}}),
    "oci_containerengine_cluster": _r("oci", "oci_containerengine_cluster", "OKE Cluster", "compute", "⎈", {},
                                      required={"compartment_id": {"var": "compartment_ocid", "type": "string", "description": "OCI compartment OCID"}}),
}

# real Terraform type -> canvas type (inverse map, used when importing code)
TF_TO_CANVAS: Dict[str, str] = {spec["tf"]: key for key, spec in CATALOG.items()}


def provider_of(type_name: str) -> Optional[str]:
    for pid, p in PROVIDERS.items():
        if any(type_name.startswith(pre) for pre in p["prefixes"]):
            return pid
    return None


def tf_type(canvas_type: str) -> Optional[str]:
    spec = CATALOG.get(canvas_type)
    return spec["tf"] if spec else None


def public_catalog() -> List[Dict[str, Any]]:
    return [{"type": k, "provider": v["provider"], "tf": v["tf"], "label": v["label"],
             "category": v["category"], "icon": v["icon"], "container": v["nested"],
             "links": {t: spec[0] for t, spec in v["links"].items()},
             "defaults": {a: d for a, d in v["defaults"].items() if not (isinstance(d, str) and d.startswith("="))}}
            for k, v in CATALOG.items()]
