"""Monthly cost estimate.

Static, approximate on-demand list prices (USD/month, 730h) — good for *relative* budget
impact while designing. Set INFRACOST_API_KEY and the Infracost CLI image is used instead
(`infracost_breakdown`) for real pricing.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from typing import Any, Dict, List

from .parse import parse_files
from .catalog import CATALOG

HOURS = 730
EC2 = {"t3.micro": 0.0104, "t3.small": 0.0208, "t3.medium": 0.0416, "t3.large": 0.0832, "m5.large": 0.096, "m5.xlarge": 0.192, "c5.large": 0.085}
RDS = {"db.t3.micro": 0.017, "db.t3.small": 0.034, "db.t3.medium": 0.068, "db.m5.large": 0.171}
# flat monthly prices by Terraform type
FLAT = {
    "aws_lb": 16.4, "aws_elasticache_cluster": 12.4, "aws_s3_bucket": 2.3, "aws_route53_zone": 0.5,
    "aws_apigatewayv2_api": 3.5, "aws_cloudwatch_log_group": 3.0, "aws_lambda_function": 0.5,
    "azurerm_storage_account": 21.0, "azurerm_linux_virtual_machine": 8.0, "azurerm_postgresql_flexible_server": 24.0,
    "azurerm_kubernetes_cluster": 73.0,
    "google_compute_instance": 6.1, "google_storage_bucket": 2.0, "google_sql_database_instance": 26.0, "google_container_cluster": 73.0,
    "oci_core_instance": 14.0, "oci_objectstorage_bucket": 2.5, "oci_database_autonomous_database": 120.0, "oci_containerengine_cluster": 0.0,
}
FREE = {"aws_vpc", "aws_subnet", "aws_security_group", "aws_iam_role", "azurerm_resource_group", "azurerm_virtual_network",
        "azurerm_subnet", "google_compute_network", "google_compute_subnetwork", "oci_core_vcn", "oci_core_subnet"}


def _price(tf: str, a: Dict[str, Any]) -> float:
    if tf == "aws_instance":
        return round(EC2.get(a.get("instance_type", "t3.micro"), 0.05) * HOURS, 2)
    if tf == "aws_db_instance":
        compute = RDS.get(a.get("instance_class", "db.t3.micro"), 0.1) * HOURS
        storage = float(a.get("allocated_storage", 20) if isinstance(a.get("allocated_storage", 20), (int, float)) else 20) * 0.115
        return round(compute + storage, 2)
    return FLAT.get(tf, 0.0)


def estimate(files: Dict[str, str]) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    for n in parse_files(files)["nodes"]:
        spec = CATALOG.get(n["type"])
        tf = spec["tf"] if spec else n["type"]
        attrs = dict(spec["defaults"]) if spec else {}
        attrs.update(n["attributes"])
        if tf in FREE:
            continue
        items.append({"resource": f"{tf}.{n['id'].split('.', 1)[1]}", "node": n["id"], "label": n["label"],
                      "monthly": _price(tf, attrs), "known": tf in FLAT or tf in ("aws_instance", "aws_db_instance")})
    by_provider: Dict[str, float] = {}
    for it in items:
        p = it["resource"].split("_")[0]
        by_provider[p] = round(by_provider.get(p, 0) + it["monthly"], 2)
    items.sort(key=lambda i: -i["monthly"])
    return {"currency": "USD", "monthly_total": round(sum(i["monthly"] for i in items), 2), "items": items,
            "by_provider": by_provider, "source": "static-estimate",
            "note": "Approximate list prices for relative comparison. Set INFRACOST_API_KEY for Infracost pricing."}


def infracost_breakdown(files: Dict[str, str]) -> Dict[str, Any]:
    """Real pricing through the Infracost CLI image. Requires INFRACOST_API_KEY and Docker."""
    key = os.environ.get("INFRACOST_API_KEY")
    if not key:
        raise RuntimeError("INFRACOST_API_KEY is not set")
    with tempfile.TemporaryDirectory() as d:
        for name, content in files.items():
            with open(os.path.join(d, os.path.basename(name)), "w") as f:
                f.write(content)
        out = subprocess.run(["docker", "run", "--rm", "-e", "INFRACOST_API_KEY", "-v", f"{d}:/code:ro",
                              "infracost/infracost:ci-0.10", "breakdown", "--path", "/code", "--format", "json"],
                             capture_output=True, text=True, timeout=300, env={**os.environ})
        if out.returncode != 0:
            raise RuntimeError(out.stderr[-500:])
        data = json.loads(out.stdout)
        return {"currency": data.get("currency", "USD"), "monthly_total": float(data.get("totalMonthlyCost") or 0),
                "items": [{"resource": r["name"], "monthly": float(r.get("monthlyCost") or 0), "known": True}
                          for p in data.get("projects", []) for r in p.get("breakdown", {}).get("resources", [])],
                "source": "infracost"}
