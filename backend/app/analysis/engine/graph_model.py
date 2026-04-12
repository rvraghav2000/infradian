"""
AnalysisGraph — weighted directed graph for all engine modules.

Builds adjacency lists with full edge metadata, computes edge weights,
and provides O(1) lookups for nodes, edges, and neighbors.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from app.models import Node, Edge

# Dependency mode → base traversal penalty multiplier
MODE_PENALTIES: Dict[str, float] = {
    "sync": 1.0,
    "async": 2.0,
    "inferred": 3.0,
    "fallback": 5.0,
    "control_plane": 1.5,
}

# Interaction type → traversal penalty
INTERACTION_PENALTIES: Dict[str, float] = {
    "runtime_call": 1.0,
    "async_event": 1.8,
    "containment": 0.5,  # structural containment is tight coupling
    "control_dependency": 1.5,
    "data_dependency": 1.2,
    "fallback": 4.0,
}

CRITICALITY_RANK: Dict[str, int] = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
}


@dataclass
class EdgeRecord:
    """Precomputed edge with weight for traversal."""
    edge: Edge
    source: str
    target: str
    weight: float
    mode: str
    confidence: float
    traffic_share: float
    interaction_type: str = "runtime_call"
    primary: bool = True
    inferred: bool = False


@dataclass
class AdjEntry:
    """Adjacency entry: outbound and inbound edges for a node."""
    out: List[EdgeRecord] = field(default_factory=list)
    inc: List[EdgeRecord] = field(default_factory=list)


def compute_edge_weight(edge: Edge) -> float:
    """Compute traversal cost for an edge.

    Formula: base × (1 / confidence) × mode_penalty × interaction_penalty × (1 / traffic_share)
             × primary_factor × inferred_factor
    Lower weight = stronger / more important dependency.
    """
    if edge.edge_weight is not None:
        return edge.edge_weight

    base = 1.0
    conf_factor = 1.0 / max(edge.confidence, 0.01)
    mode_factor = MODE_PENALTIES.get(edge.dependency_mode, 1.0)
    interaction_factor = INTERACTION_PENALTIES.get(
        getattr(edge, 'interaction_type', 'runtime_call'), 1.0
    )
    traffic_factor = 1.0 / max(edge.traffic_share, 0.01)
    # Non-primary edges are weaker paths
    primary_factor = 1.0 if getattr(edge, 'primary', True) else 2.0
    # Inferred edges carry more uncertainty
    inferred_factor = 2.0 if getattr(edge, 'inferred', False) else 1.0
    return base * conf_factor * mode_factor * interaction_factor * traffic_factor * primary_factor * inferred_factor


class AnalysisGraph:
    """Weighted directed graph built from Node/Edge model lists."""

    def __init__(self, nodes: List[Node], edges: List[Edge]):
        self.nodes_map: Dict[str, Node] = {}
        self.adj: Dict[str, AdjEntry] = {}
        self.edges_map: Dict[Tuple[str, str], List[EdgeRecord]] = {}
        self.all_edge_records: List[EdgeRecord] = []

        for node in nodes:
            self.nodes_map[node.id] = node
            self.adj[node.id] = AdjEntry()

        for edge in edges:
            if edge.source not in self.adj or edge.target not in self.adj:
                continue
            rec = EdgeRecord(
                edge=edge,
                source=edge.source,
                target=edge.target,
                weight=compute_edge_weight(edge),
                mode=edge.dependency_mode,
                confidence=edge.confidence,
                traffic_share=edge.traffic_share,
                interaction_type=getattr(edge, 'interaction_type', 'runtime_call'),
                primary=getattr(edge, 'primary', True),
                inferred=getattr(edge, 'inferred', False),
            )
            self.adj[edge.source].out.append(rec)
            self.adj[edge.target].inc.append(rec)
            self.edges_map.setdefault((edge.source, edge.target), []).append(rec)
            self.all_edge_records.append(rec)

    @property
    def node_ids(self) -> List[str]:
        return list(self.nodes_map.keys())

    def get_node(self, node_id: str) -> Optional[Node]:
        return self.nodes_map.get(node_id)

    def get_outbound(self, node_id: str) -> List[EdgeRecord]:
        entry = self.adj.get(node_id)
        return entry.out if entry else []

    def get_inbound(self, node_id: str) -> List[EdgeRecord]:
        entry = self.adj.get(node_id)
        return entry.inc if entry else []

    def get_edges_between(self, source: str, target: str) -> List[EdgeRecord]:
        return self.edges_map.get((source, target), [])

    def has_node(self, node_id: str) -> bool:
        return node_id in self.nodes_map

    def node_count(self) -> int:
        return len(self.nodes_map)

    def edge_count(self) -> int:
        return len(self.all_edge_records)

    def criticality_rank(self, node_id: str) -> int:
        node = self.get_node(node_id)
        if not node:
            return 0
        return CRITICALITY_RANK.get(node.criticality, 2)

    def is_critical(self, node_id: str) -> bool:
        return self.criticality_rank(node_id) >= 3

    def clone_without(self, excluded_node_id: str) -> "AnalysisGraph":
        """Create a shadow copy of this graph with a node and its edges removed."""
        from app.models import Node as NodeModel, Edge as EdgeModel
        filtered_nodes = [n for n in self.nodes_map.values() if n.id != excluded_node_id]
        filtered_edges = [
            rec.edge for rec in self.all_edge_records
            if rec.source != excluded_node_id and rec.target != excluded_node_id
        ]
        return AnalysisGraph(filtered_nodes, filtered_edges)

    def clone_with_mutations(
        self,
        add_nodes: Optional[List[Node]] = None,
        remove_node_ids: Optional[List[str]] = None,
        add_edges: Optional[List[Edge]] = None,
        remove_edge_ids: Optional[List[str]] = None,
    ) -> "AnalysisGraph":
        """Create a mutated copy: add/remove nodes and edges in one shot.

        Planned nodes that lack real metrics get safe defaults automatically.
        """
        remove_ids = set(remove_node_ids or [])
        remove_eids = set(remove_edge_ids or [])

        # Start with existing nodes/edges, minus removals
        nodes = [n for n in self.nodes_map.values() if n.id not in remove_ids]
        edges = [
            rec.edge for rec in self.all_edge_records
            if rec.edge.id not in remove_eids
            and rec.source not in remove_ids
            and rec.target not in remove_ids
        ]

        # Add new nodes
        existing_ids = {n.id for n in nodes}
        for n in (add_nodes or []):
            if n.id not in existing_ids:
                nodes.append(n)
                existing_ids.add(n.id)

        # Add new edges
        for e in (add_edges or []):
            edges.append(e)

        return AnalysisGraph(nodes, edges)

    def get_nodes_by_status(self, status: str) -> List[Node]:
        """Return all nodes matching a given status."""
        return [n for n in self.nodes_map.values() if n.status == status]

    def get_nodes_by_layer(self, layer: str) -> List[Node]:
        """Return all nodes matching a given layer."""
        return [n for n in self.nodes_map.values() if n.resolved_layer() == layer]
