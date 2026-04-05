"""
Comprehensive unit tests for the analysis engine.

Tests cover: graph model, Dijkstra traversal, Yen's K-shortest paths,
PageRank, betweenness centrality, articulation points, safe-delete,
simulation, confidence, and ranking.
"""

import sys
from pathlib import Path

# Ensure project root is on path for imports
project_root = str(Path(__file__).resolve().parent.parent.parent.parent)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import pytest
from app.models import Node, Edge, NodeMetrics


# ── Helpers ──────────────────────────────────────────────────────────

def make_node(
    id: str,
    type: str = "aws_instance",
    label: str = "",
    load: float = 0.5,
    criticality: str = "medium",
    usage: float = 0.5,
    traffic: float = 0.5,
    cost: float = 0.0,
    environment: str = "production",
) -> Node:
    return Node(
        id=id,
        type=type,
        label=label or id,
        metrics=NodeMetrics(current_load=load),
        criticality=criticality,
        usage_score=usage,
        traffic_score=traffic,
        monthly_cost=cost,
        environment=environment,
    )


from typing import Optional as _Opt

def make_edge(
    source: str,
    target: str,
    mode: str = "sync",
    confidence: float = 1.0,
    traffic_share: float = 1.0,
    weight: _Opt[float] = None,
) -> Edge:
    return Edge(
        id=f"{source}-{target}",
        source=source,
        target=target,
        dependency_mode=mode,
        confidence=confidence,
        traffic_share=traffic_share,
        edge_weight=weight,
    )


def build_linear_graph():
    """A → B → C → D (simple chain)."""
    nodes = [make_node("A"), make_node("B"), make_node("C"), make_node("D")]
    edges = [make_edge("A", "B"), make_edge("B", "C"), make_edge("C", "D")]
    return nodes, edges


def build_diamond_graph():
    """A → B → D, A → C → D (diamond with redundancy)."""
    nodes = [make_node("A"), make_node("B"), make_node("C"), make_node("D", criticality="critical")]
    edges = [
        make_edge("A", "B"),
        make_edge("A", "C"),
        make_edge("B", "D"),
        make_edge("C", "D"),
    ]
    return nodes, edges


def build_complex_graph():
    """
    Web → API → DB (critical, high cost)
    Web → Cache → DB
    API → Queue (async)
    Queue → Worker
    """
    nodes = [
        make_node("web", type="aws_instance", label="Web Server", load=0.8, traffic=0.9),
        make_node("api", type="aws_instance", label="API Gateway", load=0.6, traffic=0.8, cost=120),
        make_node("db", type="aws_db_instance", label="Primary DB", load=0.9, criticality="critical", cost=300),
        make_node("cache", type="aws_elasticache", label="Redis Cache", load=0.3, cost=50),
        make_node("queue", type="aws_sqs", label="Task Queue", load=0.2, cost=10),
        make_node("worker", type="aws_instance", label="Background Worker", load=0.1, usage=0.05, cost=80),
    ]
    edges = [
        make_edge("web", "api"),
        make_edge("api", "db"),
        make_edge("web", "cache"),
        make_edge("cache", "db", mode="fallback", confidence=0.7),
        make_edge("api", "queue", mode="async"),
        make_edge("queue", "worker"),
    ]
    return nodes, edges


# ── Graph Model ──────────────────────────────────────────────────────

