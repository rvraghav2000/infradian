"""
Multi-factor action ranking.

Produces three ranked lists: top risks, safe deletion candidates,
and waste candidates, each with composite scores and explanations.
"""

from __future__ import annotations
from typing import List, Dict, Optional
from app.analysis.engine.graph_model import AnalysisGraph
from app.analysis.engine.resilience import ResilienceAnalyzer
from app.analysis.engine.confidence import ConfidenceModel
from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
from app.analysis.engine.safe_delete import SafeDeleteEngine, DECISION_SAFE
from app.analysis.engine.explanation import explain_action


class ActionRanker:
    """Ranks nodes by risk, deletion safety, and waste opportunity."""

    def __init__(
        self,
        graph: AnalysisGraph,
        resilience: ResilienceAnalyzer,
        confidence_model: ConfidenceModel,
    ):
        self.graph = graph
        self.resilience = resilience
        self.confidence_model = confidence_model

    def rank(self, limit: int = 5) -> dict:
        """Compute all three ranked action lists."""
        importance_map = self.resilience.compute_all_importance()
        safe_delete_engine = SafeDeleteEngine(self.graph, self.resilience, self.confidence_model)

        top_risks = self._rank_risks(importance_map, limit)
        safe_deletions = self._rank_safe_deletions(safe_delete_engine, importance_map, limit)
        waste = self._rank_waste(limit)

        return {
            "topRisks": top_risks,
            "safeDeletionCandidates": safe_deletions,
            "wasteCandidates": waste,
        }

    def _rank_risks(self, importance_map: dict, limit: int) -> List[dict]:
        """Rank nodes by risk severity.

        Score = 0.4×blast_severity + 0.25×importance + 0.2×is_spof + 0.15×criticality
        """
        results = []
        node_count = max(self.graph.node_count() - 1, 1)

        for node_id in self.graph.node_ids:
            node = self.graph.get_node(node_id)
            if not node:
                continue

            # Blast severity (normalized)
            traversal = dijkstra_blast_radius(self.graph, node_id, max_depth=5)
            raw_impact = sum(
                1.0 / max(rn.cost, 0.1)
                for nid, rn in traversal.reachable.items()
                if nid != node_id
            )
            blast_severity = min(raw_impact / node_count, 1.0)

            # Importance
            imp = importance_map.get(node_id)
            importance = imp.composite_score if imp else 0.0

            # SPOF
            is_spof, _ = self.resilience.is_single_point_of_failure(node_id)
            spof_score = 1.0 if is_spof else 0.0

            # Criticality
            crit_rank = self.graph.criticality_rank(node_id)
            crit_norm = crit_rank / 4.0

            composite = (
                0.40 * blast_severity
                + 0.25 * importance
                + 0.20 * spof_score
                + 0.15 * crit_norm
            )

            confidence = self.confidence_model.compute_overall(node_id)

            results.append({
                "nodeId": node_id,
                "label": node.label,
                "score": round(composite, 3),
                "confidence": round(confidence, 3),
                "isSpof": is_spof,
                "blastSeverity": round(blast_severity, 3),
                "summary": explain_action("risk", node_id, node.label, composite, {
                    "blast_severity": blast_severity,
                    "importance": importance,
                    "is_spof": is_spof,
                }),
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def _rank_safe_deletions(
        self, engine: SafeDeleteEngine, importance_map: dict, limit: int
    ) -> List[dict]:
        """Rank safe-to-delete candidates.

        Score = 0.4×evidence_score + 0.3×cost_opportunity + 0.3×confidence
        """
        results = []

        for node_id in self.graph.node_ids:
            node = self.graph.get_node(node_id)
            if not node:
                continue

            decision = engine.evaluate(node_id)
            if decision["decision"] != DECISION_SAFE:
                continue

            evidence_score = decision["evidenceScore"]
            cost_opp = min(node.monthly_cost / 500.0, 1.0)  # normalize to $500 scale
            confidence = decision["confidence"]

            composite = (
                0.40 * evidence_score
                + 0.30 * cost_opp
                + 0.30 * confidence
            )

            results.append({
                "nodeId": node_id,
                "label": node.label,
                "score": round(composite, 3),
                "confidence": round(confidence, 3),
                "monthlyCost": node.monthly_cost,
                "evidenceReasons": decision["evidenceReasons"],
                "summary": explain_action("safe_delete", node_id, node.label, composite, {
                    "monthly_cost": node.monthly_cost,
                    "evidence": decision["evidenceReasons"],
                }),
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def _rank_waste(self, limit: int) -> List[dict]:
        """Rank waste candidates.

        Score = 0.5×cost_inefficiency + 0.3×low_usage + 0.2×low_traffic
        """
        results = []

        for node_id in self.graph.node_ids:
            node = self.graph.get_node(node_id)
            if not node:
                continue
            if node.monthly_cost <= 0:
                continue

            cost_ineff = (1.0 - node.usage_score) * min(node.monthly_cost / 500.0, 1.0)
            low_usage = 1.0 - node.usage_score
            low_traffic = 1.0 - node.traffic_score

            composite = (
                0.50 * cost_ineff
                + 0.30 * low_usage
                + 0.20 * low_traffic
            )

            confidence = self.confidence_model.compute_overall(node_id)

            results.append({
                "nodeId": node_id,
                "label": node.label,
                "score": round(composite, 3),
                "confidence": round(confidence, 3),
                "monthlyCost": node.monthly_cost,
                "usageScore": node.usage_score,
                "summary": explain_action("waste", node_id, node.label, composite, {
                    "monthly_cost": node.monthly_cost,
                    "usage_score": node.usage_score,
                    "traffic_score": node.traffic_score,
                }),
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]
