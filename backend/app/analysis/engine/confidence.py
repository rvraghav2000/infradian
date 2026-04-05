"""
Deterministic confidence model (0.0 – 1.0).

Scores analysis confidence based on graph completeness, edge confidence,
telemetry quality, observation freshness, explicit-vs-inferred ratio,
and signal consistency.
"""

from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional, List
from app.analysis.engine.graph_model import AnalysisGraph


@dataclass
class ConfidenceFactor:
    """A single factor contributing to overall confidence."""
    name: str
    weight: float
    score: float  # 0.0 – 1.0
    detail: str


@dataclass
class ConfidenceReport:
    """Full confidence assessment."""
    overall: float
    factors: List[ConfidenceFactor]

    def to_dict(self) -> dict:
        return {
            "overall": round(self.overall, 3),
            "factors": [
                {
                    "name": f.name,
                    "weight": f.weight,
                    "score": round(f.score, 3),
                    "detail": f.detail,
                }
                for f in self.factors
            ],
        }


class ConfidenceModel:
    """Computes deterministic confidence scores for analysis results."""

    WEIGHTS = {
        "graph_completeness": 0.20,
        "edge_confidence": 0.25,
        "telemetry_completeness": 0.15,
        "observation_window": 0.15,
        "explicit_ratio": 0.15,
        "signal_consistency": 0.10,
    }

    def __init__(self, graph: AnalysisGraph):
        self.graph = graph
        self._report: Optional[ConfidenceReport] = None

    def compute(self, focus_node_id: Optional[str] = None) -> dict:
        """Compute confidence report, optionally focused on a specific node's neighborhood."""
        factors = []

        # 1. Graph completeness
        f1 = self._graph_completeness()
        factors.append(f1)

        # 2. Edge confidence
        f2 = self._edge_confidence(focus_node_id)
        factors.append(f2)

        # 3. Telemetry completeness
        f3 = self._telemetry_completeness()
        factors.append(f3)

        # 4. Observation window freshness
        f4 = self._observation_window()
        factors.append(f4)

        # 5. Explicit vs inferred ratio
        f5 = self._explicit_ratio()
        factors.append(f5)

        # 6. Signal consistency
        f6 = self._signal_consistency()
        factors.append(f6)

        overall = sum(f.weight * f.score for f in factors)

        report = ConfidenceReport(overall=overall, factors=factors)
        return report.to_dict()

    def compute_overall(self, focus_node_id: Optional[str] = None) -> float:
        """Return just the overall confidence score."""
        result = self.compute(focus_node_id)
        return result["overall"]

    def _graph_completeness(self) -> ConfidenceFactor:
        """Ratio of nodes with all key fields populated."""
        key_fields = ["type", "label", "environment", "criticality"]
        total = self.graph.node_count()
        if total == 0:
            return ConfidenceFactor("graph_completeness", self.WEIGHTS["graph_completeness"], 0.0, "No nodes")

        complete = 0
        for node in self.graph.nodes_map.values():
            has_all = all(
                getattr(node, f, None) is not None and getattr(node, f, "") != ""
                for f in key_fields
            )
            if has_all:
                complete += 1

        score = complete / total
        return ConfidenceFactor(
            "graph_completeness",
            self.WEIGHTS["graph_completeness"],
            score,
            f"{complete}/{total} nodes fully populated",
        )

    def _edge_confidence(self, focus_node_id: Optional[str] = None) -> ConfidenceFactor:
        """Mean edge.confidence across relevant edges."""
        edges = self.graph.all_edge_records
        if focus_node_id:
            edges = [
                e for e in edges
                if e.source == focus_node_id or e.target == focus_node_id
            ]

        if not edges:
            return ConfidenceFactor(
                "edge_confidence", self.WEIGHTS["edge_confidence"], 0.5,
                "No edges to evaluate"
            )

        avg = sum(e.confidence for e in edges) / len(edges)
        return ConfidenceFactor(
            "edge_confidence",
            self.WEIGHTS["edge_confidence"],
            avg,
            f"Mean edge confidence: {avg:.2f} across {len(edges)} edges",
        )

    def _telemetry_completeness(self) -> ConfidenceFactor:
        """Ratio of nodes with non-default metric values."""
        total = self.graph.node_count()
        if total == 0:
            return ConfidenceFactor("telemetry_completeness", self.WEIGHTS["telemetry_completeness"], 0.0, "No nodes")

        has_telemetry = 0
        for node in self.graph.nodes_map.values():
            if node.metrics and node.metrics.current_load > 0.0:
                has_telemetry += 1

        score = has_telemetry / total
        return ConfidenceFactor(
            "telemetry_completeness",
            self.WEIGHTS["telemetry_completeness"],
            score,
            f"{has_telemetry}/{total} nodes have active telemetry",
        )

    def _observation_window(self) -> ConfidenceFactor:
        """Freshness based on last_seen_at and last_validated_at timestamps."""
        now = datetime.now(timezone.utc)
        scores = []

        for node in self.graph.nodes_map.values():
            if node.last_seen_at:
                age_days = (now - node.last_seen_at).total_seconds() / 86400
                scores.append(max(0.0, 1.0 - (age_days / 90)))  # decay over 90 days
            else:
                scores.append(0.5)  # unknown = moderate confidence

        for edge_rec in self.graph.all_edge_records:
            if edge_rec.edge.last_validated_at:
                age_days = (now - edge_rec.edge.last_validated_at).total_seconds() / 86400
                scores.append(max(0.0, 1.0 - (age_days / 90)))
            else:
                scores.append(0.5)

        avg = sum(scores) / len(scores) if scores else 0.5
        return ConfidenceFactor(
            "observation_window",
            self.WEIGHTS["observation_window"],
            avg,
            f"Average freshness: {avg:.2f}",
        )

    def _explicit_ratio(self) -> ConfidenceFactor:
        """Fraction of edges with mode ≠ 'inferred'."""
        edges = self.graph.all_edge_records
        if not edges:
            return ConfidenceFactor("explicit_ratio", self.WEIGHTS["explicit_ratio"], 0.5, "No edges")

        explicit = sum(1 for e in edges if e.mode != "inferred")
        ratio = explicit / len(edges)
        return ConfidenceFactor(
            "explicit_ratio",
            self.WEIGHTS["explicit_ratio"],
            ratio,
            f"{explicit}/{len(edges)} edges are explicit (non-inferred)",
        )

    def _signal_consistency(self) -> ConfidenceFactor:
        """Agreement between usage_score, traffic_score, and current_load."""
        total = self.graph.node_count()
        if total == 0:
            return ConfidenceFactor("signal_consistency", self.WEIGHTS["signal_consistency"], 0.5, "No nodes")

        consistency_sum = 0.0
        for node in self.graph.nodes_map.values():
            signals = [
                node.usage_score,
                node.traffic_score,
                node.metrics.current_load if node.metrics else 0.5,
            ]
            mean = sum(signals) / len(signals)
            variance = sum((s - mean) ** 2 for s in signals) / len(signals)
            # Low variance = high consistency
            consistency_sum += max(0.0, 1.0 - (variance * 4))  # scale: variance > 0.25 → 0

        score = consistency_sum / total
        return ConfidenceFactor(
            "signal_consistency",
            self.WEIGHTS["signal_consistency"],
            score,
            f"Average signal consistency: {score:.2f}",
        )
