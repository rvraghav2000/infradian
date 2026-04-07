from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from .utils import get_system_graph_models
from ..models import InfraGraph, Node, Edge

router = APIRouter(prefix="/analysis", tags=["analysis"])

class SimulationContext(BaseModel):
    nodes: List[Node] = []
    edges: List[Edge] = []

class AnalysisRequest(BaseModel):
    nodeId: str
    simulation: Optional[SimulationContext] = None
    maxDepth: int = 10
    maxCost: float = 1000.0

def _build_engine(simulation: Optional[SimulationContext] = None):
    from .engine import DecisionEngine
    nodes, edges = get_system_graph_models()
    
    if simulation:
        # Merge draft nodes — ensuring no duplicates if they already exist in live
        live_ids = {n.id for n in nodes}
        if simulation.nodes:
            for dn in simulation.nodes:
                if dn.id not in live_ids:
                    nodes.append(dn)
        
        # Merge draft edges
        if simulation.edges:
            edges.extend(simulation.edges)
        
    return DecisionEngine(nodes, edges)

@router.post("/v2/blast-radius")
async def engine_blast_radius(request: AnalysisRequest):
    """Production weighted blast radius with simulation support."""
    engine = _build_engine(request.simulation)
    try:
        return engine.blast_radius(
            request.nodeId, 
            max_depth=request.maxDepth, 
            max_cost=request.maxCost
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/v2/safe-delete")
async def engine_safe_delete(request: AnalysisRequest):
    """Safe-to-delete analysis with simulation support."""
    engine = _build_engine(request.simulation)
    try:
        return engine.safe_delete(request.nodeId)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/v2/simulate-removal")
async def engine_simulate_removal(request: AnalysisRequest):
    """Removal simulation with simulation support."""
    engine = _build_engine(request.simulation)
    try:
        return engine.simulate_removal(request.nodeId)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/v2/top-actions")
async def engine_top_actions(request: AnalysisRequest):
    """Prioritized action ranking with simulation support."""
    # Note: For top-actions, nodeId might be empty, we just need the simulation context
    engine = _build_engine(request.simulation)
    limit = request.maxDepth if request.maxDepth else 5
    try:
        return engine.top_actions(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


