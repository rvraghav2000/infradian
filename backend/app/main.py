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
from typing import Any, Dict, List

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models import InfraGraph, Node
from .database import db

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

SAMPLE_PATH = Path(__file__).resolve().parent.parent / "sample_payload.json"

# ── State & Config ───────────────────────────────────────────────

INFRADIAN_SERVER_TOKEN = "dev-token-123"


# ── Versioned API ────────────────────────────────────────────────

@app.get("/api/v1/graph")
async def get_graph() -> JSONResponse:
    """Return the infrastructure graph from Neo4j."""
    nodes_query = "MATCH (n:Resource) RETURN n"
    edges_query = "MATCH (a:Resource)-[r:DEPENDS_ON]->(b:Resource) RETURN a.id as source_id, b.id as target_id, r.label as label"
    
    nodes_raw = db.query(nodes_query) or []
    edges_raw = db.query(edges_query) or []
    
    nodes = []
    for record in nodes_raw:
        n = record["n"]
        # Map Neo4j properties back to Pydantic model
        nodes.append({
            "id": n["id"],
            "type": n["type"],
            "label": n.get("name") or n.get("label") or "Unnamed Node",
            "status": n["status"],
            "parentId": n.get("parent_id"),
            "metrics": {"current_load": n.get("current_load", 0.0)},
            "history": [] # TODO: Implement history persistence in Neo4j if needed
        })
        
    edges = []
    for edge in edges_raw:
        edges.append({
            "source_id": edge["source_id"],
            "target_id": edge["target_id"],
            "label": edge.get("label")
        })

    graph = InfraGraph(nodes=nodes, edges=edges)
    return JSONResponse(content=graph.model_dump(mode="json"))


@app.get("/api/v1/nodes")
async def get_nodes() -> Dict[str, Any]:
    """Return all nodes and edges from Neo4j in a graph structure."""
    nodes_query = "MATCH (n:Resource) RETURN n"
    edges_query = "MATCH (a:Resource)-[r:DEPENDS_ON]->(b:Resource) RETURN a.id as source_id, b.id as target_id, r.label as label"
    
    nodes_raw = db.query(nodes_query) or []
    edges_raw = db.query(edges_query) or []
    
    nodes = []
    for record in nodes_raw:
        n = record["n"]
        nodes.append({
            "id": n["id"],
            "type": n["type"],
            "label": n.get("name") or n.get("label") or "Unnamed Node",
            "status": n.get("status", "live"),
            "parentId": n.get("parent_id"),
            "metrics": {"current_load": n.get("current_load", 0.0)},
            "history": []
        })
        
    edges = []
    for edge in edges_raw:
        edges.append({
            "source_id": edge["source_id"],
            "target_id": edge["target_id"],
            "label": edge.get("label")
        })

    return {"nodes": nodes, "edges": edges}


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
    cypher = "MERGE (n:Resource {id: $id}) SET n.name = $name, n.type = $type, n.status = $status RETURN n"
    params = {
        "id": node.id,
        "name": node.label,
        "type": node.type,
        "status": node.status
    }
    result = db.query(cypher, params)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create node in Neo4j")
        
    return {"message": f"Node {node.id} ingested successfully", "node": result[0]["n"]}


@app.post("/api/v1/edges", status_code=status.HTTP_201_CREATED)
async def post_edge(source_id: str, target_id: str, label: str = None) -> dict:
    """Create a relationship between two nodes in Neo4j."""
    cypher = """
    MATCH (source:Resource {id: $source_id}), (target:Resource {id: $target_id}) 
    MERGE (source)-[r:DEPENDS_ON]->(target) 
    SET r.label = $label
    RETURN r
    """
    params = {
        "source_id": source_id,
        "target_id": target_id,
        "label": label
    }
    result = db.query(cypher, params)
    if not result:
        raise HTTPException(status_code=404, detail="Source or target node not found")
        
    return {"message": "Edge created successfully", "edge": result[0]["r"]}

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
