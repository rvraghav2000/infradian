"""Terraform / OpenTofu code → canvas graph (the reverse of codegen)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

import hcl2

from .codegen import BLOCK_ATTRS
from .catalog import CATALOG, TF_TO_CANVAS, provider_of

_REF_RE = re.compile(r"\$\{([^}]*)\}")
_ADDR_RE = re.compile(r"\b([a-z][a-z0-9]*_[a-z0-9_]+)\.([A-Za-z_][A-Za-z0-9_-]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?")


def _clean(v: Any) -> Any:
    """Normalise python-hcl2 output: strip string quotes, drop block markers, unwrap blocks."""
    if isinstance(v, str):
        if len(v) >= 2 and v[0] == '"' and v[-1] == '"':
            return v[1:-1]
        return v
    if isinstance(v, list):
        items = [_clean(i) for i in v]
        return items
    if isinstance(v, dict):
        return {_clean(k): _clean(x) for k, x in v.items() if k != "__is_block__"}
    return v


def _unwrap(d: Dict[str, Any]) -> Dict[str, Any]:
    """Single-instance nested blocks come back as [ {...} ]; turn them back into dicts."""
    out: Dict[str, Any] = {}
    for k, v in d.items():
        if k in BLOCK_ATTRS and isinstance(v, list) and len(v) == 1 and isinstance(v[0], dict):
            v = v[0]
        out[k] = _unwrap(v) if k in BLOCK_ATTRS and isinstance(v, dict) else v
    return out


def _blocks(doc: Dict[str, Any], key: str) -> List[Dict[str, Any]]:
    return [_clean(b) for b in doc.get(key, [])]


def _find_refs(value: Any) -> List[Tuple[str, str, str]]:
    """All (type, name, suffix) resource references inside a value."""
    out: List[Tuple[str, str, str]] = []
    if isinstance(value, str):
        for m in _REF_RE.finditer(value):
            for a in _ADDR_RE.finditer(m.group(1)):
                if a.group(1) not in ("var", "local", "data", "module", "each", "count", "path", "self"):
                    out.append((a.group(1), a.group(2), a.group(3) or ""))
    elif isinstance(value, list):
        for i in value:
            out += _find_refs(i)
    elif isinstance(value, dict):
        for i in value.values():
            out += _find_refs(i)
    return out


def parse_files(files: Dict[str, str]) -> Dict[str, Any]:
    warnings: List[str] = []
    resources: List[Tuple[str, str, Dict[str, Any]]] = []
    variables: List[Dict[str, Any]] = []
    outputs: List[Dict[str, Any]] = []
    locals_: Dict[str, Any] = {}

    for fname, text in files.items():
        if not fname.endswith((".tf", ".tofu")):
            continue
        try:
            doc = hcl2.loads(text)
        except Exception as exc:  # syntax error in user-edited code
            raise ValueError(f"{fname}: {str(exc).splitlines()[0] if str(exc) else 'invalid HCL'}")
        for blk in _blocks(doc, "resource"):
            for rtype, named in blk.items():
                for rname, attrs in named.items():
                    resources.append((rtype, rname, attrs))
        for blk in _blocks(doc, "variable"):
            for name, a in blk.items():
                d = a.get("default")
                variables.append({"name": name, "type": str(a.get("type", "string")).replace("${", "").replace("}", ""),
                                  "description": a.get("description", ""), "default": d if d is not None else "",
                                  "sensitive": bool(a.get("sensitive", False))})
        for blk in _blocks(doc, "output"):
            for name, a in blk.items():
                val = a.get("value", "")
                outputs.append({"name": name, "value": _REF_RE.sub(r"\1", val) if isinstance(val, str) else str(val),
                                "description": a.get("description", ""), "sensitive": bool(a.get("sensitive", False))})
        for blk in _blocks(doc, "locals"):
            locals_.update(blk)

    ids = {(t, n): f"{t}.{n}" for t, n, _ in resources}
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    seen_edges = set()

    for rtype, rname, attrs in resources:
        canvas = TF_TO_CANVAS.get(rtype, rtype)
        spec = CATALOG.get(canvas)
        nid = ids[(rtype, rname)]
        attrs = _unwrap(attrs)
        parent_id = None
        consumed = set()
        for attr, val in list(attrs.items()):
            refs = [r for r in _find_refs(val) if (r[0], r[1]) in ids]
            if not refs:
                continue
            tgt_t, tgt_n, _ = refs[0]
            tgt_canvas = TF_TO_CANVAS.get(tgt_t, tgt_t)
            if spec and spec["parent"] and tgt_canvas in spec["parent"]["types"] and \
                    (attr in spec["parent"]["attrs"] or not spec["parent"]["attrs"]):
                parent_id = ids[(tgt_t, tgt_n)]
                consumed.add(attr)
                continue
            if spec and tgt_canvas in spec["links"] and spec["links"][tgt_canvas][0] == attr:
                consumed.add(attr)
            for t, n, _ in refs:
                key = (nid, ids[(t, n)])
                if key not in seen_edges and key[0] != key[1]:
                    seen_edges.add(key)
                    edges.append({"id": f"e:{key[0]}->{key[1]}", "source": key[0], "target": key[1], "label": "DEPENDS_ON"})
        # drop attributes codegen regenerates from parentId / edges / required-vars
        for a in consumed:
            attrs.pop(a, None)
        for a in list(attrs):
            v = attrs[a]
            if isinstance(v, str) and spec and a in spec["required"] and v == "${var." + spec["required"][a]["var"] + "}":
                attrs.pop(a)
        tags = attrs.get("tags")
        label = (tags.get("Name") if isinstance(tags, dict) and tags.get("Name") else None) or rname
        nodes.append({"id": nid, "type": canvas, "label": label, "status": "planned", "tf_name": rname,
                      "parentId": parent_id, "provider": provider_of(rtype), "attributes": attrs,
                      "metrics": {"current_load": 0}, "history": []})
        if not spec:
            warnings.append(f"{nid}: no catalog entry — imported as a generic '{rtype}' node.")

    return {"nodes": nodes, "edges": edges, "variables": variables, "outputs": outputs,
            "locals": locals_, "warnings": warnings}
