"""Graph → Terraform / OpenTofu code.

Deterministic, so the same canvas always yields byte-identical files (clean diffs in git).
Containment (parentId) and drawn edges become real resource references
(`vpc_id = aws_vpc.main.id`), and unresolved required attributes become variables.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from .catalog import CATALOG, PROVIDERS, PROVIDER_LOCAL_NAME, provider_of

_NAME_RE = re.compile(r"[^a-zA-Z0-9_]+")


def slug(text: str) -> str:
    s = _NAME_RE.sub("_", text.strip()).strip("_").lower() or "res"
    return "r_" + s if s[0].isdigit() else s


def hcl_value(v: Any, indent: int = 0) -> str:
    """Render a Python value as HCL. `${expr}` and `=expr` strings are raw expressions."""
    pad = "  " * (indent + 1)
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        if v.startswith("="):
            return v[1:]
        m = re.fullmatch(r"\$\{(.+)\}", v, re.S)
        if m:
            return m.group(1)
        return json.dumps(v).replace("${", "$${")
    if isinstance(v, list):
        if not v:
            return "[]"
        if all(not isinstance(i, (dict, list)) for i in v):
            return "[" + ", ".join(hcl_value(i) for i in v) + "]"
        return "[\n" + "".join(f"{pad}{hcl_value(i, indent + 1)},\n" for i in v) + "  " * indent + "]"
    if isinstance(v, dict):
        if not v:
            return "{}"
        lines = [f"{pad}{k if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]*', str(k)) else json.dumps(k)} = {hcl_value(x, indent + 1)}"
                 for k, x in v.items()]
        return "{\n" + "\n".join(lines) + "\n" + "  " * indent + "}"
    return json.dumps(str(v))


def render_block(key: str, val: Dict[str, Any], depth: int = 1) -> str:
    pad = "  " * depth
    lines = [f"{pad}{key} {{"]
    for k, v in val.items():
        if k in BLOCK_ATTRS and isinstance(v, dict):
            lines.append(render_block(k, v, depth + 1))
        else:
            lines.append(f"{pad}  {k} = {hcl_value(v, depth + 1)}")
    lines.append(f"{pad}}}")
    return "\n".join(lines)


def order_attrs(attrs: Dict[str, Any], spec: Dict[str, Any], name_attr: Optional[str]) -> Dict[str, Any]:
    """Canonical attribute order so generate(parse(code)) == code."""
    first = ([name_attr] if name_attr else []) + list(spec["defaults"]) + list(spec["required"]) + \
        list((spec["parent"] or {}).get("attrs", {})) + [v[0] for v in spec["links"].values()]
    keys = [k for k in dict.fromkeys(first) if k in attrs]
    rest = [k for k in attrs if k not in keys and k != "tags" and k not in BLOCK_ATTRS]
    tail = [k for k in attrs if k == "tags" or k in BLOCK_ATTRS]
    return {k: attrs[k] for k in keys + rest + sorted(tail, key=lambda k: (k != "tags" and False, k))}


def assign_names(nodes: List[Dict[str, Any]]) -> Dict[str, str]:
    """Stable, unique-per-type Terraform names. `type.name` ids keep their name."""
    names: Dict[str, str] = {}
    taken: Dict[str, set] = {}
    for n in nodes:  # already sorted by id
        src = n.get("tf_name") or (n["id"].split(".", 1)[1] if re.match(r"^[a-z0-9]+_\w+\.", n["id"]) else (n.get("label") or n["id"]))
        base = slug(src)
        seen = taken.setdefault(n["type"], set())
        name, i = base, 2
        while name in seen:
            name, i = f"{base}_{i}", i + 1
        seen.add(name)
        names[n["id"]] = name
    return names


# Attribute carrying the resource's display name for providers that require one.
NAME_ATTR = {"aws_lambda": "function_name", "azure": "name", "gcp": "name", "oci_core_vcn": "display_name",
             "oci_core_subnet": "display_name", "oci_core_instance": "display_name",
             "oci_containerengine_cluster": "name"}

BLOCK_ATTRS = {"boot_disk", "network_interface", "initialize_params"}


def generate(graph: Dict[str, Any], tool: str = "terraform") -> Dict[str, Any]:
    """graph = {nodes, edges, variables, outputs, locals}. Returns {files, warnings, resources}."""
    nodes: List[Dict[str, Any]] = graph.get("nodes", [])
    edges: List[Dict[str, Any]] = graph.get("edges", [])
    user_vars: List[Dict[str, Any]] = graph.get("variables", [])
    outputs: List[Dict[str, Any]] = graph.get("outputs", [])
    locals_: Dict[str, Any] = graph.get("locals", {}) or {}

    warnings: List[str] = []
    by_id = {n["id"]: n for n in nodes}
    order = {k: i for i, k in enumerate(CATALOG)}
    gen_nodes = sorted((n for n in nodes if n["type"] in CATALOG), key=lambda n: (order[n["type"]], n["id"]))
    used = assign_names(gen_nodes)
    for n in nodes:
        if n["type"] not in CATALOG:
            warnings.append(f"'{n.get('label', n['id'])}' ({n['type']}) has no Terraform generator — skipped.")
    def addr(n: Dict[str, Any]) -> str:
        return f"{CATALOG[n['type']]['tf']}.{used[n['id']]}"

    auto_vars: Dict[str, Dict[str, Any]] = {}
    blocks: List[Tuple[str, str]] = []  # (provider, hcl)
    providers_used = set()

    for n in gen_nodes:
        spec = CATALOG[n["type"]]
        providers_used.add(spec["provider"])
        attrs: Dict[str, Any] = {}
        for k, v in spec["defaults"].items():
            attrs[k] = v
        # user-set attributes win over defaults
        for k, v in (n.get("attributes") or {}).items():
            if k in ("spawnX", "spawnY") or v is None:
                continue
            attrs[k] = v
        refs_set = set()

        # containment → reference
        pid = n.get("parentId") or n.get("parent_id")
        parent = by_id.get(pid) if pid else None
        if parent and parent["type"] in CATALOG and spec["parent"] and parent["type"] in spec["parent"]["types"]:
            for attr, suffix in spec["parent"]["attrs"].items():
                ref = f"${{{addr(parent)}.{suffix}}}"
                attrs[attr] = [ref] if attr in ("subnets",) else ref
                refs_set.add(attr)
        # drawn edges → reference
        for e in edges:
            if e.get("source") != n["id"]:
                continue
            tgt = by_id.get(e.get("target"))
            if not tgt or tgt["type"] not in spec["links"]:
                continue
            attr, mode, suffix = spec["links"][tgt["type"]]
            ref = f"${{{addr(tgt)}.{suffix}}}"
            if mode == "list":
                cur = attrs.get(attr) if isinstance(attrs.get(attr), list) and attr in refs_set else []
                attrs[attr] = cur + [ref]
            else:
                attrs[attr] = ref
            refs_set.add(attr)
        # unresolved required → variables
        for attr, req in spec["required"].items():
            if attr in refs_set or (attr in (n.get("attributes") or {}) and n["attributes"][attr] is not None):
                continue
            attrs[attr] = f"${{var.{req['var']}}}"
            auto_vars.setdefault(req["var"], {"name": req["var"], "type": req.get("type", "string"),
                                              "description": req.get("description", ""), "sensitive": req.get("sensitive", False)})
        extra = ""
        if n["type"] == "google_compute_instance":
            sub = f'${{{addr(parent)}.id}}' if parent and parent["type"] == "google_compute_subnetwork" else None
            attrs.setdefault("boot_disk", {"initialize_params": {"image": "debian-cloud/debian-12"}})
            attrs["network_interface"] = {"subnetwork": sub} if sub else {"network": "default"}
        if n["type"] == "azurerm_linux_virtual_machine":
            warnings.append(f"{addr(n)}: add a network_interface_ids, os_disk and admin_ssh_key before apply.")

        label = n.get("label")
        name_attr = NAME_ATTR.get(n["type"]) or NAME_ATTR.get(spec["provider"])
        if name_attr and name_attr not in attrs and label:
            attrs[name_attr] = slug(label).replace("_", "-")
        body = [f'resource "{spec["tf"]}" "{used[n["id"]]}" {{']
        if label and "name" not in attrs and "tags" not in attrs:
            if n["type"].startswith("aws_") and n["type"] not in ("aws_route53", "aws_cloudwatch"):
                attrs["tags"] = {"Name": label}
        for k, v in order_attrs(attrs, spec, name_attr).items():
            if k in BLOCK_ATTRS and isinstance(v, dict):
                body.append(render_block(k, v))
            else:
                body.append(f"  {k} = {hcl_value(v, 1)}")
        body.append("}")
        blocks.append((spec["provider"], "\n".join(body) + extra))

    # ── files ────────────────────────────────────────────────────
    is_tofu = tool == "opentofu"
    rp = "\n".join(
        f'    {PROVIDER_LOCAL_NAME[p]} = {{\n      source  = "{PROVIDERS[p]["source"]}"\n      version = "{PROVIDERS[p]["version"]}"\n    }}'
        for p in sorted(providers_used))
    header = f"# Generated by Infradian ({'OpenTofu' if is_tofu else 'Terraform'}). Edit here or on the canvas — they stay in sync.\n"
    versions = header + ("terraform {\n  required_version = \">= 1.6.0\"\n" if is_tofu else "terraform {\n  required_version = \">= 1.5.0\"\n") + \
        (f"  required_providers {{\n{rp}\n  }}\n" if rp else "") + "}\n"

    prov_blocks = []
    for p in sorted(providers_used):
        if p == "aws":
            auto_vars.setdefault("aws_region", {"name": "aws_region", "type": "string", "default": "us-east-1", "description": "AWS region"})
            prov_blocks.append('provider "aws" {\n  region = var.aws_region\n}')
        elif p == "azure":
            prov_blocks.append('provider "azurerm" {\n  features {}\n}')
        elif p == "gcp":
            auto_vars.setdefault("gcp_project", {"name": "gcp_project", "type": "string", "description": "GCP project id"})
            prov_blocks.append('provider "google" {\n  project = var.gcp_project\n  region  = "us-central1"\n}')
        elif p == "oci":
            auto_vars.setdefault("oci_region", {"name": "oci_region", "type": "string", "default": "us-ashburn-1", "description": "OCI region"})
            prov_blocks.append('provider "oci" {\n  region = var.oci_region\n}')
    providers_tf = "\n\n".join(prov_blocks) + ("\n" if prov_blocks else "")

    # variables: user-defined first (they win), then auto ones
    all_vars = {v["name"]: v for v in user_vars if v.get("name")}
    for name, v in auto_vars.items():
        all_vars.setdefault(name, v)
    var_hcl = []
    for name in sorted(all_vars):
        v = all_vars[name]
        lines = [f'variable "{name}" {{', f'  type        = {v.get("type") or "string"}']
        if v.get("description"):
            lines.append(f'  description = {json.dumps(v["description"])}')
        if v.get("default") not in (None, ""):
            d = v["default"]
            if isinstance(d, str) and (v.get("type") or "string") != "string":
                try:
                    d = json.loads(d)
                except ValueError:
                    pass
            lines.append(f'  default     = {hcl_value(d, 1)}')
        if v.get("sensitive"):
            lines.append("  sensitive   = true")
        lines.append("}")
        var_hcl.append("\n".join(lines))

    locals_hcl = ""
    if locals_:
        locals_hcl = "locals {\n" + "\n".join(f"  {k} = {hcl_value(v, 1)}" for k, v in locals_.items()) + "\n}\n"

    out_hcl = []
    for o in outputs:
        if not o.get("name") or not o.get("value"):
            continue
        val = o["value"]
        val = val if re.fullmatch(r"\$\{.+\}", val) else "${" + val + "}"
        lines = [f'output "{o["name"]}" {{', f"  value = {hcl_value(val)}"]
        if o.get("description"):
            lines.append(f'  description = {json.dumps(o["description"])}')
        if o.get("sensitive"):
            lines.append("  sensitive = true")
        lines.append("}")
        out_hcl.append("\n".join(lines))

    files = {"versions.tf": versions}
    if providers_tf:
        files["providers.tf"] = providers_tf
    files["main.tf"] = (locals_hcl + ("\n" if locals_hcl and blocks else "") + "\n\n".join(b for _, b in blocks) + "\n") if (blocks or locals_hcl) else "# Empty canvas — drag resources onto the canvas.\n"
    if var_hcl:
        files["variables.tf"] = "\n\n".join(var_hcl) + "\n"
    if out_hcl:
        files["outputs.tf"] = "\n\n".join(out_hcl) + "\n"
    return {"files": files, "warnings": warnings,
            "resources": [addr(n) for n in gen_nodes], "tool": tool,
            "address_map": {n["id"]: addr(n) for n in gen_nodes},
            "variables": [{**all_vars[k], "auto": k in auto_vars and k not in {v["name"] for v in user_vars}}
                          for k in sorted(all_vars)]}
