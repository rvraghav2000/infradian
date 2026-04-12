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
    EXPECTED = "expected"
    SIMULATED = "simulated"
    REMOVED = "removed"


class NodeLayer(str, Enum):
    """Architectural layer classification for a Node."""

    RUNTIME = "runtime"
    STRUCTURAL = "structural"
    DATA = "data"
    CONTROL_PLANE = "control_plane"
    EVENTING = "eventing"


class InteractionType(str, Enum):
    """Semantic interaction type for an Edge."""

    RUNTIME_CALL = "runtime_call"
    ASYNC_EVENT = "async_event"
    CONTAINMENT = "containment"
    CONTROL_DEPENDENCY = "control_dependency"
    DATA_DEPENDENCY = "data_dependency"
    FALLBACK = "fallback"


# ── Layer auto-classification from node type ─────────────────────────

_TYPE_LAYER_MAP: dict[str, NodeLayer] = {
    "aws_vpc": NodeLayer.STRUCTURAL,
    "aws_subnet": NodeLayer.STRUCTURAL,
    "aws_security_group": NodeLayer.STRUCTURAL,
    "aws_instance": NodeLayer.RUNTIME,
    "aws_lambda": NodeLayer.RUNTIME,
    "aws_lambda_function": NodeLayer.RUNTIME,
    "aws_alb": NodeLayer.RUNTIME,
    "aws_target_group": NodeLayer.RUNTIME,
    "aws_db_instance": NodeLayer.DATA,
    "aws_elasticache": NodeLayer.DATA,
    "aws_s3": NodeLayer.DATA,
    "nosql_db": NodeLayer.DATA,
    "aws_cloudwatch": NodeLayer.CONTROL_PLANE,
    "aws_secrets_manager": NodeLayer.CONTROL_PLANE,
    "aws_waf": NodeLayer.CONTROL_PLANE,
    "aws_route53": NodeLayer.CONTROL_PLANE,
    "aws_cloudfront": NodeLayer.RUNTIME,
    "aws_api_gateway": NodeLayer.RUNTIME,
    "cicd_github_actions": NodeLayer.CONTROL_PLANE,
    "sre_pagerduty": NodeLayer.EVENTING,
    "cloud_provider": NodeLayer.STRUCTURAL,
    "k8s_cluster": NodeLayer.STRUCTURAL,
    "generic_container": NodeLayer.RUNTIME,
}


def infer_layer(node_type: str) -> NodeLayer:
    """Auto-classify a node type into an architectural layer."""
    return _TYPE_LAYER_MAP.get(node_type, NodeLayer.RUNTIME)


# ── Required dependency rules by node type ───────────────────────────

_REQUIRED_DEPS: dict[str, list[str]] = {
    "aws_instance": ["aws_subnet"],
    "aws_lambda": [],
    "aws_lambda_function": [],
    "aws_db_instance": ["aws_subnet"],
    "aws_alb": ["aws_vpc"],
    "aws_target_group": ["aws_alb"],
    "aws_subnet": ["aws_vpc"],
}


def infer_required_deps(node_type: str) -> list[str]:
    """Return required dependency types for a node type."""
    return _REQUIRED_DEPS.get(node_type, [])


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
    account_id: Optional[str] = Field(
        default=None,
        description="Authoritative ledger ID (e.g. AWS Account number).",
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

    # ── Analysis engine fields (all optional, backward-compatible) ────
    environment: str = Field(
        default="production",
        description="Deployment environment: production, staging, dev.",
    )
    business_function: str = Field(
        default="general",
        description="Business domain this resource supports.",
    )
    traffic_score: float = Field(
        default=0.5, ge=0.0, le=1.0,
        description="Normalized traffic importance (0=none, 1=critical path).",
    )
    usage_score: float = Field(
        default=0.5, ge=0.0, le=1.0,
        description="Normalized utilization (0=idle, 1=fully used).",
    )
    monthly_cost: float = Field(
        default=0.0, ge=0.0,
        description="Estimated monthly cost in USD.",
    )
    criticality: str = Field(
        default="medium",
        description="Criticality tier: critical, high, medium, low.",
    )
    redundancy_level: int = Field(
        default=0, ge=0,
        description="Number of redundant replicas or failover targets.",
    )
    last_seen_at: Optional[datetime] = Field(
        default=None,
        description="Last time telemetry was received from this resource.",
    )

    # ── UIM operational fields ────────────────────────────────────────
    layer: Optional[str] = Field(
        default=None,
        description="Architectural layer: runtime, structural, data, control_plane, eventing. Auto-inferred if None.",
    )
    removable: bool = Field(
        default=True,
        description="Whether this node can be removed by users.",
    )
    supports_simulation: bool = Field(
        default=True,
        description="Whether this node can participate in simulations.",
    )
    required_dependencies: list[str] = Field(
        default_factory=list,
        description="List of node types this resource MUST connect to.",
    )
    optional_dependencies: list[str] = Field(
        default_factory=list,
        description="List of node types this resource MAY connect to.",
    )
    tags: dict[str, str] = Field(
        default_factory=dict,
        description="User-defined key-value tags.",
    )

    def resolved_layer(self) -> str:
        """Return layer, auto-inferring from type if not explicitly set."""
        if self.layer:
            return self.layer
        return infer_layer(self.type).value

    def resolved_required_deps(self) -> list[str]:
        """Return required deps, auto-inferring from type if empty."""
        if self.required_dependencies:
            return self.required_dependencies
        return infer_required_deps(self.type)

class Edge(BaseModel):
    """A directed dependency between two Nodes.
    
    This model matches the ingestion contract for discovery agents.
    """
    id: str = Field(..., description="Unique ID for the relationship.")
    source: str = Field(..., description="ID of the source node.")
    target: str = Field(..., description="ID of the target node.")
    label: str = Field(default="DEPENDS_ON", description="The relationship type (e.g. 'CONNECTS_TO').")
    attributes: dict[str, Any] = Field(default_factory=dict, description="Metadata for the edge.")

    # ── Analysis engine fields (all optional, backward-compatible) ────
    dependency_mode: str = Field(
        default="sync",
        description="Dependency mode: sync, async, inferred, fallback, control_plane.",
    )
    confidence: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="Confidence that this dependency actually exists.",
    )
    traffic_share: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="Fraction of traffic flowing through this edge.",
    )
    edge_weight: Optional[float] = Field(
        default=None,
        description="Explicit edge weight. Computed from other fields if None.",
    )
    last_validated_at: Optional[datetime] = Field(
        default=None,
        description="Last time this dependency was validated.",
    )

    # ── UIM semantic edge fields ──────────────────────────────────────
    interaction_type: str = Field(
        default="runtime_call",
        description="Semantic interaction: runtime_call, async_event, containment, control_dependency, data_dependency, fallback.",
    )
    primary: bool = Field(
        default=True,
        description="Whether this is the primary dependency path (vs fallback/secondary).",
    )
    inferred: bool = Field(
        default=False,
        description="Whether this edge was auto-inferred rather than explicitly declared.",
    )
    direction: str = Field(
        default="downstream",
        description="Semantic direction: downstream, upstream, lateral.",
    )


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
