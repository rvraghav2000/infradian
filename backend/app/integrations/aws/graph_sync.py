import logging
import json
from typing import List, Dict, Any
from app.models import Node, Edge
from app.database import db

logger = logging.getLogger(__name__)

class AWSGraphSync:
    """Synchronizes normalized AWS Nodes and Edges directly into Neo4j."""

    def __init__(self):
        self.db = db

    def sync(self, nodes: List[Node], edges: List[Edge]) -> Dict[str, Any]:
        """
        Takes lists of normalized Nodes and Edges and merges them into Neo4j.
        Returns a summary of operations.
        """
        nodes_synced = 0
        edges_synced = 0
        
        # 1. Upsert Nodes
        node_query = """
        UNWIND $nodes AS n
        MERGE (r:Resource {id: n.id})
        SET r.type = n.type,
            r.name = n.label,
            r.label = n.label,
            r.status = n.status,
            r.parent_id = n.parent_id,
            r.environment = n.environment,
            r.business_function = n.business_function,
            r.account_id = n.account_id,
            r.provider = 'aws'
        """
        
        # Prepare Node payload stripping complex python objects down to robust primitives if needed
        # but pydantic model dump is ideal
        nodes_payload = []
        for n in nodes:
            dump = n.model_dump()
            # Simple sanitization for neo4j properties limits what can be set deeply
            nodes_payload.append({
                "id": dump["id"],
                "type": dump["type"],
                "label": dump["label"],
                "status": dump.get("status", "live"),
                "parent_id": dump.get("parentId"),
                "environment": dump.get("environment", "production"),
                "business_function": dump.get("business_function", "general"),
                "account_id": dump.get("account_id")
            })

        if nodes_payload:
            try:
                self.db.query(node_query, parameters={"nodes": nodes_payload})
                nodes_synced = len(nodes_payload)
            except Exception as e:
                logger.error(f"Failed to sync nodes: {e}")

        # 2. Upsert Edges
        edge_query = """
        UNWIND $edges AS e
        MATCH (source:Resource {id: e.source})
        MATCH (target:Resource {id: e.target})
        MERGE (source)-[rel:DEPENDS_ON {id: e.id}]->(target)
        SET rel.type = e.label,
            rel.confidence = e.confidence,
            rel.dependency_mode = e.dependency_mode
        """
        
        edges_payload = []
        for e in edges:
            dump = e.model_dump()
            edges_payload.append({
                "id": dump["id"],
                "source": dump["source"],
                "target": dump["target"],
                "label": dump["label"],
                "confidence": dump.get("confidence", 1.0),
                "dependency_mode": dump.get("dependency_mode", "sync")
            })

        if edges_payload:
            try:
                self.db.query(edge_query, parameters={"edges": edges_payload})
                edges_synced = len(edges_payload)
            except Exception as e:
                logger.error(f"Failed to sync edges: {e}")

        return {
            "status": "success",
            "nodes_synced": nodes_synced,
            "edges_synced": edges_synced,
            "resource_counts": {
                "nodes": len(nodes),
                "edges": len(edges)
            }
        }
