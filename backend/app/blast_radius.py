from typing import List, Dict, Any
from collections import deque

def compute_node_weight(node: Dict[str, Any]) -> float:
    env = str(node.get("environment", "prod")).lower()
    if env == "prod": return 1.0
    if env == "staging": return 0.5
    if env == "dev": return 0.2
    return 1.0  # default

def run_blast_radius(source_id: str, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]], max_hops: int = 5, direction: str = "downstream") -> Dict[str, Any]:
    """
    Computes a weighted blast radius score (0-100) using BFS traversal on the dependent nodes.
    """
    adj = {}
    for n in nodes:
        adj[n["id"]] = {"out": [], "in": []}
        
    for e in edges:
        s = e["source_id"]
        t = e["target_id"]
        if s in adj and t in adj:
            adj[s]["out"].append(t)
            adj[t]["in"].append(s)
            
    if source_id not in adj:
        return {"error": f"Source node {source_id} not found."}

    # 1. Traverse Graph (BFS)
    visited = {source_id: 0}
    queue = deque([(source_id, 0)])
    impacted_nodes_info = []
    
    while queue:
        curr, depth = queue.popleft()
        
        if depth >= max_hops:
            continue
            
        neighbors = []
        # In cloud infra, A -> B means A can talk to B. The impact usually flows downstream from critical infra or reverse traffic
        if direction in ("downstream", "both"):
            neighbors.extend(adj[curr]["out"])
        if direction in ("upstream", "both"):
            neighbors.extend(adj[curr]["in"])
            
        for nxt in neighbors:
            if nxt not in visited:
                visited[nxt] = depth + 1
                queue.append((nxt, depth + 1))
                
    # 2. Compute Metrics
    node_map = {n["id"]: n for n in nodes}
    source_node = node_map.get(source_id, {})
    
    impact_sum = 0.0
    total_traffic = 0.0
    has_high_criticality = False
    
    # Criticality keywords
    critical_keywords = ["db", "rds", "auth", "payment", "database", "elasticache"]
    
    s_type = source_node.get("type", "").lower()
    if any(k in s_type for k in critical_keywords):
        has_high_criticality = True
        
    for nid, depth in visited.items():
        if nid == source_id:
            continue
            
        n = node_map[nid]
        
        # Dependency Impact: sum(weight / depth)
        weight = compute_node_weight(n)
        impact_sum += (weight / depth)
        
        # Traffic norm to 100
        traffic = float(n.get("traffic", 50)) 
        total_traffic += traffic
        
        n_type = n.get("type", "").lower()
        if any(k in n_type for k in critical_keywords):
            has_high_criticality = True
            
        impacted_nodes_info.append({
            "id": nid,
            "type": n.get("type", "unknown"),
            "depth": depth
        })
        
    # 3. Final Scores Calculation
    affected_count = len(visited) - 1
    
    norm_impact = min((impact_sum / 5.0) * 100, 100.0) if affected_count > 0 else 0
    
    avg_traffic = (total_traffic / affected_count) if affected_count > 0 else 50.0
    avg_traffic = min(max(avg_traffic, 0), 100)
    
    criticality_score = 100 if has_high_criticality else 30
    
    if affected_count == 0:
        blast_score = 0
        explanation = f"Safe: {source_id} has no dependent {direction} nodes within {max_hops} hops."
    else:
        # 0.5 * Dependency + 0.3 * Traffic + 0.2 * Criticality
        blast_score = (0.5 * norm_impact) + (0.3 * avg_traffic) + (0.2 * criticality_score)
        blast_score = min(blast_score, 100.0)
        
        if blast_score > 75:
            explanation = "Critical Risk: High impact on core databases or direct production traffic."
        elif blast_score > 40:
            explanation = "Moderate Risk: Impacts multiple services downstream."
        else:
            explanation = "Low Risk: Impact is restricted to non-critical boundaries."

    return {
        "source_node": source_id,
        "blast_radius_score": round(blast_score, 1),
        "affected_nodes_count": affected_count,
        "max_depth": max(visited.values()) if visited else 0,
        "impacted_nodes": sorted(impacted_nodes_info, key=lambda x: x["depth"]),
        "explanation": explanation
    }
