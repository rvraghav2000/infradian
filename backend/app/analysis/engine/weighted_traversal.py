"""
Dijkstra-style weighted blast radius traversal.

Replaces the old BFS traversal with proper edge-weight handling,
predecessor tracking for path reconstruction, and configurable
depth/cost bounds.
"""

from __future__ import annotations
import heapq
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from app.analysis.engine.graph_model import AnalysisGraph, EdgeRecord, CRITICALITY_RANK


@dataclass
class ReachableNode:
    """A node discovered during traversal."""
    node_id: str
    cost: float
    depth: int
    predecessor: Optional[str]
    edge_used: Optional[EdgeRecord]


@dataclass
class TraversalResult:
    """Complete result of a Dijkstra blast radius traversal."""
    source_id: str
    reachable: Dict[str, ReachableNode]
    max_depth_reached: int
    total_cost: float

    @property
    def affected_count(self) -> int:
        return len(self.reachable) - 1  # exclude source

    def reconstruct_path(self, target_id: str) -> List[str]:
        """Reconstruct the shortest-weighted path from source to target."""
        if target_id not in self.reachable:
            return []
        path = []
        current = target_id
        while current is not None:
            path.append(current)
            pred = self.reachable[current].predecessor
            current = pred
        path.reverse()
        return path


def dijkstra_blast_radius(
    graph: AnalysisGraph,
    source_id: str,
    max_depth: int = 10,
    max_cost: float = float("inf"),
) -> TraversalResult:
    """Run Dijkstra from source_id, returning all reachable nodes within bounds.

    Args:
        graph: The weighted analysis graph.
        source_id: Starting node.
        max_depth: Maximum hop count.
        max_cost: Maximum cumulative edge cost.

    Returns:
        TraversalResult with reachable nodes, costs, and predecessors.
    """
    if not graph.has_node(source_id):
        return TraversalResult(source_id=source_id, reachable={}, max_depth_reached=0, total_cost=0.0)

    # {node_id: ReachableNode} — settled nodes
    settled: Dict[str, ReachableNode] = {}
    # Min-heap: (cost, depth, node_id) — deterministic tie-break on id
    heap: list = [(0.0, 0, source_id, None, None)]
    # Best known cost to each node (before settling)
    best_cost: Dict[str, float] = {source_id: 0.0}

    while heap:
        cost, depth, node_id, pred, edge = heapq.heappop(heap)

        if node_id in settled:
            continue

        settled[node_id] = ReachableNode(
            node_id=node_id,
            cost=cost,
            depth=depth,
            predecessor=pred,
            edge_used=edge,
        )

        if depth >= max_depth:
            continue

        for edge_rec in graph.get_outbound(node_id):
            neighbor = edge_rec.target
            if neighbor in settled:
                continue

            new_cost = cost + edge_rec.weight
            if new_cost > max_cost:
                continue

            if neighbor not in best_cost or new_cost < best_cost[neighbor]:
                best_cost[neighbor] = new_cost
                heapq.heappush(heap, (new_cost, depth + 1, neighbor, node_id, edge_rec))

    max_depth_reached = max((r.depth for r in settled.values()), default=0)
    total_cost = sum(r.cost for r in settled.values())

    return TraversalResult(
        source_id=source_id,
        reachable=settled,
        max_depth_reached=max_depth_reached,
        total_cost=total_cost,
    )


def build_blast_radius_response(
    graph: AnalysisGraph,
    node_id: str,
    traversal: TraversalResult,
    critical_paths: List[dict],
    confidence: dict,
) -> dict:
    """Format traversal + paths + confidence into the API response shape."""
    from app.analysis.engine.explanation import explain_blast_radius

    impacted = []
    critical_count = 0
    for nid, rn in traversal.reachable.items():
        if nid == node_id:
            continue
        node = graph.get_node(nid)
        is_crit = graph.is_critical(nid)
        if is_crit:
            critical_count += 1
        impacted.append({
            "id": nid,
            "label": node.label if node else nid,
            "type": node.type if node else "unknown",
            "depth": rn.depth,
            "cost": round(rn.cost, 3),
            "path": traversal.reconstruct_path(nid),
            "isCritical": is_crit,
        })

    impacted.sort(key=lambda x: x["cost"])

    # Impact score: normalized 0-100 based on weighted reachability
    max_possible = max(graph.node_count() - 1, 1)
    raw_impact = sum(1.0 / max(r["cost"], 0.1) for r in impacted)
    impact_score = min(round((raw_impact / max_possible) * 100, 1), 100.0)

    result = {
        "nodeId": node_id,
        "impactScore": impact_score,
        "impactedNodeCount": traversal.affected_count,
        "maxDepth": traversal.max_depth_reached,
        "topPaths": critical_paths[:5],
        "criticalNodesAffected": critical_count,
        "confidence": confidence,
        "impactedNodes": impacted,
    }
    result["summary"] = explain_blast_radius(result)
    return result
