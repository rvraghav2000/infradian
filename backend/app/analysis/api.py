from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from .utils import get_system_graph_models
from ..models import InfraGraph, Node, Edge

router = APIRouter(prefix="/analysis", tags=["analysis"])

def _build_engine():
    """Build a DecisionEngine from the live system graph."""
    from .engine import DecisionEngine
    nodes, edges = get_system_graph_models()
    return DecisionEngine(nodes, edges)

class SimulateRemovalRequest(BaseModel):
    nodeId: str

@router.get("/v2/blast-radius/{node_id}")
async def engine_blast_radius(node_id: str, max_depth: int = 10, max_cost: float = 1000.0):
    """Production weighted blast radius with Dijkstra traversal and critical paths."""
    engine = _build_engine()
    try:
        return engine.blast_radius(node_id, max_depth=max_depth, max_cost=max_cost)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/v2/safe-delete/{node_id}")
async def engine_safe_delete(node_id: str):
    """Constraint-based safe-to-delete analysis with hard blockers and evidence."""
    engine = _build_engine()
    try:
        return engine.safe_delete(node_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/v2/simulate-removal")
async def engine_simulate_removal(request: SimulateRemovalRequest):
    """Counterfactual removal simulation: broken/degraded/unaffected classification."""
    engine = _build_engine()
    try:
        return engine.simulate_removal(request.nodeId)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/v2/top-actions")
async def engine_top_actions(limit: int = 5):
    """Prioritized action ranking: top risks, safe deletions, waste candidates."""
    engine = _build_engine()
    try:
        return engine.top_actions(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
