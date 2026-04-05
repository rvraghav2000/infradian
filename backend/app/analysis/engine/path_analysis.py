"""
K-shortest critical path extraction via Yen's algorithm.

Finds the top-K lowest-cost paths between source and target nodes,
then scores them by criticality to surface the most important
impact corridors.
"""

from __future__ import annotations
import heapq
from dataclasses import dataclass
from typing import List, Optional, Dict, Set
from app.analysis.engine.graph_model import AnalysisGraph, MODE_PENALTIES, CRITICALITY_RANK


@dataclass
class ScoredPath:
    """A path with cost and criticality score."""
    nodes: List[str]
    total_cost: float
    total_score: float  # lower = more critical
    modes: List[str]
    description: str


def _dijkstra_shortest(
    graph: AnalysisGraph,
    source: str,
    target: str,
    excluded_nodes: Set[str] = frozenset(),
    excluded_edges: Set[tuple] = frozenset(),
) -> Optional[List[str]]:
    """Single-target Dijkstra respecting exclusions. Returns path or None."""
    if source == target:
        return [source]
    if source in excluded_nodes or target in excluded_nodes:
        return None

    dist: Dict[str, float] = {source: 0.0}
    pred: Dict[str, Optional[str]] = {source: None}
    heap = [(0.0, source)]

    while heap:
        cost, node = heapq.heappop(heap)
        if node == target:
            path = []
            cur: Optional[str] = target
            while cur is not None:
                path.append(cur)
                cur = pred[cur]
            path.reverse()
            return path

        if cost > dist.get(node, float("inf")):
            continue

        for edge_rec in graph.get_outbound(node):
            neighbor = edge_rec.target
            if neighbor in excluded_nodes:
                continue
            if (node, neighbor) in excluded_edges:
                continue
            new_cost = cost + edge_rec.weight
            if new_cost < dist.get(neighbor, float("inf")):
                dist[neighbor] = new_cost
                pred[neighbor] = node
                heapq.heappush(heap, (new_cost, neighbor))

    return None


def _path_cost(graph: AnalysisGraph, path: List[str]) -> float:
    """Sum of edge weights along a path."""
    total = 0.0
    for i in range(len(path) - 1):
        edges = graph.get_edges_between(path[i], path[i + 1])
        if edges:
            total += min(e.weight for e in edges)
        else:
            total += 100.0  # penalty for missing edge
    return total


def k_shortest_paths(
    graph: AnalysisGraph,
    source: str,
    target: str,
    K: int = 5,
    max_iterations: int = 500,
) -> List[ScoredPath]:
    """Yen's K-shortest paths between source and target.

    Returns up to K paths sorted by total cost (ascending).
    Bounded by max_iterations to prevent blowup on dense graphs.
    """
    if not graph.has_node(source) or not graph.has_node(target):
        return []

    # Find initial shortest path
    shortest = _dijkstra_shortest(graph, source, target)
    if shortest is None:
        return []

    A: List[List[str]] = [shortest]  # confirmed K-shortest
    B: list = []  # candidate heap: (cost, path)
    iteration_count = 0

    for k in range(1, K):
        prev_path = A[k - 1]

        for i in range(len(prev_path) - 1):
            spur_node = prev_path[i]
            root_path = prev_path[:i + 1]

            excluded_edges: Set[tuple] = set()
            for confirmed in A:
                if confirmed[:i + 1] == root_path and i + 1 < len(confirmed):
                    excluded_edges.add((confirmed[i], confirmed[i + 1]))

            excluded_nodes = set(root_path[:-1])  # exclude root prefix nodes except spur

            spur_path = _dijkstra_shortest(
                graph, spur_node, target,
                excluded_nodes=excluded_nodes,
                excluded_edges=excluded_edges,
            )

            if spur_path is not None:
                total_path = root_path[:-1] + spur_path
                cost = _path_cost(graph, total_path)
                # Avoid duplicates
                if total_path not in A and not any(p == total_path for _, p in B):
                    heapq.heappush(B, (cost, total_path))

            iteration_count += 1
            if iteration_count >= max_iterations:
                break

        if not B:
            break

        _, next_path = heapq.heappop(B)
        A.append(next_path)

        if iteration_count >= max_iterations:
            break

    # Score and format
    results = []
    for path in A:
        cost = _path_cost(graph, path)
        modes = []
        for i in range(len(path) - 1):
            edges = graph.get_edges_between(path[i], path[i + 1])
            modes.append(edges[0].mode if edges else "inferred")

        # Score: lower = more critical (prefer sync, high-traffic, production)
        score = cost
        for m in modes:
            score *= MODE_PENALTIES.get(m, 1.0)

        # Boost score (penalize) if path doesn't touch critical nodes
        has_critical = any(graph.is_critical(n) for n in path)
        if not has_critical:
            score *= 1.5

        desc = " → ".join(path)
        results.append(ScoredPath(
            nodes=path,
            total_cost=round(cost, 3),
            total_score=round(score, 3),
            modes=modes,
            description=desc,
        ))

    results.sort(key=lambda p: p.total_score)
    return results


def find_critical_paths(
    graph: AnalysisGraph,
    source_id: str,
    max_destinations: int = 20,
    K: int = 3,
) -> List[dict]:
    """Find top-K paths from source to each reachable critical/important node.

    Returns a flat list of the most important impact corridors, sorted by score.
    """
    from app.analysis.engine.weighted_traversal import dijkstra_blast_radius

    traversal = dijkstra_blast_radius(graph, source_id, max_depth=10)
    # Pick the most important destination nodes
    destinations = []
    for nid, rn in traversal.reachable.items():
        if nid == source_id:
            continue
        rank = graph.criticality_rank(nid)
        # Sort by criticality desc, then cost asc
        destinations.append((rank, rn.cost, nid))

    destinations.sort(key=lambda x: (-x[0], x[1]))
    destinations = destinations[:max_destinations]

    all_paths = []
    for _, _, target_id in destinations:
        paths = k_shortest_paths(graph, source_id, target_id, K=K)
        for sp in paths:
            all_paths.append({
                "source": source_id,
                "target": target_id,
                "path": sp.nodes,
                "cost": sp.total_cost,
                "score": sp.total_score,
                "modes": sp.modes,
                "description": sp.description,
            })

    all_paths.sort(key=lambda p: p["score"])
    return all_paths
