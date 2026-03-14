#!/usr/bin/env python3
"""
Infradian — Terraform State Parser

Reads a standard terraform.tfstate (v4) JSON file and transforms it
into a fully validated Infradian InfraGraph, with optional simulated
live telemetry and CI/CD history.

Usage:
    python parser.py <path/to/terraform.tfstate>
"""

from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.models import (
    CICDEvent,
    CICDEventStatus,
    Edge,
    InfraGraph,
    Node,
    NodeMetrics,
)

# ── Constants ────────────────────────────────────────────────────────

# Attributes that hint at the parent resource for nesting.
# Order matters: more specific keys are checked first.
_PARENT_ATTR_KEYS: list[tuple[str, str]] = [
    ("subnet_id", ""),       # value is an AWS subnet id
    ("vpc_id", ""),          # value is an AWS VPC id
]

# Pool of realistic Jenkins pipeline messages for simulation.
_JENKINS_MESSAGES: list[tuple[CICDEventStatus, str]] = [
    (CICDEventStatus.SUCCESS, "Jenkins » Deploy Pipeline #1024 — build & push succeeded."),
    (CICDEventStatus.SUCCESS, "Jenkins » Smoke Tests #512 — all 38 checks passed."),
    (CICDEventStatus.SUCCESS, "Jenkins » Config Refresh #88 — applied 3 parameter changes."),
    (CICDEventStatus.SUCCESS, "Jenkins » Rolling Update #201 — zero-downtime deploy complete."),
    (CICDEventStatus.SUCCESS, "Jenkins » DB Migration #77 — 2 migrations applied successfully."),
    (CICDEventStatus.FAILURE, "Jenkins » Deploy Pipeline #1025 — health-check timeout after deploy."),
    (CICDEventStatus.FAILURE, "Jenkins » Integration Tests #215 — 4/52 assertions failed."),
    (CICDEventStatus.FAILURE, "Jenkins » Canary Release #33 — error rate exceeded 5 % threshold."),
    (CICDEventStatus.IN_PROGRESS, "Jenkins » Deploy Pipeline #1026 — building image (step 3/5)…"),
    (CICDEventStatus.IN_PROGRESS, "Jenkins » Blue/Green Swap #44 — draining old target group…"),
]


# ── Helpers ──────────────────────────────────────────────────────────

def _resource_address(resource: dict[str, Any], index_key: Any = None) -> str:
    """Build a canonical node id from a tfstate resource block.

    For single instances:  ``aws_vpc.main``
    For indexed instances: ``aws_instance.web[0]`` or ``aws_instance.web["us-east-1a"]``
    """
    addr = f"{resource['type']}.{resource['name']}"
    if index_key is not None:
        if isinstance(index_key, int):
            addr += f"[{index_key}]"
        else:
            addr += f"[\"{index_key}\"]"
    return addr


def _derive_label(resource: dict[str, Any], attrs: dict[str, Any]) -> str:
    """Pick a human-readable label for a resource.

    Priority: ``tags.Name`` → ``{type}.{name}``
    """
    tags = attrs.get("tags") or {}
    if isinstance(tags, dict) and tags.get("Name"):
        return tags["Name"]
    return f"{resource['type']}.{resource['name']}"


def _resolve_parent_id(
    attrs: dict[str, Any],
    aws_id_to_node_id: dict[str, str],
) -> str | None:
    """Infer a parent node id from common cloud attributes.

    Checks ``subnet_id`` before ``vpc_id`` so that an instance inside a
    subnet is nested under the subnet, not directly under the VPC.
    """
    for attr_key, _ in _PARENT_ATTR_KEYS:
        cloud_id = attrs.get(attr_key)
        if cloud_id and cloud_id in aws_id_to_node_id:
            return aws_id_to_node_id[cloud_id]
    return None


# ── Core parsing ─────────────────────────────────────────────────────

