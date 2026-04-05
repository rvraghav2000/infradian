"""
Counterfactual removal simulator.

Clones the graph without the target node, then classifies every
downstream node as broken, degraded, or unaffected by comparing
path viability before and after removal.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Optional, Set
from app.analysis.engine.graph_model import AnalysisGraph
from app.analysis.engine.weighted_traversal import dijkstra_blast_radius, TraversalResult


DEGRADATION_FACTOR = 2.0  # cost must increase by 2x to count as degraded


@dataclass
class NodeImpact:
    node_id: str
    label: str
    classification: str  # "broken" | "degraded" | "unaffected"
    baseline_cost: Optional[float]
    simulated_cost: Optional[float]
    detail: str


@dataclass
class PathComparison:
    source: str
    target: str
    baseline_path: List[str]
    simulated_path: List[str]
    baseline_cost: float
    simulated_cost: float
    status: str  # "broken" | "degraded" | "unaffected"


class RemovalSimulator:
    """Simulates removing a node without mutating the real graph."""

    def __init__(self, graph: AnalysisGraph):
        self.graph = graph

    def simulate(self, target_node_id: str) -> dict:
        """Run full removal simulation for a node."""
        if not self.graph.has_node(target_node_id):
            return {
                "nodeId": target_node_id,
                "error": f"Node {target_node_id} not found",
                "brokenNodes": [],
                "degradedNodes": [],
                "unaffectedNodes": [],
                "impactedPaths": [],
                "confidence": {"overall": 0},
                "summary": f"Cannot simulate: {target_node_id} not found.",
            }

        # 1. Identify upstream sources (nodes that reach target_node_id)
        #    We need to check from the perspective of nodes that *use* the target
        upstream_sources = self._find_upstream_sources(target_node_id)

        # 2. Build baseline: for each upstream source, what can it reach downstream?
        baseline_reach: Dict[str, TraversalResult] = {}
        for src in upstream_sources:
            baseline_reach[src] = dijkstra_blast_radius(self.graph, src, max_depth=10)

        # 3. Clone graph without target node
        shadow = self.graph.clone_without(target_node_id)

        # 4. Re-run from each upstream source on shadow graph
        shadow_reach: Dict[str, TraversalResult] = {}
        for src in upstream_sources:
            if shadow.has_node(src):
                shadow_reach[src] = dijkstra_blast_radius(shadow, src, max_depth=10)

        # 5. Also check what the target node itself could reach (direct downstream impact)
        target_downstream = dijkstra_blast_radius(self.graph, target_node_id, max_depth=10)

        # 6. Classify every affected node
        classified: Dict[str, NodeImpact] = {}
        all_affected: Set[str] = set()

        # Nodes directly downstream of target
        for nid in target_downstream.reachable:
            if nid != target_node_id:
                all_affected.add(nid)

        # Nodes that upstream sources could reach through target
        for src, baseline_tr in baseline_reach.items():
            for nid in baseline_tr.reachable:
                if nid != src and nid != target_node_id:
                    all_affected.add(nid)

        for nid in all_affected:
            node = self.graph.get_node(nid)
            label = node.label if node else nid

            # Find best baseline cost and best shadow cost to this node from any source
            best_baseline: Optional[float] = None
            best_shadow: Optional[float] = None

            for src in upstream_sources:
                if src in baseline_reach and nid in baseline_reach[src].reachable:
                    bc = baseline_reach[src].reachable[nid].cost
                    if best_baseline is None or bc < best_baseline:
                        best_baseline = bc

                if src in shadow_reach and nid in shadow_reach[src].reachable:
                    sc = shadow_reach[src].reachable[nid].cost
                    if best_shadow is None or sc < best_shadow:
                        best_shadow = sc

            # Also consider direct downstream (target itself as source)
            if nid in target_downstream.reachable:
                tc = target_downstream.reachable[nid].cost
                if best_baseline is None or tc < best_baseline:
                    best_baseline = tc

            # Classify
            if best_baseline is None:
                # Wasn't reachable in baseline — not really affected
                continue

            if best_shadow is None:
                classification = "broken"
                detail = f"No viable path remains after removing {target_node_id}"
            elif best_shadow >= best_baseline * DEGRADATION_FACTOR:
                classification = "degraded"
                detail = f"Path cost increased from {best_baseline:.2f} to {best_shadow:.2f} (fallback/weaker route)"
            else:
                classification = "unaffected"
                detail = f"Equivalent path available (cost: {best_shadow:.2f} vs baseline {best_baseline:.2f})"

            classified[nid] = NodeImpact(
                node_id=nid,
                label=label,
                classification=classification,
                baseline_cost=best_baseline,
                simulated_cost=best_shadow,
                detail=detail,
            )

        # 7. Build path comparisons for the most impacted routes
        path_comparisons = self._build_path_comparisons(
            target_node_id, baseline_reach, shadow_reach, classified
        )

        # 8. Format response
        broken = [
            {"id": ni.node_id, "label": ni.label, "detail": ni.detail}
            for ni in classified.values() if ni.classification == "broken"
        ]
        degraded = [
            {"id": ni.node_id, "label": ni.label, "detail": ni.detail,
             "baselineCost": round(ni.baseline_cost, 3) if ni.baseline_cost else None,
             "simulatedCost": round(ni.simulated_cost, 3) if ni.simulated_cost else None}
            for ni in classified.values() if ni.classification == "degraded"
        ]
        unaffected = [
            {"id": ni.node_id, "label": ni.label}
            for ni in classified.values() if ni.classification == "unaffected"
        ]

        from app.analysis.engine.explanation import explain_simulation
        from app.analysis.engine.confidence import ConfidenceModel

        conf_model = ConfidenceModel(self.graph)
        confidence = conf_model.compute(target_node_id)

        result = {
            "nodeId": target_node_id,
            "brokenNodes": broken,
            "degradedNodes": degraded,
            "unaffectedNodes": unaffected,
            "impactedPaths": path_comparisons[:10],
            "confidence": confidence,
        }
        result["summary"] = explain_simulation(result)
        return result

    def _find_upstream_sources(self, node_id: str) -> List[str]:
        """Find all nodes that have the target node downstream (up to 10 hops back)."""
        # Reverse traversal: follow inbound edges
        visited: Set[str] = set()
        queue = [node_id]
        visited.add(node_id)

        depth = 0
        while queue and depth < 10:
            next_queue = []
            for curr in queue:
                for edge_rec in self.graph.get_inbound(curr):
                    if edge_rec.source not in visited:
                        visited.add(edge_rec.source)
                        next_queue.append(edge_rec.source)
            queue = next_queue
            depth += 1

        visited.discard(node_id)
        return list(visited)

    def _build_path_comparisons(
        self,
        target_id: str,
        baseline: Dict[str, TraversalResult],
        shadow: Dict[str, TraversalResult],
        classified: Dict[str, NodeImpact],
    ) -> List[dict]:
        """Build before/after path comparisons for impacted nodes."""
        comparisons = []

        for nid, impact in classified.items():
            if impact.classification == "unaffected":
                continue

            # Find the source that had the best baseline path
            best_source = None
            best_cost = float("inf")
            for src, tr in baseline.items():
                if nid in tr.reachable:
                    c = tr.reachable[nid].cost
                    if c < best_cost:
                        best_cost = c
                        best_source = src

            if best_source is None:
                continue

            baseline_path = baseline[best_source].reconstruct_path(nid)
            shadow_path = []
            shadow_cost = None
            if best_source in shadow and nid in shadow[best_source].reachable:
                shadow_path = shadow[best_source].reconstruct_path(nid)
                shadow_cost = shadow[best_source].reachable[nid].cost

            comparisons.append({
                "source": best_source,
                "target": nid,
                "baselinePath": baseline_path,
                "simulatedPath": shadow_path,
                "baselineCost": round(best_cost, 3),
                "simulatedCost": round(shadow_cost, 3) if shadow_cost else None,
                "status": impact.classification,
            })

        comparisons.sort(key=lambda c: 0 if c["status"] == "broken" else 1)
        return comparisons