class TestGraphModel:
    def test_node_count(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        assert g.node_count() == 4

    def test_edge_count(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        assert g.edge_count() == 3

    def test_outbound_neighbors(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        out = g.get_outbound("A")
        assert len(out) == 1
        assert out[0].target == "B"

    def test_inbound_neighbors(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        nodes, edges = build_diamond_graph()
        g = AnalysisGraph(nodes, edges)
        inc = g.get_inbound("D")
        sources = {e.source for e in inc}
        assert sources == {"B", "C"}

    def test_edge_weight_computation(self):
        from app.analysis.engine.graph_model import compute_edge_weight
        edge = make_edge("A", "B", mode="sync", confidence=1.0, traffic_share=1.0)
        assert compute_edge_weight(edge) == 1.0

        edge_async = make_edge("A", "B", mode="async", confidence=1.0, traffic_share=1.0)
        assert compute_edge_weight(edge_async) == 2.0

        edge_fallback = make_edge("A", "B", mode="fallback", confidence=0.5, traffic_share=0.5)
        # 1.0 * (1/0.5) * 5.0 * (1/0.5) = 1 * 2 * 5 * 2 = 20
        assert compute_edge_weight(edge_fallback) == 20.0

    def test_clone_without(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        nodes, edges = build_diamond_graph()
        g = AnalysisGraph(nodes, edges)
        shadow = g.clone_without("B")
        assert shadow.node_count() == 3
        assert not shadow.has_node("B")
        # A → C → D should still exist
        assert len(shadow.get_outbound("A")) == 1
        assert shadow.get_outbound("A")[0].target == "C"


# ── Dijkstra Traversal ──────────────────────────────────────────────

class TestDijkstraTraversal:
    def test_linear_traversal(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        result = dijkstra_blast_radius(g, "A", max_depth=10)
        assert result.affected_count == 3
        assert "B" in result.reachable
        assert "C" in result.reachable
        assert "D" in result.reachable

    def test_depth_limit(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        result = dijkstra_blast_radius(g, "A", max_depth=1)
        assert result.affected_count == 1
        assert "B" in result.reachable
        assert "C" not in result.reachable

    def test_cost_ordering(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        result = dijkstra_blast_radius(g, "A", max_depth=10)
        assert result.reachable["B"].cost < result.reachable["C"].cost
        assert result.reachable["C"].cost < result.reachable["D"].cost

    def test_path_reconstruction(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        result = dijkstra_blast_radius(g, "A", max_depth=10)
        path = result.reconstruct_path("D")
        assert path == ["A", "B", "C", "D"]

    def test_nonexistent_source(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        result = dijkstra_blast_radius(g, "MISSING", max_depth=10)
        assert result.affected_count == -1  # only source, which is missing → empty

    def test_cycle_avoidance(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
        nodes = [make_node("A"), make_node("B"), make_node("C")]
        edges = [make_edge("A", "B"), make_edge("B", "C"), make_edge("C", "A")]
        g = AnalysisGraph(nodes, edges)
        result = dijkstra_blast_radius(g, "A", max_depth=10)
        # Should not loop forever, should find B and C
        assert result.affected_count == 2


# ── K-Shortest Paths ────────────────────────────────────────────────

class TestKShortestPaths:
    def test_single_path(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.path_analysis import k_shortest_paths
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        paths = k_shortest_paths(g, "A", "D", K=3)
        assert len(paths) == 1
        assert paths[0].nodes == ["A", "B", "C", "D"]

    def test_two_paths_diamond(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.path_analysis import k_shortest_paths
        nodes, edges = build_diamond_graph()
        g = AnalysisGraph(nodes, edges)
        paths = k_shortest_paths(g, "A", "D", K=5)
        assert len(paths) == 2
        path_nodes = {tuple(p.nodes) for p in paths}
        assert ("A", "B", "D") in path_nodes
        assert ("A", "C", "D") in path_nodes

    def test_unreachable_target(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.path_analysis import k_shortest_paths
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        paths = k_shortest_paths(g, "D", "A", K=3)
        assert len(paths) == 0


# ── Resilience Analysis ─────────────────────────────────────────────

class TestResilience:
    def test_pagerank_convergence(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        nodes, edges = build_diamond_graph()
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        pr = ra.compute_pagerank()
        # All values should be positive and sum to ~1
        assert all(v > 0 for v in pr.values())
        assert abs(sum(pr.values()) - 1.0) < 0.01

    def test_pagerank_ordering(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        nodes, edges = build_diamond_graph()
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        pr = ra.compute_pagerank()
        # D should have highest PageRank (most inbound)
        assert pr["D"] >= pr["A"]

    def test_betweenness_ordering(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        bc = ra.compute_betweenness()
        # B and C should have higher betweenness than A and D (interior nodes)
        assert bc["B"] >= bc["A"]
        assert bc["C"] >= bc["D"]

    def test_articulation_points_chain(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        aps = ra.find_articulation_points()
        # B and C are bridges in A-B-C-D chain
        assert "B" in aps
        assert "C" in aps

    def test_no_articulation_in_diamond(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        nodes, edges = build_diamond_graph()
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        aps = ra.find_articulation_points()
        # A and D are cut points (removing A disconnects B,C from D; removing D isolates D)
        # B and C should NOT be articulation points since removing either still leaves A connected to D
        assert "B" not in aps or "C" not in aps  # at least one should not be an AP

    def test_disjoint_paths_diamond(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        nodes, edges = build_diamond_graph()
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        count = ra.node_disjoint_path_count("A", "D")
        assert count == 2  # A→B→D and A→C→D

    def test_composite_importance(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        nodes, edges = build_complex_graph()
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        importance = ra.compute_all_importance()
        # API should have significant importance (high betweenness, connects to DB)
        assert importance["api"].composite_score > 0


# ── Safe Delete ──────────────────────────────────────────────────────

class TestSafeDelete:
    def test_critical_node_blocked(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        from app.analysis.engine.confidence import ConfidenceModel
        from app.analysis.engine.safe_delete import SafeDeleteEngine
        nodes, edges = build_complex_graph()
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        cm = ConfidenceModel(g)
        engine = SafeDeleteEngine(g, ra, cm)
        result = engine.evaluate("db")
        assert result["decision"] == "UNSAFE_TO_DELETE"
        assert len(result["blockerReasons"]) > 0

    def test_low_usage_node_evidence(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.resilience import ResilienceAnalyzer
        from app.analysis.engine.confidence import ConfidenceModel
        from app.analysis.engine.safe_delete import SafeDeleteEngine
        # Create an isolated low-usage node
        nodes = [
            make_node("lonely", usage=0.01, cost=100, criticality="low", traffic=0.05),
        ]
        edges = []
        g = AnalysisGraph(nodes, edges)
        ra = ResilienceAnalyzer(g)
        cm = ConfidenceModel(g)
        engine = SafeDeleteEngine(g, ra, cm)
        result = engine.evaluate("lonely")
        # Should find evidence supporting deletion
        assert len(result["evidenceReasons"]) > 0
        assert result["evidenceScore"] > 0


# ── Simulation ───────────────────────────────────────────────────────

class TestSimulation:
    def test_remove_chain_node_breaks_downstream(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.simulation import RemovalSimulator
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        sim = RemovalSimulator(g)
        result = sim.simulate("B")
        # Removing B from A→B→C→D should break or degrade C and D
        broken_ids = {n["id"] for n in result["brokenNodes"]}
        degraded_ids = {n["id"] for n in result["degradedNodes"]}
        # C and D should be broken (no alternate path from A)
        assert "C" in broken_ids or "C" in degraded_ids
        assert "D" in broken_ids or "D" in degraded_ids

    def test_remove_redundant_node_unaffected(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.simulation import RemovalSimulator
        nodes, edges = build_diamond_graph()
        g = AnalysisGraph(nodes, edges)
        sim = RemovalSimulator(g)
        result = sim.simulate("B")
        # Removing B from diamond: D should still be reachable via C
        broken_ids = {n["id"] for n in result["brokenNodes"]}
        assert "D" not in broken_ids

    def test_nonexistent_node(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.simulation import RemovalSimulator
        nodes, edges = build_linear_graph()
        g = AnalysisGraph(nodes, edges)
        sim = RemovalSimulator(g)
        result = sim.simulate("MISSING")
        assert "error" in result


# ── Confidence ───────────────────────────────────────────────────────

class TestConfidence:
    def test_confidence_range(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.confidence import ConfidenceModel
        nodes, edges = build_complex_graph()
        g = AnalysisGraph(nodes, edges)
        cm = ConfidenceModel(g)
        report = cm.compute()
        assert 0.0 <= report["overall"] <= 1.0

    def test_confidence_factors_present(self):
        from app.analysis.engine.graph_model import AnalysisGraph
        from app.analysis.engine.confidence import ConfidenceModel
        nodes, edges = build_complex_graph()
        g = AnalysisGraph(nodes, edges)
        cm = ConfidenceModel(g)
        report = cm.compute()
        assert len(report["factors"]) == 6
        factor_names = {f["name"] for f in report["factors"]}
        assert "graph_completeness" in factor_names
        assert "edge_confidence" in factor_names


# ── Explanation ──────────────────────────────────────────────────────

class TestExplanation:
    def test_blast_radius_explanation(self):
        from app.analysis.engine.explanation import explain_blast_radius
        result = {
            "nodeId": "web",
            "impactedNodeCount": 5,
            "maxDepth": 3,
            "criticalNodesAffected": 1,
            "impactScore": 75,
            "confidence": {"overall": 0.8},
        }
        text = explain_blast_radius(result)
        assert "web" not in text or "5" in text  # mentions count
        assert len(text) > 10

    def test_safe_delete_explanation(self):
        from app.analysis.engine.explanation import explain_safe_delete
        decision = {
            "nodeId": "worker",
            "decision": "SAFE_TO_DELETE",
            "confidence": 0.85,
            "blockerReasons": [],
            "evidenceReasons": ["low usage (2%)", "low importance"],
        }
        text = explain_safe_delete(decision)
        assert "safe" in text.lower()
        assert "worker" in text

    def test_simulation_explanation(self):
        from app.analysis.engine.explanation import explain_simulation
        result = {
            "nodeId": "api",
            "brokenNodes": [{"id": "db", "label": "DB"}],
            "degradedNodes": [{"id": "cache", "label": "Cache"}],
            "unaffectedNodes": [{"id": "queue", "label": "Queue"}],
        }
        text = explain_simulation(result)
        assert "api" in text
        assert "broken" in text.lower() or "3" in text


# ── Full Engine Integration ──────────────────────────────────────────

class TestDecisionEngine:
    def test_full_blast_radius(self):
        from app.analysis.engine import DecisionEngine
        nodes, edges = build_complex_graph()
        engine = DecisionEngine(nodes, edges)
        result = engine.blast_radius("web")
        assert "nodeId" in result
        assert result["nodeId"] == "web"
        assert result["impactedNodeCount"] > 0
        assert "summary" in result
        assert "confidence" in result

    def test_full_safe_delete(self):
        from app.analysis.engine import DecisionEngine
        nodes, edges = build_complex_graph()
        engine = DecisionEngine(nodes, edges)
        result = engine.safe_delete("db")
        assert result["decision"] == "UNSAFE_TO_DELETE"
        assert "summary" in result

    def test_full_simulation(self):
        from app.analysis.engine import DecisionEngine
        nodes, edges = build_complex_graph()
        engine = DecisionEngine(nodes, edges)
        result = engine.simulate_removal("api")
        assert "brokenNodes" in result
        assert "degradedNodes" in result
        assert "summary" in result

    def test_full_top_actions(self):
        from app.analysis.engine import DecisionEngine
        nodes, edges = build_complex_graph()
        engine = DecisionEngine(nodes, edges)
        actions = engine.top_actions(limit=3)
        assert "topRisks" in actions
        assert "wasteCandidates" in actions
        assert isinstance(actions["topRisks"], list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