def parse_tfstate(path: str | Path) -> InfraGraph:
    """Parse a Terraform v4 state file into an :class:`InfraGraph`.

    Parameters
    ----------
    path:
        Filesystem path to a ``terraform.tfstate`` JSON file.

    Returns
    -------
    InfraGraph
        A validated graph with nodes and dependency edges.

    Raises
    ------
    ValueError
        If the state file version is not 4 or contains no managed
        resources.
    """
    raw: dict[str, Any] = json.loads(Path(path).read_text(encoding="utf-8"))

    version = raw.get("version")
    if version != 4:
        raise ValueError(
            f"Unsupported state file version: {version} (expected 4)."
        )

    resources: list[dict[str, Any]] = raw.get("resources", [])

    # ── First pass: build nodes & id look-ups ────────────────────
    nodes: list[Node] = []
    # Map terraform address → Node id (same string, but useful for edges)
    addr_set: set[str] = set()
    # Map cloud-provider id (e.g. "vpc-0abc…") → terraform address,
    # used for parent_id resolution.
    aws_id_to_addr: dict[str, str] = {}

    # Collect all resource entries first so we can do parent look-up in
    # a second pass.
    resource_entries: list[tuple[str, dict[str, Any], dict[str, Any]]] = []

    for res in resources:
        if res.get("mode") != "managed":
            continue
        instances = res.get("instances", [])
        for idx, inst in enumerate(instances):
            index_key = inst.get("index_key")
            if index_key is None and len(instances) > 1:
                index_key = idx
            addr = _resource_address(res, index_key if len(instances) > 1 or index_key is not None else None)
            attrs = inst.get("attributes") or {}

            addr_set.add(addr)
            # Record cloud id for parent resolution
            cloud_id = attrs.get("id")
            if cloud_id:
                aws_id_to_addr[cloud_id] = addr

            resource_entries.append((addr, res, inst))

    # ── Second pass: create Node objects with parent_id ───────────
    for addr, res, inst in resource_entries:
        attrs = inst.get("attributes") or {}
        parent = _resolve_parent_id(attrs, aws_id_to_addr)
        node = Node(
            id=addr,
            type=res["type"],
            label=_derive_label(res, attrs),
            parent_id=parent,
            metrics=NodeMetrics(current_load=0.0),
            history=[],
        )
        nodes.append(node)

    # ── Third pass: generate edges from dependencies ─────────────
    seen_edges: set[tuple[str, str]] = set()
    edges: list[Edge] = []

    for addr, _res, inst in resource_entries:
        deps: list[str] = inst.get("dependencies") or []
        for dep_addr in deps:
            if dep_addr in addr_set and (addr, dep_addr) not in seen_edges:
                seen_edges.add((addr, dep_addr))
                edges.append(Edge(source_id=addr, target_id=dep_addr, label="depends_on"))

    if not nodes:
        raise ValueError("No managed resources found in state file.")

    return InfraGraph(nodes=nodes, edges=edges)


# ── Simulation ───────────────────────────────────────────────────────

def simulate_live_data(graph: InfraGraph) -> InfraGraph:
    """Inject random telemetry and mock CI/CD history into every node.

    Parameters
    ----------
    graph:
        An :class:`InfraGraph` (typically freshly parsed, with zeroed
        metrics and empty history).

    Returns
    -------
    InfraGraph
        A *new* graph with populated ``metrics.current_load`` and
        2–3 ``CICDEvent`` entries per node.
    """
    now = datetime.now(tz=timezone.utc)
    enriched_nodes: list[Node] = []

    for node in graph.nodes:
        # ── Random load ──────────────────────────────────────────
        load = round(random.uniform(0.05, 0.95), 2)

        # ── Mock Jenkins history (2–3 events) ────────────────────
        num_events = random.randint(2, 3)
        chosen = random.sample(_JENKINS_MESSAGES, k=num_events)
        events: list[CICDEvent] = []
        for i, (status, message) in enumerate(chosen):
            ts = now - timedelta(hours=random.uniform(1, 24))
            events.append(CICDEvent(timestamp=ts, status=status, message=message))
        # Sort chronologically
        events.sort(key=lambda e: e.timestamp)

        enriched_nodes.append(
            node.model_copy(
                update={
                    "metrics": NodeMetrics(current_load=load),
                    "history": events,
                },
            )
        )

    return InfraGraph(nodes=enriched_nodes, edges=graph.edges)


# ── CLI entrypoint ───────────────────────────────────────────────────

def main() -> None:
    """Read a tfstate file, parse, simulate, validate, and print JSON."""
    if len(sys.argv) < 2:
        print("Usage: python parser.py <path/to/terraform.tfstate>", file=sys.stderr)
        sys.exit(1)

    tfstate_path = sys.argv[1]

    # 1. Parse
    graph = parse_tfstate(tfstate_path)

    # 2. Simulate live data
    graph = simulate_live_data(graph)

    # 3. Validate round-trip (will raise on schema violations)
    validated = InfraGraph.model_validate(graph.model_dump(mode="json"))

    # 4. Output
    print(json.dumps(validated.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()
