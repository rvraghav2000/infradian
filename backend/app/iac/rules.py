"""Security guardrails (Checkov/tfsec-style) and policy-as-code, evaluated on parsed Terraform.

Both engines work offline on the *code*, so they run on every change.
Checkov can additionally run in Docker for its much larger rule set (see scan.run_checkov).
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Callable, Dict, List, Optional

from .catalog import CATALOG
from .parse import parse_files

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data"))
POLICY_FILE = os.path.join(DATA_DIR, "policies.json")

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
SECRET_ATTR = re.compile(r"(password|secret|token|api_key|private_key)", re.I)


def _resources(files: Dict[str, str]) -> List[Dict[str, Any]]:
    """Flatten parsed code to [{address, tf, attrs}] with catalog defaults applied."""
    out = []
    for n in parse_files(files)["nodes"]:
        spec = CATALOG.get(n["type"])
        tf = spec["tf"] if spec else n["type"]
        attrs = dict(spec["defaults"]) if spec else {}
        attrs.update(n["attributes"])
        out.append({"address": f"{tf}.{n['id'].split('.', 1)[1]}", "tf": tf, "attrs": attrs,
                    "label": n["label"], "node": n["id"]})
    return out


def _walk(v: Any):
    if isinstance(v, dict):
        for k, x in v.items():
            yield k, x
            yield from _walk(x)
    elif isinstance(v, list):
        for x in v:
            yield from _walk(x)


def _open_cidr(r: Dict[str, Any]) -> bool:
    return any(isinstance(x, str) and x in ("0.0.0.0/0", "::/0") for _, x in _walk(r["attrs"])) or \
        any(isinstance(x, str) and x in ("0.0.0.0/0", "::/0") for x in r["attrs"].values())


def _imdsv2(r):
    m = r["attrs"].get("metadata_options")
    return isinstance(m, dict) and m.get("http_tokens") == "required"


RULES: List[Dict[str, Any]] = [
    {"id": "INF-SEC-001", "severity": "critical", "title": "Hard-coded secret",
     "fix": "Reference a sensitive variable (var.x) instead of a literal.",
     "check": lambda r: [k for k, v in _walk(r["attrs"]) if SECRET_ATTR.search(str(k)) and isinstance(v, str) and v and not v.startswith("${")]},
    {"id": "INF-SEC-002", "severity": "high", "title": "Resource open to the internet (0.0.0.0/0)",
     "fix": "Restrict the CIDR to known ranges.", "check": lambda r: ["cidr"] if _open_cidr(r) else []},
    {"id": "INF-SEC-003", "severity": "high", "title": "Database storage not encrypted", "fix": "Set storage_encrypted = true.",
     "check": lambda r: ["storage_encrypted"] if r["tf"] == "aws_db_instance" and r["attrs"].get("storage_encrypted") is not True else []},
    {"id": "INF-SEC-004", "severity": "high", "title": "Database publicly accessible", "fix": "Set publicly_accessible = false.",
     "check": lambda r: ["publicly_accessible"] if r["tf"] == "aws_db_instance" and r["attrs"].get("publicly_accessible") is True else []},
    {"id": "INF-SEC-005", "severity": "medium", "title": "EC2 instance does not require IMDSv2",
     "fix": 'Add metadata_options { http_tokens = "required" }.',
     "check": lambda r: ["metadata_options"] if r["tf"] == "aws_instance" and not _imdsv2(r) else []},
    {"id": "INF-SEC-006", "severity": "medium", "title": "Object storage may be public", "fix": "Block public access on the bucket.",
     "check": lambda r: ["access"] if (r["tf"] == "oci_objectstorage_bucket" and r["attrs"].get("access_type") not in (None, "NoPublicAccess"))
     or (r["tf"] == "azurerm_storage_account" and r["attrs"].get("allow_nested_items_to_be_public") is True) else []},
    {"id": "INF-SEC-007", "severity": "medium", "title": "Deletion protection disabled", "fix": "Set deletion_protection = true.",
     "check": lambda r: ["deletion_protection"] if r["tf"] == "google_sql_database_instance" and r["attrs"].get("deletion_protection") is False else []},
    {"id": "INF-SEC-008", "severity": "low", "title": "Database has no backup retention", "fix": "Set backup_retention_period >= 7.",
     "check": lambda r: ["backup_retention_period"] if r["tf"] == "aws_db_instance" and not r["attrs"].get("backup_retention_period") else []},
]


def security_scan(files: Dict[str, str]) -> List[Dict[str, Any]]:
    findings = []
    for r in _resources(files):
        for rule in RULES:
            hits = rule["check"](r)
            if hits:
                findings.append({"rule": rule["id"], "severity": rule["severity"], "title": rule["title"],
                                 "resource": r["address"], "node": r["node"], "attribute": hits[0],
                                 "fix": rule["fix"], "engine": "infradian"})
    findings.sort(key=lambda f: (SEVERITY_ORDER[f["severity"]], f["resource"]))
    return findings


DEFAULT_POLICIES: List[Dict[str, Any]] = [
    {"id": "POL-001", "description": "Only approved EC2 instance types", "resource_types": ["aws_instance"],
     "attribute": "instance_type", "operator": "in",
     "value": ["t3.micro", "t3.small", "t3.medium", "t3.large", "m5.large"], "enforcement": "deny"},
    {"id": "POL-002", "description": "RDS must be encrypted", "resource_types": ["aws_db_instance"],
     "attribute": "storage_encrypted", "operator": "equals", "value": True, "enforcement": "deny"},
    {"id": "POL-003", "description": "OCI buckets must not be public", "resource_types": ["oci_objectstorage_bucket"],
     "attribute": "access_type", "operator": "equals", "value": "NoPublicAccess", "enforcement": "deny"},
    {"id": "POL-004", "description": "Resources should carry a Name tag",
     "resource_types": ["aws_instance", "aws_db_instance", "aws_lb"],
     "attribute": "tags.Name", "operator": "exists", "value": None, "enforcement": "warn"},
]


def load_policies() -> List[Dict[str, Any]]:
    if os.path.exists(POLICY_FILE):
        try:
            with open(POLICY_FILE) as f:
                return json.load(f)
        except (OSError, ValueError):
            pass
    return DEFAULT_POLICIES


def save_policies(policies: List[Dict[str, Any]]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(POLICY_FILE, "w") as f:
        json.dump(policies, f, indent=2)


def _get(attrs: Dict[str, Any], path: str) -> Any:
    cur: Any = attrs
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


OPS: Dict[str, Callable[[Any, Any], bool]] = {
    "equals": lambda a, v: a == v, "not_equals": lambda a, v: a != v,
    "in": lambda a, v: a in v, "not_in": lambda a, v: a not in v,
    "exists": lambda a, v: a is not None, "not_exists": lambda a, v: a is None,
    "matches": lambda a, v: isinstance(a, str) and re.search(v, a) is not None,
}


def evaluate_policies(files: Dict[str, str], policies: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    violations = []
    resources = _resources(files)
    for pol in (policies if policies is not None else load_policies()):
        op = OPS.get(pol.get("operator"))
        if not op:
            continue
        for r in resources:
            if r["tf"] not in pol.get("resource_types", []):
                continue
            actual = _get(r["attrs"], pol["attribute"])
            if isinstance(actual, str) and actual.startswith("${"):
                continue  # unknown until plan — can't judge a reference/variable
            if not op(actual, pol.get("value")):
                violations.append({"policy": pol["id"], "description": pol["description"], "resource": r["address"],
                                   "node": r["node"], "attribute": pol["attribute"], "actual": actual,
                                   "expected": f'{pol["operator"]} {pol.get("value")}',
                                   "enforcement": pol.get("enforcement", "warn")})
    return violations
