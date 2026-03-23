from typing import List, Dict, Any, Optional
from .graph_traversal import Graph, bfs_traversal
from .scoring import get_node_scores, ScoringConfig, DEFAULT_CONFIG
from ..models import Node, Edge

class BlastRadiusAnalyzer:
    """Coordinator for running blast radius analysis on an infrastructure graph."""
    
    def __init__(self, nodes: List[Node], edges: List[Edge]):
        self.graph = Graph(nodes, edges)

    def analyze(
        self, 
        source_id: str, 
        max_hops: int = 5, 
        direction: str = "downstream",
        config: ScoringConfig = DEFAULT_CONFIG
    ) -> Dict[str, Any]:
        """Runs the full analysis pipeline."""
        
        # 1. Traversal
        visited_depths = bfs_traversal(self.graph, source_id, max_hops, direction)
        if not visited_depths:
            return {"error": f"Source node {source_id} not found or no connections."}
            
        # 2. Gather Affected Nodes
        affected_nodes_info = []
        has_critical = False
        critical_keywords = ["db", "rds", "auth", "payment", "database"]
        
        for nid, depth in visited_depths.items():
            node = self.graph.get_node(nid)
            if not node: continue
            
            # Check for criticality
            if any(k in node.type.lower() or k in node.label.lower() for k in critical_keywords):
                has_critical = True
                
            if nid != source_id:
                affected_nodes_info.append({
                    "id": node.id,
                    "type": node.type,
                    "label": node.label,
                    "depth": depth,
                    "node": node # For internal scoring
                })
                
        # 3. Scoring per node
        overall_risk = 0.0
        overall_waste = 0.0
        overall_confidence = 0.0
        
        output_nodes = []
        for info in affected_nodes_info:
            node = info["node"]
            depth = info["depth"]
            
            node_scores = get_node_scores(node, depth, config)
            
            overall_risk += node_scores["risk"]
            overall_waste += node_scores["waste"]
            overall_confidence += node_scores["confidence"]
            
            output_nodes.append({
                "id": node.id,
                "type": node.type,
                "label": node.label,
                "depth": depth,
                "scores": node_scores
            })
            
        affected_count = len(output_nodes)
        
        # 4. Result Formatting
        return {
            "source_id": source_id,
            "max_hops": max_hops,
            "direction": direction,
            "overall_scores": {
                "risk": round(overall_risk / affected_count, 1) if affected_count > 0 else 0,
                "waste": round(overall_waste, 2) if affected_count > 0 else 0,
                "confidence": round(overall_confidence / affected_count, 1) if affected_count > 0 else 100
            },
            "affected_count": affected_count,
            "max_depth": max(visited_depths.values()) if visited_depths else 0,
            "affected_nodes": sorted(output_nodes, key=lambda x: x["depth"]),
            "critical_infra_found": has_critical
        }

    def simulate_node_removal(self, target_node_id: str) -> Dict[str, Any]:
        """
        Simulates the removal of a node and compares system state before and after.
        Returns a delta report.
        """
        # 1. Baseline Analysis (Whole system)
        baseline_risk = 0.0
        for node in self.graph.nodes:
            res = self.analyze(node.id, max_hops=3)
            if "error" not in res:
                baseline_risk += res["overall_scores"]["risk"]
        
        # 2. Create Simulated Graph (filtered)
        sim_nodes = [n for n in self.graph.nodes if n.id != target_node_id]
        sim_edges = [e for e in self.graph.edges if e.source != target_node_id and e.target != target_node_id]
        
        sim_analyzer = BlastRadiusAnalyzer(sim_nodes, sim_edges)
        
        # 3. Simulated Analysis
        sim_risk = 0.0
        for node in sim_nodes:
            res = sim_analyzer.analyze(node.id, max_hops=3)
            if "error" not in res:
                sim_risk += res["overall_scores"]["risk"]
        
        # 4. Compare
        risk_delta = baseline_risk - sim_risk
        
        # Direct impact of the target node itself
        direct_impact = self.analyze(target_node_id)
        
        return {
            "target_node": target_node_id,
            "baseline_system_risk": round(baseline_risk, 2),
            "simulated_system_risk": round(sim_risk, 2),
            "risk_reduction": round(risk_delta, 2),
            "reduction_percentage": round((risk_delta / baseline_risk * 100), 1) if baseline_risk > 0 else 0,
            "direct_blast_radius": direct_impact
        }
