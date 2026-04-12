"""
Infradian Decision Engine — production-grade graph analysis.

Usage:
    from app.analysis.engine import DecisionEngine
    engine = DecisionEngine(nodes, edges)
    result = engine.blast_radius("node-id")
"""

from app.analysis.engine.graph_model import AnalysisGraph
from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
from app.analysis.engine.path_analysis import k_shortest_paths, find_critical_paths
from app.analysis.engine.resilience import ResilienceAnalyzer
from app.analysis.engine.safe_delete import SafeDeleteEngine
from app.analysis.engine.simulation import RemovalSimulator
from app.analysis.engine.confidence import ConfidenceModel
from app.analysis.engine.ranking import ActionRanker
from app.analysis.engine.explanation import explain_blast_radius, explain_safe_delete, explain_simulation
from app.analysis.engine.diff_engine import DiffEngine
from app.analysis.engine.validation import ArchitectureValidator
from app.analysis.engine.readiness import ReadinessScorer

from typing import List, Optional
from app.models import Node, Edge


class DecisionEngine:
    """Facade that wires all analysis modules together."""

    def __init__(self, nodes: List[Node], edges: List[Edge]):
        self.graph = AnalysisGraph(nodes, edges)
        self._resilience: Optional[ResilienceAnalyzer] = None
        self._confidence: Optional[ConfidenceModel] = None

    @property
    def resilience(self) -> ResilienceAnalyzer:
        if self._resilience is None:
            self._resilience = ResilienceAnalyzer(self.graph)
        return self._resilience

    @property
    def confidence_model(self) -> ConfidenceModel:
        if self._confidence is None:
            self._confidence = ConfidenceModel(self.graph)
        return self._confidence

    def blast_radius(self, node_id: str, max_depth: int = 10, max_cost: float = float("inf")) -> dict:
        from app.analysis.engine.weighted_traversal import dijkstra_blast_radius, build_blast_radius_response
        traversal = dijkstra_blast_radius(self.graph, node_id, max_depth, max_cost)
        critical_paths = find_critical_paths(self.graph, node_id, max_destinations=10, K=3)
        confidence = self.confidence_model.compute(node_id)
        return build_blast_radius_response(
            self.graph, node_id, traversal, critical_paths, confidence
        )

    def safe_delete(self, node_id: str) -> dict:
        engine = SafeDeleteEngine(self.graph, self.resilience, self.confidence_model)
        return engine.evaluate(node_id)

    def simulate_removal(self, node_id: str) -> dict:
        sim = RemovalSimulator(self.graph)
        return sim.simulate(node_id)

    def top_actions(self, limit: int = 5) -> dict:
        ranker = ActionRanker(self.graph, self.resilience, self.confidence_model)
        return ranker.rank(limit)

    def validate(self) -> dict:
        """Run architecture validation rules."""
        validator = ArchitectureValidator(self.graph)
        return validator.validate()

    def readiness(self) -> dict:
        """Compute readiness/completeness scores."""
        scorer = ReadinessScorer(self.graph)
        return scorer.score()

    def diff(self, proposed_nodes: List[Node], proposed_edges: List[Edge]) -> dict:
        """Compute diff between current graph and a proposed graph."""
        proposed_graph = AnalysisGraph(proposed_nodes, proposed_edges)
        differ = DiffEngine(self.graph, proposed_graph)
        return differ.compute_diff().to_dict()

    def simulate_mutations(
        self,
        add_nodes: Optional[List[Node]] = None,
        remove_node_ids: Optional[List[str]] = None,
        add_edges: Optional[List[Edge]] = None,
    ) -> dict:
        """Simulate graph mutations and return impact analysis."""
        mutated = self.graph.clone_with_mutations(
            add_nodes=add_nodes,
            remove_node_ids=remove_node_ids,
            add_edges=add_edges,
        )

        # Compute diff
        differ = DiffEngine(self.graph, mutated)
        diff_result = differ.compute_diff().to_dict()

        # Validate proposed
        validator = ArchitectureValidator(mutated)
        validation = validator.validate()

        # Readiness of proposed
        scorer = ReadinessScorer(mutated)
        readiness = scorer.score()

        return {
            "diff": diff_result,
            "validation": validation,
            "readiness": readiness,
        }
