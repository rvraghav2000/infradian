import time
from functools import wraps
from typing import Dict, List, Any, Optional, Tuple
from ..database import db
from ..models import Node, Edge, NodeMetrics

def ttl_cache(seconds: int = 60):
    """Simple in-memory TTL cache decorator."""
    def decorator(func):
        cache = {}
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = f"{args}_{kwargs}"
            if key in cache:
                result, timestamp = cache[key]
                if time.time() - timestamp < seconds:
                    return result
            result = func(*args, **kwargs)
            cache[key] = (result, time.time())
            return result
        return wrapper
    return decorator

@ttl_cache(seconds=30)
def get_system_graph_models() -> Tuple[List[Node], List[Edge]]:
    """
    Fetches the current infrastructure graph from Neo4j and returns 
    lists of Node and Edge model instances.
    """
    nodes_query = "MATCH (n:Resource) RETURN properties(n) as props"
    edges_query = "MATCH (a:Resource)-[r]->(b:Resource) RETURN properties(r) as props, type(r) as rel_type, a.id as source_id, b.id as target_id"
    
    nodes_raw = db.query(nodes_query) or []
    edges_raw = db.query(edges_query) or []
    
    nodes = []
    for record in nodes_raw:
        props = record.get("props", {})
        node_id = props.get("id")
        if not node_id: continue
        
        nodes.append(Node(
            id=node_id,
            type=props.get("type", "unknown"),
            label=props.get("name") or props.get("label") or node_id,
            status=props.get("status", "live"),
            parent_id=props.get("parent_id"),
            metrics=NodeMetrics(current_load=props.get("current_load", 0.0)),
            attributes=props
        ))
        
    edges = []
    for record in edges_raw:
        source = record.get("source_id")
        target = record.get("target_id")
        if source and target:
            edges.append(Edge(
                id=record.get("props", {}).get("id", f"{source}-{target}"),
                source=source,
                target=target,
                label=record.get("rel_type", "DEPENDS_ON"),
                attributes=record.get("props", {})
            ))
    if not nodes:
        import json
        from pathlib import Path
        sample_path = Path(__file__).resolve().parent.parent.parent.parent / "sample_payload.json"
        if sample_path.exists():
            with open(sample_path, 'r') as f:
                data = json.load(f)
                for n in data.get("nodes", []):
                    if "id" not in n: continue
                    nodes.append(Node(
                        id=n.get("id"),
                        type=n.get("type", "unknown"),
                        label=n.get("label") or n.get("id"),
                        status=n.get("status", "live"),
                        parent_id=n.get("parent_id"),
                        metrics=NodeMetrics(current_load=0.0),
                        attributes=n
                    ))
                for e in data.get("edges", []):
                    if "source_id" not in e or "target_id" not in e: continue
                    edges.append(Edge(
                        id=e.get("id", f"{e.get('source_id')}-{e.get('target_id')}"),
                        source=e.get("source_id"),
                        target=e.get("target_id"),
                        label=e.get("label", "DEPENDS_ON"),
                        attributes=e
                    ))
            
    return nodes, edges
