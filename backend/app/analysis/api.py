from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from .blast_radius import BlastRadiusAnalyzer
from .scoring import ScoringConfig, calculate_node_waste
from .utils import get_system_graph_models
from ..models import InfraGraph, Node, Edge

router = APIRouter(prefix="/analysis", tags=["analysis"])

class BlastRadiusRequest(BaseModel):
    source_id: str
    max_hops: int = 5
    direction: str = "downstream"
    graph: Optional[InfraGraph] = None
    config: Optional[ScoringConfig] = None

@router.post("/blast-radius")
async def get_blast_radius(request: BlastRadiusRequest):
    """
    Computes the blast radius for a given source node in a graph.
    If a graph is provided in the request, it uses that. 
    Otherwise, it returns an error (future: fetch from database).
    """
    if not request.graph:
        raise HTTPException(
            status_code=400, 
            detail="Graph input is required for this analysis."
        )
        
    analyzer = BlastRadiusAnalyzer(request.graph.nodes, request.graph.edges)
    
    # Use config from request if provided, else defaults
    analysis_config = request.config if request.config else None
    
    result = analyzer.analyze(
        source_id=request.source_id,
        max_hops=request.max_hops,
        direction=request.direction,
        config=analysis_config
    )
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
        
    return result

@router.get("/blast-radius/{node_id}")
async def get_node_blast_radius(node_id: str, max_hops: int = 5):
    """Targeted GET endpoint for a specific node in the system graph."""
    nodes, edges = get_system_graph_models()
    analyzer = BlastRadiusAnalyzer(nodes, edges)
    result = analyzer.analyze(source_id=node_id, max_hops=max_hops)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@router.get("/recommendations/high-risk")
async def get_high_risk_recommendations():
    """Identifies top 5 nodes with the highest blast radius risk."""
    nodes, edges = get_system_graph_models()
    analyzer = BlastRadiusAnalyzer(nodes, edges)
    
    all_results = []
    for node in nodes:
        res = analyzer.analyze(source_id=node.id, max_hops=3)
        if "error" not in res:
            all_results.append({
                "id": node.id,
                "label": node.label,
                "risk": res["overall_scores"]["risk"],
                "affected_count": res["affected_count"]
            })
            
    # Sort by risk descending
    recommendations = sorted(all_results, key=lambda x: x["risk"], reverse=True)[:5]
    return {"recommendations": recommendations}

@router.get("/recommendations/waste")
async def get_waste_recommendations():
    """Identifies top 5 nodes with the highest waste scores."""
    nodes, edges = get_system_graph_models()
    
    all_results = []
    for node in nodes:
        waste = calculate_node_waste(node)
        all_results.append({
            "id": node.id,
            "label": node.label,
            "waste": waste,
            "type": node.type
        })
            
    recommendations = sorted(all_results, key=lambda x: x["waste"], reverse=True)[:5]
    return {"recommendations": recommendations}

@router.post("/simulate/remove")
async def simulate_node_removal(request: BlastRadiusRequest):
    """Simulates a node removal and returns the impact radius."""
    if not request.graph:
        nodes, edges = get_system_graph_models()
    else:
        nodes, edges = request.graph.nodes, request.graph.edges
        
    analyzer = BlastRadiusAnalyzer(nodes, edges)
    result = analyzer.simulate_node_removal(target_node_id=request.source_id)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
        
    return {
        "status": "simulation_complete",
        "report": result
    }


# ── Production Engine Endpoints ──────────────────────────────────────

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
