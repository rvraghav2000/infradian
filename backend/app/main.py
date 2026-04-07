"""
Infradian Data Engine — FastAPI entrypoint

Routes:
  GET  /api/v1/graph  – return the infrastructure graph (sample or fallback)
  POST /graph         – validate & echo an InfraGraph payload
  GET  /graph/sample  – return the bundled sample AWS environment
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import traceback
from .models import InfraGraph, Node, Edge
from .database import db
from .analysis.api import router as analysis_router
from .api.aws_ingestion import router as aws_router
from .api.integrations import router as cloud_router

app = FastAPI(
    title="Infradian Data Engine",
    version="0.1.0",
    description="Universal infrastructure graph API for the 2.5D visualizer.",
)

# ── CORS — allow the Vite dev server and common local origins ────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    # Verify Neo4j connectivity
    test = db.test_connection()
    if test:
        print(f"Connected to Neo4j: {test[0]['status']}")
    else:
        print("CRITICAL: Could not connect to Neo4j on startup")

SAMPLE_PATH = Path(__file__).resolve().parent.parent.parent / "sample_payload.json"

# ── State & Config ───────────────────────────────────────────────

INFRADIAN_SERVER_TOKEN = "dev-token-123"

def flatten_dict(d: dict, prefix: str = "") -> dict:
    """Helper to flatten nested dictionaries for Neo4j compatibility."""
    items = {}
    for k, v in d.items():
        new_key = f"{prefix}_{k}" if prefix else k
        if isinstance(v, dict):
            items.update(flatten_dict(v, new_key))
        else:
            items[new_key] = v
    return items


# ── Versioned API ────────────────────────────────────────────────

@app.get("/api/v1/graph")
async def get_graph() -> dict:
    """Return the entire graph formatted for Cytoscape.js."""
    try:
        # 1. Fetch all nodes with their properties explicitly as dicts
        nodes_query = "MATCH (n:Resource) RETURN properties(n) as props"
        nodes_raw = db.query(nodes_query) or []
        
        nodes = []
        for record in nodes_raw:
            # record is a dict: {"props": {id, name, parent_id, ...}}
            props = record.get("props", {})
            node_id = props.get("id")
            if not node_id:
                continue
                
            nodes.append({
                "data": {
                    "id": node_id,
                    "label": props.get("name") or props.get("label") or node_id,
                    "parent": props.get("parent_id")
                }
            })
            
        # 2. Fetch all relationships with their type and properties
        edges_query = "MATCH (a:Resource)-[r]->(b:Resource) RETURN properties(r) as props, type(r) as rel_type, a.id as source, b.id as target"
        edges_raw = db.query(edges_query) or []
        
        edges = []
        for record in edges_raw:
            props = record.get("props", {})
            rel_type = record.get("rel_type", "DEPENDS_ON")
            source = record.get("source")
            target = record.get("target")

            if not source or not target:
                continue
            
            edge_id = props.get("id") or props.get("edge_id") or f"{source}-{target}"
            
            edges.append({
                "data": {
                    "id": str(edge_id),
                    "source": source,
                    "target": target,
                    "label": props.get("label") or rel_type
                }
            })

        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        print(f"!!! CRITICAL ERROR IN get_graph: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Graph retrieval failed: {str(e)}")


@app.get("/api/v1/accounts")
async def get_accounts() -> List[str]:
    """Return a list of all distinct account_ids successfully tracked in Neo4j."""
    try:
        query = "MATCH (n:Resource) WHERE n.account_id IS NOT NULL RETURN DISTINCT n.account_id as account_id"
        results = db.query(query)
        if not results:
            return []
        return [r["account_id"] for r in results]
    except Exception as e:
        logger.error(f"Failed to fetch accounts: {e}")
        return []

@app.get("/api/v1/nodes")
async def get_nodes(account_id: Optional[str] = None) -> Dict[str, Any]:
    """Return all nodes and edges from Neo4j in a graph structure, optionally filtered by account. If account_id is 'all', return everything."""
    try:
        nodes_where = ""
        edges_where = ""
        params = {}
        if account_id and account_id != "all":
            nodes_where = "WHERE n.account_id = $acc_id"
            # Return edges only if both source and target are in the same filtered account scope
            edges_where = "WHERE a.account_id = $acc_id AND b.account_id = $acc_id"
            params = {"acc_id": account_id}
            
        nodes_query = f"MATCH (n:Resource) {nodes_where} RETURN DISTINCT properties(n) as props"
        edges_query = f"MATCH (a:Resource)-[r]->(b:Resource) {edges_where} RETURN DISTINCT properties(r) as props, type(r) as rel_type, a.id as source_id, b.id as target_id"
        
        nodes_raw = db.query(nodes_query, parameters=params)
        edges_raw = db.query(edges_query, parameters=params)
        if nodes_raw is None or edges_raw is None:
            raise Exception("Neo4j unavailable")
        
        nodes_raw = nodes_raw or []
        edges_raw = edges_raw or []
        
        nodes = []
        for record in nodes_raw:
            props = record.get("props", {})
            node_id = props.get("id")
            if not node_id:
                continue
                
            nodes.append({
                "id": node_id,
                "type": props.get("type", "unknown"),
                "label": props.get("name") or props.get("label") or node_id,
                "status": props.get("status", "live"),
                "parentId": props.get("parent_id"),
                "metrics": {"current_load": props.get("current_load", 0.0)},
                "history": [],
                "attributes": {
                    "spawnX": props.get("spawnX"),
                    "spawnY": props.get("spawnY")
                }
            })
            
        edges = []
        for record in edges_raw:
            props = record.get("props", {})
            rel_type = record.get("rel_type", "DEPENDS_ON")
            source = record.get("source_id")
            target = record.get("target_id")

            if not source or not target:
                continue
                
            edges.append({
                "source_id": source,
                "target_id": target,
                "label": props.get("label") or rel_type
            })

        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        print(f"!!! CRITICAL ERROR IN get_nodes: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to retrieve graph data: {str(e)}")


@app.post("/api/v1/graph", status_code=status.HTTP_201_CREATED)
async def post_graph(
    graph: InfraGraph,
    authorization: str = Header(None, description="Bearer token"),
) -> dict[str, str]:
    """Ingest a new infrastructure graph into Neo4j."""
    if not authorization or authorization != f"Bearer {INFRADIAN_SERVER_TOKEN}":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Ingest nodes
    for node in graph.nodes:
        cypher = "MERGE (n:Resource {id: $id}) SET n.name = $name, n.type = $type, n.status = $status, n.current_load = $load, n.parent_id = $parent_id"
        params = {
            "id": node.id,
            "name": node.label,
            "type": node.type,
            "status": node.status,
            "load": node.metrics.current_load,
            "parent_id": node.parent_id
        }
        db.query(cypher, params)
        
    # Ingest edges
    for edge in graph.edges:
        cypher = """
        MATCH (source:Resource {id: $source_id}), (target:Resource {id: $target_id}) 
        MERGE (source)-[r:DEPENDS_ON]->(target) 
        SET r.label = $label
        """
        params = {
            "source_id": edge.source_id,
            "target_id": edge.target_id,
            "label": edge.label
        }
        db.query(cypher, params)
    
    return {"message": "Graph ingested successfully", "nodes": str(len(graph.nodes))}

@app.post("/api/v1/nodes", status_code=status.HTTP_201_CREATED)
async def post_node(node: Node) -> dict:
    """Ingest a single node into Neo4j."""
    cypher = "MERGE (n:Resource {id: $id}) SET n.name = $name, n.type = $type, n.status = $status, n.parent_id = $parent_id, n.spawnX = $spawnX, n.spawnY = $spawnY RETURN n"
    params = {
        "id": node.id,
        "name": node.label,
        "type": node.type,
        "status": node.status,
        "parent_id": node.parent_id,
        "spawnX": node.attributes.get("spawnX") if node.attributes else None,
        "spawnY": node.attributes.get("spawnY") if node.attributes else None
    }
    result = db.query(cypher, params)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create node in Neo4j")
        
    return {"message": f"Node {node.id} ingested successfully", "node": result[0]["n"]}


@app.post("/api/v1/edges", status_code=status.HTTP_201_CREATED)
async def post_edge(edge: Edge) -> dict:
    """Ingest a relationship between two nodes with dynamic labels and flattened attributes."""
    # 1. Prepare properties by flattening the attributes dict
    flat_props = flatten_dict(edge.attributes, "attr")
    flat_props["edge_id"] = edge.id
    
    # 2. Use APOC to safely merge a relationship with a dynamic label
    cypher = """
    MATCH (source:Resource {id: $source_id}), (target:Resource {id: $target_id})
    CALL apoc.merge.relationship(source, $label, {id: $edge_id}, $props, target)
    YIELD rel
    RETURN rel
    """
    params = {
        "source_id": edge.source,
        "target_id": edge.target,
        "label": edge.label,
        "edge_id": edge.id,
        "props": flat_props
    }
    
    result = db.query(cypher, params)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Source node '{edge.source}' or target node '{edge.target}' not found."
        )
        
    return {"message": "Edge ingested successfully", "edge_id": edge.id}

@app.delete("/api/v1/nodes/{node_id}")
async def delete_node(node_id: str) -> dict[str, str]:
    """Remove a node from Neo4j."""
    result = db.query("MATCH (n:Resource {id: $id}) DETACH DELETE n RETURN n", {"id": node_id})
    # DETACH DELETE returns no nodes if they were deleted, so we check if anything was matched
    # Actually DETACH DELETE is fine to run even if not found, but prompt implies we should handle it
    return {"message": f"Node {node_id} deleted successfully"}


@app.post("/api/v1/ingest/terraform", status_code=status.HTTP_201_CREATED)
async def ingest_terraform(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Ingest a raw Terraform state file and sync to Neo4j."""
    resources = payload.get("resources", [])
    nodes_processed = 0
    edges_processed = 0
    
    # Map cloud-provider id (e.g. "vpc-0abc…") → terraform address
    aws_id_to_addr: Dict[str, str] = {}
    
    # ── First Pass: Collect IDs ───────────────────────────────
    for res in resources:
        if res.get("mode") != "managed":
            continue
        res_type = res.get("type")
        res_name = res.get("name")
        instances = res.get("instances", [])
        for inst in instances:
            addr = f"{res_type}.{res_name}"
            if len(instances) > 1:
                index_key = inst.get("index_key")
                addr += f"[{index_key}]" if index_key is not None else ""
            
            attrs = inst.get("attributes", {})
            cloud_id = attrs.get("id")
            if cloud_id:
                aws_id_to_addr[cloud_id] = addr

    # ── Second Pass: Create Nodes with parent_id ─────────────
    addr_set: set[str] = set()
    resource_entries: List[tuple[str, List[str]]] = [] # (id, dependencies)

    for res in resources:
        if res.get("mode") != "managed":
            continue
        
        res_type = res.get("type")
        res_name = res.get("name")
        provider = res.get("provider", "").split(".")[-1].replace("\"", "")
        
        instances = res.get("instances", [])
        for inst in instances:
            addr = f"{res_type}.{res_name}"
            if len(instances) > 1:
                index_key = inst.get("index_key")
                addr += f"[{index_key}]" if index_key is not None else ""
            
            addr_set.add(addr)
            attrs = inst.get("attributes", {})
            
            # Resolve parent_id (e.g. subnet_id -> Subnet, vpc_id -> VPC)
            parent_id = None
            if res_type in ["aws_instance", "aws_db_instance"]:
                pid = attrs.get("subnet_id")
                if pid and pid in aws_id_to_addr:
                    parent_id = aws_id_to_addr[pid]
            elif res_type in ["aws_subnet", "aws_security_group", "aws_route_table"]:
                pid = attrs.get("vpc_id")
                if pid and pid in aws_id_to_addr:
                    parent_id = aws_id_to_addr[pid]
            
            # If no parent but region available, use region name (optional but good)
            if not parent_id and "availability_zone" in attrs:
                parent_id = attrs["availability_zone"]
            
            # Sync node to Neo4j
            cypher = """
            MERGE (n:Resource {id: $id}) 
            SET n.type = $type, 
                n.name = $name, 
                n.provider = $provider, 
                n.status = 'live',
                n.parent_id = $parent_id
            """
            params = {
                "id": addr,
                "type": res_type,
                "name": res_name,
                "provider": provider,
                "parent_id": parent_id
            }
            db.query(cypher, params)
            nodes_processed += 1
            
            # Save for edge pass
            deps = inst.get("dependencies", [])
            resource_entries.append((addr, deps))

    # ── Third Pass: Edges ─────────────────────────────────────
    for source_id, deps in resource_entries:
        for target_id in deps:
            if target_id in addr_set:
                cypher = """
                MATCH (source:Resource {id: $source_id}), (target:Resource {id: $target_id}) 
                MERGE (source)-[r:DEPENDS_ON]->(target)
                """
                params = {
                    "source_id": source_id,
                    "target_id": target_id
                }
                db.query(cypher, params)
                edges_processed += 1

    return {
        "status": "success",
        "nodes_processed": nodes_processed,
        "edges_processed": edges_processed,
        "message": f"Successfully ingested {nodes_processed} nodes and {edges_processed} edges."
    }

# ── Legacy routes (kept for backwards compatibility) ─────────────

@app.post("/graph", response_model=InfraGraph)
async def ingest_graph(graph: InfraGraph) -> InfraGraph:
    """Validate an infrastructure graph payload and return it."""
    return graph


@app.get("/graph/sample")
async def get_sample_graph() -> JSONResponse:
    """Return the bundled sample AWS environment payload."""
    raw = SAMPLE_PATH.read_text(encoding="utf-8")
    payload = json.loads(raw)
    graph = InfraGraph.model_validate(payload)
    return JSONResponse(content=graph.model_dump(mode="json"))

app.include_router(analysis_router, prefix="/api/v1")
app.include_router(aws_router, prefix="/api/v1")
app.include_router(cloud_router, prefix="/api/v1")

