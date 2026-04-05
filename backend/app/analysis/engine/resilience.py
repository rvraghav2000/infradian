"""
Resilience analysis — graph-structural importance and redundancy.

Implements pure-Python PageRank, betweenness centrality (Brandes),
articulation-point detection (Tarjan), and node-disjoint path counting.
"""

from __future__ import annotations
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Tuple
from app.analysis.engine.graph_model import AnalysisGraph


@dataclass
class NodeImportance:
    """Computed importance signals for a single node."""
    node_id: str
    pagerank: float = 0.0
    betweenness: float = 0.0
    is_articulation_point: bool = False
    downstream_weight: float = 0.0
    composite_score: float = 0.0


class ResilienceAnalyzer:
    """Computes structural importance and redundancy for all nodes."""

    def __init__(self, graph: AnalysisGraph):
        self.graph = graph
        self._pagerank: Optional[Dict[str, float]] = None
        self._betweenness: Optional[Dict[str, float]] = None
        self._articulation_points: Optional[Set[str]] = None
        self._importance: Optional[Dict[str, NodeImportance]] = None

    # ── PageRank (power iteration) ─────────────────────────────────

    def compute_pagerank(
        self, damping: float = 0.85, max_iter: int = 100, tol: float = 1e-6
    ) -> Dict[str, float]:
        """Standard PageRank via power iteration on the directed graph."""
        if self._pagerank is not None:
            return self._pagerank

        ids = self.graph.node_ids
        n = len(ids)
        if n == 0:
            self._pagerank = {}
            return self._pagerank

        rank = {nid: 1.0 / n for nid in ids}
        base = (1.0 - damping) / n

        for _ in range(max_iter):
            new_rank: Dict[str, float] = {}
            # Collect dangling node mass (nodes with no outbound edges)
            dangling_sum = sum(
                rank[nid] for nid in ids
                if len(self.graph.get_outbound(nid)) == 0
            )
            dangling_contrib = damping * dangling_sum / n

            for nid in ids:
                incoming_sum = 0.0
                for edge_rec in self.graph.get_inbound(nid):
                    src = edge_rec.source
                    out_degree = len(self.graph.get_outbound(src))
                    if out_degree > 0:
                        incoming_sum += rank[src] / out_degree
                new_rank[nid] = base + damping * incoming_sum + dangling_contrib

            # Check convergence
            diff = sum(abs(new_rank[nid] - rank[nid]) for nid in ids)
            rank = new_rank
            if diff < tol:
                break

        self._pagerank = rank
        return self._pagerank

    # ── Betweenness centrality (Brandes' algorithm) ────────────────

    def compute_betweenness(self) -> Dict[str, float]:
        """Brandes' algorithm for betweenness centrality on directed graph."""
        if self._betweenness is not None:
            return self._betweenness

        ids = self.graph.node_ids
        cb: Dict[str, float] = {nid: 0.0 for nid in ids}

        for s in ids:
            # BFS / shortest-path DAG
            stack: List[str] = []
            pred: Dict[str, List[str]] = {nid: [] for nid in ids}
            sigma: Dict[str, float] = {nid: 0.0 for nid in ids}
            sigma[s] = 1.0
            dist: Dict[str, int] = {nid: -1 for nid in ids}
            dist[s] = 0
            queue: deque = deque([s])

            while queue:
                v = queue.popleft()
                stack.append(v)
                for edge_rec in self.graph.get_outbound(v):
                    w = edge_rec.target
                    if dist[w] < 0:
                        dist[w] = dist[v] + 1
                        queue.append(w)
                    if dist[w] == dist[v] + 1:
                        sigma[w] += sigma[v]
                        pred[w].append(v)

            # Back-propagation
            delta: Dict[str, float] = {nid: 0.0 for nid in ids}
            while stack:
                w = stack.pop()
                for v in pred[w]:
                    delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w])
                if w != s:
                    cb[w] += delta[w]

        # Normalize
        n = len(ids)
        if n > 2:
            norm = 1.0 / ((n - 1) * (n - 2))
            cb = {nid: val * norm for nid, val in cb.items()}

        self._betweenness = cb
        return self._betweenness

    # ── Articulation points (Tarjan's algorithm on undirected view) ─

    def find_articulation_points(self) -> Set[str]:
        """Find articulation points (cut vertices) treating the graph as undirected."""
        if self._articulation_points is not None:
            return self._articulation_points

        ids = self.graph.node_ids
        disc: Dict[str, int] = {}
        low: Dict[str, int] = {}
        parent: Dict[str, Optional[str]] = {}
        ap: Set[str] = set()
        timer = [0]

        def _undirected_neighbors(nid: str) -> Set[str]:
            neighbors: Set[str] = set()
            for e in self.graph.get_outbound(nid):
                neighbors.add(e.target)
            for e in self.graph.get_inbound(nid):
                neighbors.add(e.source)
            return neighbors

        def _dfs(u: str) -> None:
            children = 0
            disc[u] = low[u] = timer[0]
            timer[0] += 1

            for v in _undirected_neighbors(u):
                if v not in disc:
                    children += 1
                    parent[v] = u
                    _dfs(v)
                    low[u] = min(low[u], low[v])

                    # u is an articulation point if:
                    # 1) u is root of DFS tree and has 2+ children
                    if parent[u] is None and children > 1:
                        ap.add(u)
                    # 2) u is not root and low[v] >= disc[u]
                    if parent[u] is not None and low[v] >= disc[u]:
                        ap.add(u)
                elif v != parent.get(u):
                    low[u] = min(low[u], disc[v])

        for nid in ids:
            if nid not in disc:
                parent[nid] = None
                _dfs(nid)

        self._articulation_points = ap
        return self._articulation_points

    # ── Downstream reachability weight ─────────────────────────────

    def compute_downstream_weight(self, node_id: str) -> float:
        """Sum of (1 / cost) for all reachable downstream nodes."""
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
        result = dijkstra_blast_radius(self.graph, node_id, max_depth=10)
        total = 0.0
        for nid, rn in result.reachable.items():
            if nid != node_id and rn.cost > 0:
                total += 1.0 / rn.cost
        return round(total, 4)

    # ── Node-disjoint paths (simplified max-flow) ──────────────────

    def node_disjoint_path_count(self, source: str, target: str, max_paths: int = 5) -> int:
        """Count node-disjoint paths from source to target using iterative path removal."""
        if source == target or not self.graph.has_node(source) or not self.graph.has_node(target):
            return 0

        count = 0
        excluded: Set[str] = set()

        for _ in range(max_paths):
            # BFS ignoring excluded interior nodes
            pred: Dict[str, Optional[str]] = {source: None}
            queue: deque = deque([source])
            found = False

            while queue and not found:
                curr = queue.popleft()
                for edge_rec in self.graph.get_outbound(curr):
                    nb = edge_rec.target
                    if nb in pred:
                        continue
                    if nb != target and nb in excluded:
                        continue
                    pred[nb] = curr
                    if nb == target:
                        found = True
                        break
                    queue.append(nb)

            if not found:
                break

            # Reconstruct path, exclude interior nodes
            count += 1
            cur: Optional[str] = target
            while cur is not None:
                if cur != source and cur != target:
                    excluded.add(cur)
                cur = pred.get(cur)

        return count

    # ── Composite importance ───────────────────────────────────────

    def compute_all_importance(self) -> Dict[str, NodeImportance]:
        """Compute composite importance score for every node."""
        if self._importance is not None:
            return self._importance

        pr = self.compute_pagerank()
        bc = self.compute_betweenness()
        aps = self.find_articulation_points()

        # Normalize PR and BC to [0, 1]
        max_pr = max(pr.values()) if pr else 1.0
        max_bc = max(bc.values()) if bc else 1.0
        if max_pr == 0:
            max_pr = 1.0
        if max_bc == 0:
            max_bc = 1.0

        result: Dict[str, NodeImportance] = {}
        for nid in self.graph.node_ids:
            norm_pr = pr.get(nid, 0.0) / max_pr
            norm_bc = bc.get(nid, 0.0) / max_bc
            is_ap = nid in aps
            dw = self.compute_downstream_weight(nid)
            # Normalize downstream weight (approximate)
            max_dw = max(self.graph.node_count(), 1)
            norm_dw = min(dw / max_dw, 1.0)

            composite = (
                0.3 * norm_pr
                + 0.3 * norm_bc
                + 0.2 * (1.0 if is_ap else 0.0)
                + 0.2 * norm_dw
            )

            result[nid] = NodeImportance(
                node_id=nid,
                pagerank=round(norm_pr, 4),
                betweenness=round(norm_bc, 4),
                is_articulation_point=is_ap,
                downstream_weight=round(norm_dw, 4),
                composite_score=round(composite, 4),
            )

        self._importance = result
        return self._importance

    def get_importance(self, node_id: str) -> Optional[NodeImportance]:
        imp = self.compute_all_importance()
        return imp.get(node_id)

    def is_single_point_of_failure(self, node_id: str) -> Tuple[bool, List[str]]:
        """Check if removing this node would leave any critical node unreachable.

        Returns (is_spof, list_of_affected_critical_nodes).
        """
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius

        result = dijkstra_blast_radius(self.graph, node_id, max_depth=10)
        affected_critical: List[str] = []

        for nid in result.reachable:
            if nid == node_id:
                continue
            if not self.graph.is_critical(nid):
                continue
            # Check if there's more than one node-disjoint path
            # from any upstream of node_id to this critical node
            paths = self.node_disjoint_path_count(node_id, nid)
            if paths <= 1:
                affected_critical.append(nid)

        return len(affected_critical) > 0, affected_critical
