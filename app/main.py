"""
Infradian Data Engine — FastAPI entrypoint

Provides two routes:
  POST /graph        – validate & echo an InfraGraph payload
  GET  /graph/sample – return the bundled sample AWS environment
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .models import InfraGraph

app = FastAPI(
    title="Infradian Data Engine",
    version="0.1.0",
    description="Universal infrastructure graph API for the 2.5D visualizer.",
)

SAMPLE_PATH = Path(__file__).resolve().parent.parent / "sample_payload.json"


@app.post("/graph", response_model=InfraGraph)
async def ingest_graph(graph: InfraGraph) -> InfraGraph:
    """Validate an infrastructure graph payload and return it."""
    return graph


@app.get("/graph/sample")
async def get_sample_graph() -> JSONResponse:
    """Return the bundled sample AWS environment payload."""
    raw = SAMPLE_PATH.read_text(encoding="utf-8")
    payload = json.loads(raw)
    # Validate through Pydantic before returning
    graph = InfraGraph.model_validate(payload)
    return JSONResponse(content=graph.model_dump(mode="json"))
