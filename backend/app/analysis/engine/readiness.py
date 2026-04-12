"""
Readiness & completeness scoring for planned architectures.

Computes three numeric scores (0–100):
  - Completeness: are all required pieces present?
  - Readiness: is the topology structurally sound?
  - Confidence: how much do we trust the edge data?

Based on: missing deps, invalid relationships, isolated nodes,
lack of redundancy, low-confidence edges.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from app.analysis.engine.graph_model import AnalysisGraph
from app.analysis.engine.validation import ArchitectureValidator
from app.analysis.engine.confidence import ConfidenceModel
from app.analysis.engine.resilience import ResilienceAnalyzer


class ReadinessScorer:
    """Scores a proposed architecture for deployment readiness."""

    def __init__(self, graph: AnalysisGraph):
        self.graph = graph

    def score(self) -> dict:
        """Compute all three scores + categorized warnings."""
        completeness = self._compute_completeness()
        readiness = self._compute_readiness()
        confidence = self._compute_confidence()

        # Aggregate warnings
        warnings = (
            completeness["warnings"]
            + readiness["warnings"]
            + confidence["warnings"]
        )

        # Summary
        avg = (completeness["score"] + readiness["score"] + confidence["score"]) / 3

        if avg >= 80:
            summary = "Architecture is well-defined and ready for deployment."
        elif avg >= 50:
            summary = "Architecture has gaps — review warnings before deploying."
        else:
            summary = "Architecture is incomplete — significant issues need resolution."

        return {
            "completeness": completeness,
            "readiness": readiness,
            "confidence": confidence,
            "overallScore": round(avg, 1),
            "warnings": warnings,
            "summary": summary,
        }

    def _compute_completeness(self) -> dict:
        """Score based on missing dependencies and isolated nodes."""
        total_nodes = self.graph.node_count()
        if total_nodes == 0:
            return {"score": 0, "detail": "No nodes in graph", "warnings": []}

        warnings: List[str] = []
        penalty = 0.0

        # Check required deps satisfaction
        for node in self.graph.nodes_map.values():
            required = node.resolved_required_deps()
            if not required:
                continue

            connected_types = set()
            for e in self.graph.get_outbound(node.id):
                t = self.graph.get_node(e.target)
                if t:
                    connected_types.add(t.type)
            for e in self.graph.get_inbound(node.id):
                s = self.graph.get_node(e.source)
                if s:
                    connected_types.add(s.type)
            if node.parent_id:
                p = self.graph.get_node(node.parent_id)
                if p:
                    connected_types.add(p.type)

            for req in required:
                if req not in connected_types:
                    penalty += 15.0
                    warnings.append(f"Missing: {node.label} needs {req}")

        # Check for isolated planned nodes
        planned_nodes = [n for n in self.graph.nodes_map.values() if n.status in ("planned", "expected")]
        for pn in planned_nodes:
            edges = len(self.graph.get_outbound(pn.id)) + len(self.graph.get_inbound(pn.id))
            if edges == 0 and pn.parent_id is None:
                penalty += 10.0
                warnings.append(f"Isolated: {pn.label} has no connections")

        score = max(0.0, 100.0 - penalty)
        return {
            "score": round(score, 1),
            "detail": f"{len(warnings)} completeness issues found",
            "warnings": warnings,
        }

    def _compute_readiness(self) -> dict:
        """Score based on structural integrity and validation results."""
        warnings: List[str] = []
        penalty = 0.0

        # Run validation
        validator = ArchitectureValidator(self.graph)
        validation = validator.validate()

        # Penalty per issue
        penalty += validation["errorCount"] * 20.0
        penalty += validation["warningCount"] * 5.0
        penalty += validation["infoCount"] * 1.0

        for issue in validation["issues"]:
            if issue["severity"] == "error":
                warnings.append(f"Error: {issue['message']}")
            elif issue["severity"] == "warning":
                warnings.append(f"Warning: {issue['message']}")

        # Check critical nodes have redundancy
        resilience = ResilienceAnalyzer(self.graph)
        aps = resilience.find_articulation_points()
        for ap_id in aps:
            node = self.graph.get_node(ap_id)
            if node and node.criticality in ("critical", "high"):
                penalty += 10.0
                warnings.append(f"SPOF: {node.label} is an articulation point with {node.criticality} criticality")

        score = max(0.0, 100.0 - penalty)
        return {
            "score": round(score, 1),
            "detail": f"Validation: {validation['errorCount']} errors, {validation['warningCount']} warnings",
            "warnings": warnings,
        }

    def _compute_confidence(self) -> dict:
        """Score based on edge confidence and telemetry coverage."""
        warnings: List[str] = []

        if self.graph.node_count() == 0:
            return {"score": 0, "detail": "No nodes", "warnings": []}

        conf_model = ConfidenceModel(self.graph)
        report = conf_model.compute()
        overall = report["overall"] * 100  # 0–1 → 0–100

        # Check for low-confidence edges
        low_conf_edges = [
            e for e in self.graph.all_edge_records
            if e.confidence < 0.5
        ]
        if low_conf_edges:
            warnings.append(f"{len(low_conf_edges)} edge{'s' if len(low_conf_edges) != 1 else ''} with low confidence (<50%)")

        # Check for inferred edges
        inferred_edges = [
            e for e in self.graph.all_edge_records
            if e.inferred
        ]
        if inferred_edges:
            warnings.append(f"{len(inferred_edges)} inferred edge{'s' if len(inferred_edges) != 1 else ''} (not explicitly declared)")

        # Check for nodes without telemetry
        no_telemetry = [
            n for n in self.graph.nodes_map.values()
            if not n.metrics or n.metrics.current_load == 0.0
        ]
        if len(no_telemetry) > self.graph.node_count() * 0.5:
            warnings.append(f"{len(no_telemetry)}/{self.graph.node_count()} nodes lack telemetry data")

        return {
            "score": round(overall, 1),
            "detail": f"Overall confidence: {overall:.0f}%",
            "warnings": warnings,
        }
