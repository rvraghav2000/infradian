"""
Infradian — Universal Infrastructure Graph Schema

Pydantic v2 models that define the canonical data contract for the
2.5D infrastructure visualizer.  Every piece of infrastructure is a
Node; every dependency is an Edge; together they form an InfraGraph.

Nodes carry:
  • metrics  – live telemetry (current_load 0.0‥1.0, extensible)
  • history  – ordered CI/CD events for Z-axis timeline rendering
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional, Any

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────

class CICDEventStatus(str, Enum):
    """Possible statuses for a CI/CD pipeline event."""

    SUCCESS = "success"
    FAILURE = "failure"
    IN_PROGRESS = "in_progress"


class NodeStatus(str, Enum):
    """Lifecycle status of a Node in the infrastructure graph."""

    LIVE = "live"
    PLANNED = "planned"


# ── Sub-models ───────────────────────────────────────────────────────

class CICDEvent(BaseModel):
    """A single CI/CD event stored in a Node's history list.

    Used by the renderer to project events along the Z-axis timeline.
    """

    timestamp: datetime = Field(
        ...,
        description="ISO-8601 timestamp of the event.",
    )
    status: CICDEventStatus = Field(
        ...,
        description="Outcome of the CI/CD event.",
    )
    message: str = Field(
        ...,
        min_length=1,
        description="Human-readable description of the event.",
    )


class NodeMetrics(BaseModel):
    """Live telemetry snapshot attached to every Node.

    `current_load` is the only required metric today, but the model
    is intentionally kept open for future extension (e.g. cpu, memory,
    latency percentiles).
    """

    current_load: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Normalised load factor (0.0 = idle, 1.0 = saturated).",
    )


# ── Core graph primitives ────────────────────────────────────────────

class Node(BaseModel):
    """A single infrastructure resource (compute, network, storage…).

    Attributes
    ----------
    id : str
        Globally-unique identifier (e.g. ``"vpc-001"``).
    type : str
        Provider-specific resource type (e.g. ``"aws_vpc"``).
    label : str
        Human-friendly display label shown in the visualizer.
    status : NodeStatus
        Lifecycle status ('live' or 'planned').
    parent_id : str | None
        Id of the parent node for nested architectures
        (e.g. Subnet → VPC).  ``None`` for top-level resources.
    metrics : NodeMetrics
        Current telemetry snapshot.
    history : list[CICDEvent]
        Chronological CI/CD events for Z-axis rendering.
    attributes : dict[str, Any]
        Raw configuration attributes extracted from terraform.tfstate.
    """

    id: str = Field(
        ...,
        min_length=1,
        description="Globally-unique resource identifier.",
    )
    type: str = Field(
        ...,
        min_length=1,
        description="Provider-specific resource type (e.g. 'aws_vpc').",
    )
    label: str = Field(
        ...,
        min_length=1,
        description="Human-readable display label.",
    )
    status: NodeStatus = Field(
        default=NodeStatus.LIVE,
        description="Lifecycle status of this resource.",
    )
    parent_id: Optional[str] = Field(
        default=None,
        validation_alias="parentId",
        serialization_alias="parentId",
        description="Parent node id for nested architectures (None = root).",
    )
    metrics: NodeMetrics = Field(
        ...,
        description="Live telemetry snapshot.",
    )
    history: list[CICDEvent] = Field(
        default_factory=list,
        description="CI/CD events for Z-axis timeline rendering.",
    )
    attributes: dict[str, Any] = Field(
        default_factory=dict,
        description="Raw configuration attributes extracted from terraform.",
    )

class Edge(BaseModel):
    """A directed dependency between two Nodes.
    
    This model matches the ingestion contract for discovery agents.
    """
    id: str = Field(..., description="Unique ID for the relationship.")
    source: str = Field(..., description="ID of the source node.")
    target: str = Field(..., description="ID of the target node.")
    label: str = Field(default="DEPENDS_ON", description="The relationship type (e.g. 'CONNECTS_TO').")
    attributes: dict[str, Any] = Field(default_factory=dict, description="Metadata for the edge.")


# ── Top-level payload ────────────────────────────────────────────────

class InfraGraph(BaseModel):
    """Root envelope for all infrastructure data sent to the visualizer.

    Contains a flat list of Nodes (nesting is expressed via
    ``parent_id``) and a flat list of directed Edges.
    """

    nodes: list[Node] = Field(
        ...,
        min_length=1,
        description="All infrastructure resources in this graph.",
    )
    edges: list[Edge] = Field(
        default_factory=list,
        description="Directed dependencies between nodes.",
    )
