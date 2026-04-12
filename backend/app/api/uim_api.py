"""
UIM (Unified Infrastructure Model) API Router.

Endpoints:
  POST /uim/simulate   — Simulate mutations on the graph
  POST /uim/diff       — Compare current vs proposed graph
  POST /uim/validate   — Run architecture validation rules
  POST /uim/readiness  — Compute readiness/completeness scores
  POST /uim/actions    — Top actions including planned insights
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..analysis.utils import get_system_graph_models
from ..analysis.engine import DecisionEngine
from ..models import Node, Edge, NodeMetrics

router = APIRouter(prefix="/uim", tags=["UIM"])


# ── Request/Response schemas ─────────────────────────────────────────

class SimulationContext(BaseModel):
    """Optional draft nodes/edges to merge with live graph."""
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)


class SimulateMutationsRequest(BaseModel):
    """Request body for /uim/simulate."""
    add_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    remove_node_ids: List[str] = Field(default_factory=list)
    add_edges: List[Dict[str, Any]] = Field(default_factory=list)
    simulation: Optional[SimulationContext] = None


class DiffRequest(BaseModel):
    """Request body for /uim/diff — proposed graph to compare against current."""
    proposed: SimulationContext
    simulation: Optional[SimulationContext] = None


class ValidateRequest(BaseModel):
    """Request body for /uim/validate."""
    simulation: Optional[SimulationContext] = None


class ReadinessRequest(BaseModel):
    """Request body for /uim/readiness."""
    simulation: Optional[SimulationContext] = None


class ActionsRequest(BaseModel):
    """Request body for /uim/actions."""
    limit: int = Field(default=5, ge=1, le=20)
    simulation: Optional[SimulationContext] = None


# ── Helpers ──────────────────────────────────────────────────────────

def _build_engine(simulation: Optional[SimulationContext] = None) -> DecisionEngine:
    """Build a DecisionEngine from live Neo4j data + optional draft context."""
    live_nodes, live_edges = get_system_graph_models()

    if simulation and (simulation.nodes or simulation.edges):
        draft_nodes = [_parse_node(d) for d in simulation.nodes]
        draft_edges = [_parse_edge(d) for d in simulation.edges]
        all_nodes = live_nodes + draft_nodes
        all_edges = live_edges + draft_edges
    else:
        all_nodes = live_nodes
        all_edges = live_edges

    return DecisionEngine(all_nodes, all_edges)


def _parse_node(data: Dict[str, Any]) -> Node:
    """Safely parse a dict into a Node with defaults for missing fields."""
    return Node(
        id=data.get("id", "unknown"),
        type=data.get("type", "unknown"),
        label=data.get("label") or data.get("name") or data.get("id", "Unknown"),
        status=data.get("status", "planned"),
        parent_id=data.get("parent_id") or data.get("parentId"),
        metrics=NodeMetrics(current_load=data.get("current_load", 0.0)),
        environment=data.get("environment", "production"),
        criticality=data.get("criticality", "medium"),
        monthly_cost=data.get("monthly_cost", 0.0),
        layer=data.get("layer"),
        tags=data.get("tags", {}),
    )


def _parse_edge(data: Dict[str, Any]) -> Edge:
    """Safely parse a dict into an Edge with defaults."""
    return Edge(
        id=data.get("id", f"{data.get('source', '')}-{data.get('target', '')}"),
        source=data.get("source", data.get("source_id", "")),
        target=data.get("target", data.get("target_id", "")),
        label=data.get("label", "DEPENDS_ON"),
        dependency_mode=data.get("dependency_mode", "sync"),
        confidence=data.get("confidence", 1.0),
        traffic_share=data.get("traffic_share", 1.0),
        interaction_type=data.get("interaction_type", "runtime_call"),
        primary=data.get("primary", True),
        inferred=data.get("inferred", False),
    )


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/simulate")
async def simulate_mutations(req: SimulateMutationsRequest):
    """Simulate graph mutations (add/remove nodes + edges) and return impact analysis."""
    try:
        engine = _build_engine(req.simulation)

        add_nodes = [_parse_node(d) for d in req.add_nodes] if req.add_nodes else None
        add_edges = [_parse_edge(d) for d in req.add_edges] if req.add_edges else None
        remove_ids = req.remove_node_ids if req.remove_node_ids else None

        result = engine.simulate_mutations(
            add_nodes=add_nodes,
            remove_node_ids=remove_ids,
            add_edges=add_edges,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/diff")
async def compute_diff(req: DiffRequest):
    """Compare current (live) graph vs a proposed graph."""
    try:
        engine = _build_engine(req.simulation)

        proposed_nodes = [_parse_node(d) for d in req.proposed.nodes]
        proposed_edges = [_parse_edge(d) for d in req.proposed.edges]

        result = engine.diff(proposed_nodes, proposed_edges)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate")
async def validate_architecture(req: ValidateRequest):
    """Run all architecture validation rules against the current + draft graph."""
    try:
        engine = _build_engine(req.simulation)
        return engine.validate()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/readiness")
async def compute_readiness(req: ReadinessRequest):
    """Compute completeness, readiness, and confidence scores."""
    try:
        engine = _build_engine(req.simulation)
        return engine.readiness()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/actions")
async def top_actions(req: ActionsRequest):
    """Get ranked top actions including planned architecture insights."""
    try:
        engine = _build_engine(req.simulation)
        return engine.top_actions(req.limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
