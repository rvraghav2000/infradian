"""
Architecture validation — deterministic rule engine.

Validates graph topology + object semantics against defined rules.
Returns a list of ValidationIssue with severity, message, affected nodes, and suggestion.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Set, Callable, Optional

from app.analysis.engine.graph_model import AnalysisGraph
from app.models import Node


@dataclass
class ValidationIssue:
    rule_id: str
    severity: str  # "error" | "warning" | "info"
    message: str
    affected_nodes: List[str]
    suggestion: str

    def to_dict(self) -> dict:
        return {
            "ruleId": self.rule_id,
            "severity": self.severity,
            "message": self.message,
            "affectedNodes": self.affected_nodes,
            "suggestion": self.suggestion,
        }


# ── Rule definitions ─────────────────────────────────────────────────────

def _r001_ec2_requires_subnet(graph: AnalysisGraph) -> List[ValidationIssue]:
    """EC2 instances must belong to a subnet (containment or dependency edge)."""
    issues = []
    subnet_ids = {n.id for n in graph.nodes_map.values() if n.type in ("aws_subnet",)}
    for node in graph.nodes_map.values():
        if node.type != "aws_instance":
            continue
        # Check if any edge connects this instance to a subnet
        has_subnet = False
        for e in graph.get_outbound(node.id):
            if e.target in subnet_ids:
                has_subnet = True
                break
        for e in graph.get_inbound(node.id):
            if e.source in subnet_ids:
                has_subnet = True
                break
        # Also check parent_id
        if node.parent_id and node.parent_id in subnet_ids:
            has_subnet = True
        if not has_subnet:
            issues.append(ValidationIssue(
                rule_id="R001",
                severity="error",
                message=f"EC2 instance '{node.label}' is not connected to any subnet.",
                affected_nodes=[node.id],
                suggestion="Add a containment edge to a subnet, or set parent_id to a subnet node.",
            ))
    return issues


def _r002_rds_no_direct_alb(graph: AnalysisGraph) -> List[ValidationIssue]:
    """RDS must not be directly connected to ALB (missing app layer)."""
    issues = []
    alb_ids = {n.id for n in graph.nodes_map.values() if n.type in ("aws_alb",)}
    rds_ids = {n.id for n in graph.nodes_map.values() if n.type in ("aws_db_instance", "aws_rds")}
    for rds_id in rds_ids:
        rds_node = graph.get_node(rds_id)
        for e in graph.get_outbound(rds_id):
            if e.target in alb_ids:
                issues.append(ValidationIssue(
                    rule_id="R002",
                    severity="error",
                    message=f"RDS '{rds_node.label}' is directly connected to a load balancer — database should not be ALB-facing.",
                    affected_nodes=[rds_id, e.target],
                    suggestion="Route traffic through an application tier (e.g., EC2, Lambda) between ALB and RDS.",
                ))
        for e in graph.get_inbound(rds_id):
            if e.source in alb_ids:
                issues.append(ValidationIssue(
                    rule_id="R002",
                    severity="error",
                    message=f"ALB is directly connected to RDS '{rds_node.label}' — insert an application layer.",
                    affected_nodes=[e.source, rds_id],
                    suggestion="Route traffic through an application tier between ALB and RDS.",
                ))
    return issues


def _r003_alb_needs_target(graph: AnalysisGraph) -> List[ValidationIssue]:
    """ALB should route to at least one downstream target."""
    issues = []
    for node in graph.nodes_map.values():
        if node.type != "aws_alb":
            continue
        outbound = graph.get_outbound(node.id)
        if len(outbound) == 0:
            issues.append(ValidationIssue(
                rule_id="R003",
                severity="warning",
                message=f"Load balancer '{node.label}' has no downstream targets.",
                affected_nodes=[node.id],
                suggestion="Add a target group or connect to an EC2/Lambda backend.",
            ))
    return issues


def _r004_planned_needs_edges(graph: AnalysisGraph) -> List[ValidationIssue]:
    """Planned nodes must have at least one upstream or downstream edge."""
    issues = []
    for node in graph.nodes_map.values():
        if node.status not in ("planned", "expected"):
            continue
        has_edges = len(graph.get_outbound(node.id)) > 0 or len(graph.get_inbound(node.id)) > 0
        # Also check parent_id
        if not has_edges and node.parent_id is None:
            issues.append(ValidationIssue(
                rule_id="R004",
                severity="warning",
                message=f"Planned node '{node.label}' ({node.type}) has no connections — it is isolated.",
                affected_nodes=[node.id],
                suggestion="Connect this node to at least one other resource with an edge.",
            ))
    return issues


def _r005_critical_needs_redundancy(graph: AnalysisGraph) -> List[ValidationIssue]:
    """Critical nodes should have redundancy_level > 0."""
    issues = []
    for node in graph.nodes_map.values():
        if node.criticality != "critical":
            continue
        if node.redundancy_level < 1:
            issues.append(ValidationIssue(
                rule_id="R005",
                severity="warning",
                message=f"Critical node '{node.label}' has no redundancy (level={node.redundancy_level}).",
                affected_nodes=[node.id],
                suggestion="Add a redundant replica or configure failover for this critical resource.",
            ))
    return issues


def _r006_isolated_nodes(graph: AnalysisGraph) -> List[ValidationIssue]:
    """Detect completely isolated nodes (no edges at all, no parent)."""
    issues = []
    for node in graph.nodes_map.values():
        out_count = len(graph.get_outbound(node.id))
        in_count = len(graph.get_inbound(node.id))
        if out_count == 0 and in_count == 0 and node.parent_id is None:
            # Skip structural containers — VPCs are often root nodes
            if node.type in ("aws_vpc", "cloud_provider"):
                continue
            issues.append(ValidationIssue(
                rule_id="R006",
                severity="info",
                message=f"Node '{node.label}' ({node.type}) is isolated — no edges or parent.",
                affected_nodes=[node.id],
                suggestion="Verify this resource is intentionally disconnected, or add dependencies.",
            ))
    return issues


def _r007_required_deps(graph: AnalysisGraph) -> List[ValidationIssue]:
    """Nodes must satisfy their required_dependencies."""
    issues = []
    # Build a type->ids lookup
    type_map: Dict[str, Set[str]] = {}
    for node in graph.nodes_map.values():
        type_map.setdefault(node.type, set()).add(node.id)

    for node in graph.nodes_map.values():
        required = node.resolved_required_deps()
        if not required:
            continue
        # Check if node has an edge to at least one node of each required type
        connected_types: Set[str] = set()
        for e in graph.get_outbound(node.id):
            target_node = graph.get_node(e.target)
            if target_node:
                connected_types.add(target_node.type)
        for e in graph.get_inbound(node.id):
            source_node = graph.get_node(e.source)
            if source_node:
                connected_types.add(source_node.type)
        # Also check parent
        if node.parent_id:
            parent = graph.get_node(node.parent_id)
            if parent:
                connected_types.add(parent.type)

        for req_type in required:
            if req_type not in connected_types:
                issues.append(ValidationIssue(
                    rule_id="R007",
                    severity="warning",
                    message=f"'{node.label}' ({node.type}) requires a connection to {req_type} but none found.",
                    affected_nodes=[node.id],
                    suggestion=f"Add a dependency edge from {node.label} to a {req_type} resource.",
                ))
    return issues


# ── Rule registry ────────────────────────────────────────────────────────

ALL_RULES: List[Callable[[AnalysisGraph], List[ValidationIssue]]] = [
    _r001_ec2_requires_subnet,
    _r002_rds_no_direct_alb,
    _r003_alb_needs_target,
    _r004_planned_needs_edges,
    _r005_critical_needs_redundancy,
    _r006_isolated_nodes,
    _r007_required_deps,
]


class ArchitectureValidator:
    """Runs all validation rules against a graph."""

    def __init__(self, graph: AnalysisGraph):
        self.graph = graph

    def validate(self) -> dict:
        """Run all rules and return categorized results."""
        all_issues: List[ValidationIssue] = []
        for rule_fn in ALL_RULES:
            try:
                all_issues.extend(rule_fn(self.graph))
            except Exception:
                continue

        errors = [i for i in all_issues if i.severity == "error"]
        warnings = [i for i in all_issues if i.severity == "warning"]
        infos = [i for i in all_issues if i.severity == "info"]

        # Build summary
        summary_parts = []
        if errors:
            summary_parts.append(f"{len(errors)} error{'s' if len(errors) != 1 else ''}")
        if warnings:
            summary_parts.append(f"{len(warnings)} warning{'s' if len(warnings) != 1 else ''}")
        if infos:
            summary_parts.append(f"{len(infos)} info item{'s' if len(infos) != 1 else ''}")

        summary = ", ".join(summary_parts) if summary_parts else "Architecture passes all validation rules."

        return {
            "valid": len(errors) == 0,
            "issueCount": len(all_issues),
            "errorCount": len(errors),
            "warningCount": len(warnings),
            "infoCount": len(infos),
            "issues": [i.to_dict() for i in all_issues],
            "summary": summary,
        }
