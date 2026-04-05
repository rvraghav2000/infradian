"""
Constraint-based safe-to-delete decision engine.

Uses hard blockers, weighted evidence, and a confidence gate
to classify nodes as SAFE_TO_DELETE, UNSAFE_TO_DELETE, or UNCERTAIN.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from app.analysis.engine.graph_model import AnalysisGraph
from app.analysis.engine.resilience import ResilienceAnalyzer
from app.analysis.engine.confidence import ConfidenceModel
from app.analysis.engine.weighted_traversal import dijkstra_blast_radius
from app.analysis.engine.path_analysis import find_critical_paths


DECISION_SAFE = "SAFE_TO_DELETE"
DECISION_UNSAFE = "UNSAFE_TO_DELETE"
DECISION_UNCERTAIN = "UNCERTAIN"


@dataclass
class SafeDeleteDecision:
    node_id: str
    decision: str
    confidence: float
    blocker_reasons: List[str]
    evidence_reasons: List[str]
    evidence_score: float
    impact_score: float
    critical_paths: int
    summary: str

    def to_dict(self) -> dict:
        return {
            "nodeId": self.node_id,
            "decision": self.decision,
            "confidence": round(self.confidence, 3),
            "blockerReasons": self.blocker_reasons,
            "evidenceReasons": self.evidence_reasons,
            "evidenceScore": round(self.evidence_score, 3),
            "impactScore": round(self.impact_score, 3),
            "criticalPaths": self.critical_paths,
            "summary": self.summary,
        }


class SafeDeleteEngine:
    """Evaluates whether a node can be safely removed."""

    BLAST_RADIUS_THRESHOLD = 0.7  # normalized 0-1
    EVIDENCE_THRESHOLD = 0.5
    CONFIDENCE_GATE = 0.5

    def __init__(
        self,
        graph: AnalysisGraph,
        resilience: ResilienceAnalyzer,
        confidence_model: ConfidenceModel,
    ):
        self.graph = graph
        self.resilience = resilience
        self.confidence_model = confidence_model

    def evaluate(self, node_id: str) -> dict:
        """Run the full safe-delete evaluation pipeline."""
        node = self.graph.get_node(node_id)
        if not node:
            return SafeDeleteDecision(
                node_id=node_id,
                decision=DECISION_UNCERTAIN,
                confidence=0.0,
                blocker_reasons=["Node not found in graph"],
                evidence_reasons=[],
                evidence_score=0.0,
                impact_score=0.0,
                critical_paths=0,
                summary=f"Cannot evaluate {node_id}: node not found.",
            ).to_dict()

        blockers = self._check_hard_blockers(node_id)
        evidence, evidence_score = self._compute_evidence(node_id)
        confidence_report = self.confidence_model.compute(node_id)
        confidence_val = confidence_report["overall"]

        # Compute impact for response
        traversal = dijkstra_blast_radius(self.graph, node_id, max_depth=10)
        max_possible = max(self.graph.node_count() - 1, 1)
        raw_impact = sum(
            1.0 / max(rn.cost, 0.1)
            for nid, rn in traversal.reachable.items()
            if nid != node_id
        )
        impact_score = min(raw_impact / max_possible, 1.0)

        critical_paths_list = find_critical_paths(self.graph, node_id, max_destinations=5, K=2)
        critical_path_count = len(critical_paths_list)

        # Decision logic
        if blockers:
            decision = DECISION_UNSAFE
        elif confidence_val < self.CONFIDENCE_GATE:
            decision = DECISION_UNCERTAIN
        elif evidence_score >= self.EVIDENCE_THRESHOLD:
            decision = DECISION_SAFE
        else:
            decision = DECISION_UNCERTAIN

        from app.analysis.engine.explanation import explain_safe_delete

        result = SafeDeleteDecision(
            node_id=node_id,
            decision=decision,
            confidence=confidence_val,
            blocker_reasons=blockers,
            evidence_reasons=evidence,
            evidence_score=evidence_score,
            impact_score=impact_score,
            critical_paths=critical_path_count,
            summary="",
        )
        result.summary = explain_safe_delete(result.to_dict())
        return result.to_dict()

    def _check_hard_blockers(self, node_id: str) -> List[str]:
        """Check for hard blockers that prevent deletion."""
        blockers: List[str] = []
        node = self.graph.get_node(node_id)
        if not node:
            return ["Node not found"]

        # 1. Node is production-critical
        if node.criticality == "critical":
            blockers.append(f"Node is marked as criticality=critical")

        # 2. Node is an articulation point with critical descendants
        importance = self.resilience.get_importance(node_id)
        if importance and importance.is_articulation_point:
            # Check if any critical node depends on it
            traversal = dijkstra_blast_radius(self.graph, node_id, max_depth=10)
            has_critical_downstream = any(
                self.graph.is_critical(nid)
                for nid in traversal.reachable
                if nid != node_id
            )
            if has_critical_downstream:
                blockers.append("Node is a graph cut-point with critical downstream services")

        # 3. No redundant path for critical downstream
        is_spof, affected = self.resilience.is_single_point_of_failure(node_id)
        if is_spof:
            blockers.append(
                f"Single point of failure for: {', '.join(affected[:3])}"
                + (f" (+{len(affected)-3} more)" if len(affected) > 3 else "")
            )

        # 4. High blast radius
        traversal = dijkstra_blast_radius(self.graph, node_id, max_depth=10)
        max_possible = max(self.graph.node_count() - 1, 1)
        raw_impact = sum(
            1.0 / max(rn.cost, 0.1)
            for nid, rn in traversal.reachable.items()
            if nid != node_id
        )
        impact_norm = min(raw_impact / max_possible, 1.0)
        if impact_norm > self.BLAST_RADIUS_THRESHOLD:
            blockers.append(f"High blast radius impact ({impact_norm:.0%} of graph)")

        # 5. On a critical production path (high-importance + production env)
        if importance and importance.composite_score > 0.7 and node.environment == "production":
            blockers.append(f"High structural importance ({importance.composite_score:.2f}) in production")

        return blockers

    def _compute_evidence(self, node_id: str) -> Tuple[List[str], float]:
        """Compute weighted evidence supporting deletion."""
        evidence: List[str] = []
        score = 0.0
        node = self.graph.get_node(node_id)
        if not node:
            return evidence, score

        # Low usage
        if node.usage_score < 0.1:
            evidence.append(f"Very low usage ({node.usage_score:.0%})")
            score += 0.3

        # Stale (no last_seen_at or old)
        if node.last_seen_at is None:
            evidence.append("No recent activity timestamp")
            score += 0.1
        else:
            from datetime import datetime, timezone
            age_days = (datetime.now(timezone.utc) - node.last_seen_at).total_seconds() / 86400
            if age_days > 30:
                evidence.append(f"Stale: last seen {int(age_days)} days ago")
                score += 0.2

        # Low graph importance
        importance = self.resilience.get_importance(node_id)
        if importance and importance.composite_score < 0.2:
            evidence.append(f"Low graph importance ({importance.composite_score:.2f})")
            score += 0.2

        # Low business criticality
        if node.criticality in ("low",):
            evidence.append(f"Low business criticality ({node.criticality})")
            score += 0.15

        # High cost inefficiency
        if node.monthly_cost > 0 and node.usage_score < 0.3:
            efficiency = node.usage_score / max(node.monthly_cost / 100, 0.01)  # normalize
            if efficiency < 0.1:
                evidence.append(
                    f"Cost inefficient: ${node.monthly_cost:.0f}/mo at {node.usage_score:.0%} usage"
                )
                score += 0.15

        return evidence, min(score, 1.0)
