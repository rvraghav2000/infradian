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
        """Compute all ranked action lists, including planned insights."""
        importance_map = self.resilience.compute_all_importance()
        safe_delete_engine = SafeDeleteEngine(self.graph, self.resilience, self.confidence_model)

        top_risks = self._rank_risks(importance_map, limit)
        safe_deletions = self._rank_safe_deletions(safe_delete_engine, importance_map, limit)
        waste = self._rank_waste(limit)
        investigations = self._rank_investigations(limit)
        planned_insights = self._rank_planned_insights(limit)

        return {
            "topRisks": top_risks,
            "safeDeletionCandidates": safe_deletions,
            "wasteCandidates": waste,
            "investigationCandidates": investigations,
            "plannedInsights": planned_insights,
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
                "id": f"fix-{node_id}",
                "nodeId": node_id,
                "actionType": "FIX",
                "title": f"Fix Critical Risk on {node.label}",
                "summary": explain_action("FIX", node_id, node.label, composite, {
                    "blast_severity": blast_severity,
                    "importance": importance,
                    "is_spof": is_spof,
                }),
                "score": round(composite, 3),
                "confidence": round(confidence, 3),
                "impactScore": round(blast_severity, 3),
                "costDelta": 0,
                "priorityLevel": "High" if composite > 0.7 else "Medium",
                "reasons": ["High downstream impact", "SPOF detected"] if is_spof else ["High downstream impact"],
                "blockers": [],
                "affectedSystems": len(traversal.reachable) - 1,
                "recommendedNextStep": "Investigate downstream paths and add redundancy"
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def _rank_safe_deletions(
        self, engine: SafeDeleteEngine, importance_map: dict, limit: int
    ) -> List[dict]:
        """Rank safe-to-delete candidates."""
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
                "id": f"del-{node_id}",
                "nodeId": node_id,
                "actionType": "DELETE",
                "title": f"Safely Delete {node.label}",
                "summary": explain_action("DELETE", node_id, node.label, composite, {
                    "monthly_cost": node.monthly_cost,
                    "evidence": decision["evidenceReasons"],
                }),
                "score": round(composite, 3),
                "confidence": round(confidence, 3),
                "impactScore": 0,
                "costDelta": node.monthly_cost,
                "priorityLevel": "Medium",
                "reasons": decision["evidenceReasons"],
                "blockers": decision["blockerReasons"],
                "affectedSystems": 0,
                "recommendedNextStep": "Simulate removal, then apply terraform destroy"
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def _rank_waste(self, limit: int) -> List[dict]:
        """Rank waste candidates."""
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
            
            # Require at least some inefficiency to be considered waste
            if composite < 0.2:
                continue

            confidence = self.confidence_model.compute_overall(node_id)

            results.append({
                "id": f"opt-{node_id}",
                "nodeId": node_id,
                "actionType": "OPTIMIZE",
                "title": f"Optimize Resources for {node.label}",
                "summary": explain_action("OPTIMIZE", node_id, node.label, composite, {
                    "monthly_cost": node.monthly_cost,
                    "usage_score": node.usage_score,
                    "traffic_score": node.traffic_score,
                }),
                "score": round(composite, 3),
                "confidence": round(confidence, 3),
                "impactScore": round(1.0 - low_traffic, 3),
                "costDelta": round(node.monthly_cost * cost_ineff, 2),
                "priorityLevel": "Low",
                "reasons": [f"Usage is only {node.usage_score*100:.0f}%"],
                "blockers": [],
                "affectedSystems": 0,
                "recommendedNextStep": "Downsize instance or move to serverless"
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]
        
    def _rank_investigations(self, limit: int) -> List[dict]:
        """Rank nodes that need investigation due to extreme low confidence."""
        results = []
        for node_id in self.graph.node_ids:
            node = self.graph.get_node(node_id)
            if not node: continue
            
            confidence = self.confidence_model.compute_overall(node_id)
            if confidence > 0.4:
                continue # Only investigate low confidence items
                
            composite = 1.0 - confidence
            
            results.append({
                "id": f"inv-{node_id}",
                "nodeId": node_id,
                "actionType": "INVESTIGATE",
                "title": f"Investigate Unknowns on {node.label}",
                "summary": explain_action("INVESTIGATE", node_id, node.label, composite, {
                    "confidence": confidence
                }),
                "score": round(composite, 3),
                "confidence": round(confidence, 3),
                "impactScore": 0,
                "costDelta": 0,
                "priorityLevel": "Medium" if confidence < 0.2 else "Low",
                "reasons": ["Missing telemetry", "Weak dependency metadata"],
                "blockers": [],
                "affectedSystems": 0,
                "recommendedNextStep": "Add Datadog/Cloudwatch tags to collect metrics"
            })
            
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def _rank_planned_insights(self, limit: int) -> List[dict]:
        """Generate insights for planned/draft nodes in the graph."""
        results = []

        planned_nodes = [
            n for n in self.graph.nodes_map.values()
            if n.status in ("planned", "expected")
        ]
        if not planned_nodes:
            return []

        for node in planned_nodes:
            score = 0.0
            reasons = []

            # 1. Check if planned node is isolated
            out_edges = self.graph.get_outbound(node.id)
            in_edges = self.graph.get_inbound(node.id)
            if len(out_edges) == 0 and len(in_edges) == 0 and node.parent_id is None:
                score += 0.4
                reasons.append("Isolated — no connections to existing infrastructure")

            # 2. Check missing required dependencies
            required = node.resolved_required_deps()
            connected_types = set()
            for e in out_edges:
                t = self.graph.get_node(e.target)
                if t:
                    connected_types.add(t.type)
            for e in in_edges:
                s = self.graph.get_node(e.source)
                if s:
                    connected_types.add(s.type)
            if node.parent_id:
                p = self.graph.get_node(node.parent_id)
                if p:
                    connected_types.add(p.type)

            missing = [r for r in required if r not in connected_types]
            if missing:
                score += 0.3
                reasons.append(f"Missing required: {', '.join(missing)}")

            # 3. Check if planned node improves redundancy for existing critical nodes
            if len(in_edges) > 0:
                for e in in_edges:
                    source_node = self.graph.get_node(e.source)
                    if source_node and source_node.criticality in ("critical", "high"):
                        score += 0.2
                        reasons.append(f"Adds path to critical node: {source_node.label}")
                        break

            # 4. Check if adding this node creates new SPOF risk
            if len(out_edges) > 2:
                score += 0.15
                reasons.append(f"New node with {len(out_edges)} downstream deps — potential SPOF")

            if score > 0:
                results.append({
                    "id": f"plan-{node.id}",
                    "nodeId": node.id,
                    "actionType": "PLAN",
                    "title": f"Review Planned: {node.label}",
                    "summary": explain_action("PLAN", node.id, node.label, score, {
                        "reasons": reasons,
                    }),
                    "score": round(score, 3),
                    "confidence": 0.8,
                    "impactScore": 0,
                    "costDelta": 0,
                    "priorityLevel": "Medium" if score > 0.5 else "Low",
                    "reasons": reasons,
                    "blockers": [],
                    "affectedSystems": len(out_edges) + len(in_edges),
                    "recommendedNextStep": "Complete dependencies and run validation" if missing else "Review topology before deploying",
                })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]
