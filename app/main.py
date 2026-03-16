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

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models import InfraGraph, Node

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

SAMPLE_PATH = Path(__file__).resolve().parent.parent / "sample_payload.json"

# ── Hardcoded fallback (1 VPC, 2 Subnets, 2 EC2s) ───────────────
FALLBACK_PAYLOAD: dict = {
    "nodes": [
        {
            "id": "vpc-001",
            "type": "aws_vpc",
            "label": "Production VPC",
            "parent_id": None,
            "metrics": {"current_load": 0.0},
            "history": [
                {
                    "timestamp": "2026-03-14T14:00:00Z",
                    "status": "success",
                    "message": "VPC peering route propagation completed.",
                }
            ],
        },
        {
            "id": "subnet-pub-1",
            "type": "aws_subnet",
            "label": "Public Subnet (us-east-1a)",
            "parent_id": "vpc-001",
            "metrics": {"current_load": 0.0},
            "history": [],
        },
        {
            "id": "subnet-priv-1",
            "type": "aws_subnet",
            "label": "Private Subnet (us-east-1b)",
            "parent_id": "vpc-001",
            "metrics": {"current_load": 0.0},
            "history": [],
        },
        {
            "id": "ec2-web-1",
            "type": "aws_instance",
            "label": "Web Server (Nginx)",
            "parent_id": "subnet-pub-1",
            "metrics": {"current_load": 0.91},
            "history": [
                {
                    "timestamp": "2026-03-15T09:15:00Z",
                    "status": "success",
                    "message": "Deployed v2.4.1 — nginx config reload.",
                },
                {
                    "timestamp": "2026-03-15T11:45:00Z",
                    "status": "failure",
                    "message": "Health-check timeout after TLS cert rotation.",
                },
                {
                    "timestamp": "2026-03-15T12:02:00Z",
                    "status": "success",
                    "message": "Rollback to v2.4.0 — service restored.",
                },
            ],
        },
        {
            "id": "ec2-app-1",
            "type": "aws_instance",
            "label": "App Server (FastAPI)",
            "parent_id": "subnet-priv-1",
            "metrics": {"current_load": 0.45},
            "history": [
                {
                    "timestamp": "2026-03-15T10:30:00Z",
                    "status": "success",
                    "message": "Blue/green swap to v3.1.0 complete.",
                }
            ],
        },
    ],
    "edges": [
        {
            "source_id": "ec2-web-1",
            "target_id": "ec2-app-1",
            "label": "HTTPS / 8443",
        }
    ],
}


# ── State & Config ───────────────────────────────────────────────

INFRADIAN_SERVER_TOKEN = "dev-token-123"
latest_graph: dict | None = None


# ── Versioned API ────────────────────────────────────────────────

@app.get("/api/v1/graph")
async def get_graph() -> JSONResponse:
    """Return the infrastructure graph.

    Returns the most recently ingested graph. Falls back to sample payload
    or hardcoded fallback if no graph has been ingested yet.
    """
    if latest_graph is not None:
        payload = latest_graph
    elif SAMPLE_PATH.exists():
        raw = SAMPLE_PATH.read_text(encoding="utf-8")
        payload = json.loads(raw)
    else:
        payload = FALLBACK_PAYLOAD

    # Validate through Pydantic before returning
    graph = InfraGraph.model_validate(payload)
    return JSONResponse(content=graph.model_dump(mode="json"))


@app.post("/api/v1/graph", status_code=status.HTTP_201_CREATED)
async def post_graph(
    graph: InfraGraph,
    authorization: str = Header(None, description="Bearer token"),
) -> dict[str, str]:
    """Ingest a new infrastructure graph.

    Requires an API token in the Authorization header.
    """
    if not authorization or authorization != f"Bearer {INFRADIAN_SERVER_TOKEN}":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    global latest_graph
    latest_graph = graph.model_dump(mode="json")
    return {"message": "Graph ingested successfully", "nodes": str(len(graph.nodes))}

@app.post("/api/v1/nodes", status_code=status.HTTP_201_CREATED)
async def post_node(node: Node) -> dict[str, str]:
    """Ingest a single planned Node into the current graph state.
    
    If Memgraph is later integrated, this handles the specific node insertion query.
    """
    global latest_graph
    
    node_data = node.model_dump(mode="json")
    
    # If no graph exists, init an empty graph envelope
    if latest_graph is None:
        if SAMPLE_PATH.exists():
            latest_graph = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
        else:
            latest_graph = {"nodes": [], "edges": []}
            
    # Append the planned node
    latest_graph["nodes"].append(node_data)
    
    return {"message": f"Planned node {node.id} added successfully", "id": node.id}

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
