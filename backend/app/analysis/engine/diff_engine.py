"""
Graph diff engine — compares current (live) vs proposed (live + planned) graphs.

Produces a structured diff with:
  - Added/removed/modified nodes
  - Changed edges
  - Delta in blast radius, redundancy, and risk per affected node
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from app.analysis.engine.graph_model import AnalysisGraph
from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
from app.analysis.engine.resilience import ResilienceAnalyzer


@dataclass
class NodeDelta:
    node_id: str
    label: str
    change_type: str  # "added" | "removed" | "modified"
    node_type: str = ""
    status: str = ""
    layer: str = ""
    blast_radius_delta: float = 0.0
    importance_delta: float = 0.0
    detail: str = ""


@dataclass
class EdgeDelta:
    edge_id: str
    source: str
    target: str
    change_type: str  # "added" | "removed" | "modified"
    interaction_type: str = ""
    detail: str = ""


@dataclass
class GraphDiff:
    added_nodes: List[NodeDelta]
    removed_nodes: List[NodeDelta]
    modified_nodes: List[NodeDelta]
    added_edges: List[EdgeDelta]
    removed_edges: List[EdgeDelta]
    risk_delta: float
    redundancy_delta: float
    blast_radius_delta: float
    summary: str

    def to_dict(self) -> dict:
        return {
            "addedNodes": [_node_delta_dict(n) for n in self.added_nodes],
            "removedNodes": [_node_delta_dict(n) for n in self.removed_nodes],
            "modifiedNodes": [_node_delta_dict(n) for n in self.modified_nodes],
            "addedEdges": [_edge_delta_dict(e) for e in self.added_edges],
            "removedEdges": [_edge_delta_dict(e) for e in self.removed_edges],
            "riskDelta": round(self.risk_delta, 3),
            "redundancyDelta": round(self.redundancy_delta, 3),
            "blastRadiusDelta": round(self.blast_radius_delta, 3),
            "summary": self.summary,
            "stats": {
                "nodesAdded": len(self.added_nodes),
                "nodesRemoved": len(self.removed_nodes),
                "nodesModified": len(self.modified_nodes),
                "edgesAdded": len(self.added_edges),
                "edgesRemoved": len(self.removed_edges),
            },
        }


def _node_delta_dict(n: NodeDelta) -> dict:
    return {
        "id": n.node_id,
        "label": n.label,
        "changeType": n.change_type,
        "type": n.node_type,
        "status": n.status,
        "layer": n.layer,
        "blastRadiusDelta": round(n.blast_radius_delta, 3),
        "importanceDelta": round(n.importance_delta, 3),
        "detail": n.detail,
    }


def _edge_delta_dict(e: EdgeDelta) -> dict:
    return {
        "id": e.edge_id,
        "source": e.source,
        "target": e.target,
        "changeType": e.change_type,
        "interactionType": e.interaction_type,
        "detail": e.detail,
    }


class DiffEngine:
    """Compares two AnalysisGraph snapshots and produces a structured delta."""

    def __init__(self, current: AnalysisGraph, proposed: AnalysisGraph):
        self.current = current
        self.proposed = proposed

    def compute_diff(self) -> GraphDiff:
        """Full diff computation."""
        current_ids = set(self.current.node_ids)
        proposed_ids = set(self.proposed.node_ids)

        added_ids = proposed_ids - current_ids
        removed_ids = current_ids - proposed_ids
        common_ids = current_ids & proposed_ids

        # Node deltas
        added_nodes = self._build_added_nodes(added_ids)
        removed_nodes = self._build_removed_nodes(removed_ids)
        modified_nodes = self._build_modified_nodes(common_ids)

        # Edge deltas
        current_edge_keys = {(r.source, r.target): r for r in self.current.all_edge_records}
        proposed_edge_keys = {(r.source, r.target): r for r in self.proposed.all_edge_records}

        current_edge_set = set(current_edge_keys.keys())
        proposed_edge_set = set(proposed_edge_keys.keys())

        added_edges = [
            EdgeDelta(
                edge_id=proposed_edge_keys[k].edge.id,
                source=k[0],
                target=k[1],
                change_type="added",
                interaction_type=proposed_edge_keys[k].interaction_type,
                detail=f"New {proposed_edge_keys[k].interaction_type} dependency",
            )
            for k in (proposed_edge_set - current_edge_set)
        ]

        removed_edges = [
            EdgeDelta(
                edge_id=current_edge_keys[k].edge.id,
                source=k[0],
                target=k[1],
                change_type="removed",
                interaction_type=current_edge_keys[k].interaction_type,
                detail="Dependency removed",
            )
            for k in (current_edge_set - proposed_edge_set)
        ]

        # Aggregate risk/redundancy/blast deltas
        risk_delta = self._compute_risk_delta()
        redundancy_delta = self._compute_redundancy_delta()
        blast_delta = self._compute_blast_radius_delta()

        summary = self._build_summary(
            added_nodes, removed_nodes, modified_nodes,
            added_edges, removed_edges,
            risk_delta, redundancy_delta,
        )

        return GraphDiff(
            added_nodes=added_nodes,
            removed_nodes=removed_nodes,
            modified_nodes=modified_nodes,
            added_edges=added_edges,
            removed_edges=removed_edges,
            risk_delta=risk_delta,
            redundancy_delta=redundancy_delta,
            blast_radius_delta=blast_delta,
            summary=summary,
        )

    def _build_added_nodes(self, ids: Set[str]) -> List[NodeDelta]:
        result = []
        for nid in ids:
            node = self.proposed.get_node(nid)
            if not node:
                continue
            result.append(NodeDelta(
                node_id=nid,
                label=node.label,
                change_type="added",
                node_type=node.type,
                status=node.status,
                layer=node.resolved_layer(),
                detail=f"New {node.type} ({node.status})",
            ))
        return result

    def _build_removed_nodes(self, ids: Set[str]) -> List[NodeDelta]:
        result = []
        for nid in ids:
            node = self.current.get_node(nid)
            if not node:
                continue
            # Compute blast radius impact of removal
            traversal = dijkstra_blast_radius(self.current, nid, max_depth=5)
            br_impact = traversal.affected_count
            result.append(NodeDelta(
                node_id=nid,
                label=node.label,
                change_type="removed",
                node_type=node.type,
                status=node.status,
                layer=node.resolved_layer(),
                blast_radius_delta=-br_impact,
                detail=f"Removed {node.type} (affected {br_impact} downstream nodes)",
            ))
        return result

    def _build_modified_nodes(self, common_ids: Set[str]) -> List[NodeDelta]:
        """Detect meaningful changes between current and proposed versions of the same node."""
        result = []
        for nid in common_ids:
            curr = self.current.get_node(nid)
            prop = self.proposed.get_node(nid)
            if not curr or not prop:
                continue

            changes = []
            if curr.status != prop.status:
                changes.append(f"status: {curr.status} → {prop.status}")
            if curr.criticality != prop.criticality:
                changes.append(f"criticality: {curr.criticality} → {prop.criticality}")
            if curr.environment != prop.environment:
                changes.append(f"environment: {curr.environment} → {prop.environment}")

            # Check edge changes for this node
            curr_out = len(self.current.get_outbound(nid))
            prop_out = len(self.proposed.get_outbound(nid))
            curr_in = len(self.current.get_inbound(nid))
            prop_in = len(self.proposed.get_inbound(nid))
            if curr_out != prop_out or curr_in != prop_in:
                changes.append(f"edges: {curr_in}↓+{curr_out}↑ → {prop_in}↓+{prop_out}↑")

            if changes:
                result.append(NodeDelta(
                    node_id=nid,
                    label=curr.label,
                    change_type="modified",
                    node_type=curr.type,
                    status=prop.status,
                    layer=curr.resolved_layer(),
                    detail=", ".join(changes),
                ))
        return result

    def _compute_risk_delta(self) -> float:
        """Compute aggregate risk change (positive = riskier)."""
        try:
            curr_res = ResilienceAnalyzer(self.current)
            prop_res = ResilienceAnalyzer(self.proposed)

            curr_aps = len(curr_res.find_articulation_points())
            prop_aps = len(prop_res.find_articulation_points())

            # More articulation points = higher risk
            ap_delta = (prop_aps - curr_aps) / max(self.current.node_count(), 1)

            return round(ap_delta, 3)
        except Exception:
            return 0.0

    def _compute_redundancy_delta(self) -> float:
        """Compute aggregate redundancy change (positive = more redundant)."""
        try:
            curr_edge_ratio = self.current.edge_count() / max(self.current.node_count(), 1)
            prop_edge_ratio = self.proposed.edge_count() / max(self.proposed.node_count(), 1)
            return round(prop_edge_ratio - curr_edge_ratio, 3)
        except Exception:
            return 0.0

    def _compute_blast_radius_delta(self) -> float:
        """Average blast radius change across all nodes."""
        try:
            common_ids = set(self.current.node_ids) & set(self.proposed.node_ids)
            if not common_ids:
                return 0.0

            total_delta = 0.0
            sampled = list(common_ids)[:20]  # Sample for performance
            for nid in sampled:
                curr_tr = dijkstra_blast_radius(self.current, nid, max_depth=3)
                prop_tr = dijkstra_blast_radius(self.proposed, nid, max_depth=3)
                total_delta += prop_tr.affected_count - curr_tr.affected_count

            return round(total_delta / len(sampled), 3)
        except Exception:
            return 0.0

    def _build_summary(
        self, added, removed, modified,
        added_edges, removed_edges,
        risk_delta, redundancy_delta,
    ) -> str:
        parts = []
        if added:
            parts.append(f"{len(added)} node{'s' if len(added) != 1 else ''} added")
        if removed:
            parts.append(f"{len(removed)} node{'s' if len(removed) != 1 else ''} removed")
        if modified:
            parts.append(f"{len(modified)} node{'s' if len(modified) != 1 else ''} modified")
        if added_edges:
            parts.append(f"{len(added_edges)} edge{'s' if len(added_edges) != 1 else ''} added")
        if removed_edges:
            parts.append(f"{len(removed_edges)} edge{'s' if len(removed_edges) != 1 else ''} removed")

        if not parts:
            return "No changes detected between current and proposed architectures."

        change_str = ", ".join(parts) + "."

        risk_note = ""
        if risk_delta > 0.05:
            risk_note = " Risk increased."
        elif risk_delta < -0.05:
            risk_note = " Risk decreased."

        redundancy_note = ""
        if redundancy_delta > 0.1:
            redundancy_note = " Redundancy improved."
        elif redundancy_delta < -0.1:
            redundancy_note = " Redundancy decreased."

        return f"Proposed changes: {change_str}{risk_note}{redundancy_note}"
