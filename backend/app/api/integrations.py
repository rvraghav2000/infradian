"""
Cloud Connections Management Router

Manages persistent cloud provider integrations stored as CloudIntegration nodes 
in Neo4j. Supports test → save → sync → delete lifecycle.
"""

import logging
import base64
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.database import db
from app.integrations.aws.client import AWSClient
from app.integrations.aws.inventory import AWSInventoryCollector
from app.integrations.aws.normalize import AWSGraphNormalizer
from app.integrations.aws.graph_sync import AWSGraphSync

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cloud", tags=["cloud-connections"])


# ── Request / Response Models ────────────────────────────────────────

class TestConnectionRequest(BaseModel):
    provider: str = Field(default="aws", description="Cloud provider")
    region: str = Field(default="us-east-1")
    access_key_id: str = Field(..., min_length=1)
    secret_access_key: str = Field(..., min_length=1)

class TestConnectionResponse(BaseModel):
    valid: bool
    account_id: Optional[str] = None
    arn: Optional[str] = None
    error: Optional[str] = None

class AddConnectionRequest(BaseModel):
    alias: str = Field(..., min_length=1, description="Human-friendly name")
    provider: str = Field(default="aws")
    region: str = Field(default="us-east-1")
    access_key_id: str = Field(..., min_length=1)
    secret_access_key: str = Field(..., min_length=1)

class ConnectionOut(BaseModel):
    id: str
    alias: str
    provider: str
    region: str
    account_id: Optional[str] = None
    access_key_id_masked: str
    status: str
    last_sync_at: Optional[str] = None
    created_at: str

class SyncResultOut(BaseModel):
    connection_id: str
    status: str
    nodes_synced: int = 0
    edges_synced: int = 0
    error: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────

def _obfuscate(plain: str) -> str:
    """Simple base64 encode. NOT production encryption."""
    return base64.b64encode(plain.encode()).decode()

def _deobfuscate(encoded: str) -> str:
    return base64.b64decode(encoded.encode()).decode()

def _mask_key(key_id: str) -> str:
    """Show only last 4 characters: ****XMPL"""
    if len(key_id) <= 4:
        return "****"
    return "****" + key_id[-4:]


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/test", response_model=TestConnectionResponse)
async def test_connection(req: TestConnectionRequest):
    """Validate AWS credentials by calling STS GetCallerIdentity."""
    try:
        client = AWSClient(
            region_name=req.region,
            aws_access_key_id=req.access_key_id,
            aws_secret_access_key=req.secret_access_key,
        )
        sts = client.get_client("sts")
        identity = sts.get_caller_identity()
        return TestConnectionResponse(
            valid=True,
            account_id=identity.get("Account"),
            arn=identity.get("Arn"),
        )
    except Exception as e:
        logger.warning(f"Connection test failed: {e}")
        return TestConnectionResponse(valid=False, error=str(e))


@router.post("/connections", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
async def add_connection(req: AddConnectionRequest):
    """Persist a new cloud integration to Neo4j after verifying credentials."""
    # 1. Verify first
    try:
        client = AWSClient(
            region_name=req.region,
            aws_access_key_id=req.access_key_id,
            aws_secret_access_key=req.secret_access_key,
        )
        sts = client.get_client("sts")
        identity = sts.get_caller_identity()
        account_id = identity.get("Account", "unknown")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Credentials invalid: {e}")

    # 2. Store in Neo4j
    conn_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    cypher = """
    CREATE (c:CloudIntegration {
        id: $id,
        alias: $alias,
        provider: $provider,
        region: $region,
        account_id: $account_id,
        access_key_id: $access_key_id,
        encrypted_secret_key: $encrypted_secret_key,
        status: 'connected',
        last_sync_at: null,
        created_at: $created_at
    })
    RETURN properties(c) AS props
    """
    result = db.query(cypher, parameters={
        "id": conn_id,
        "alias": req.alias,
        "provider": req.provider,
        "region": req.region,
        "account_id": account_id,
        "access_key_id": req.access_key_id,
        "encrypted_secret_key": _obfuscate(req.secret_access_key),
        "created_at": now,
    })

    if not result:
        raise HTTPException(status_code=500, detail="Failed to persist connection")

    return ConnectionOut(
        id=conn_id,
        alias=req.alias,
        provider=req.provider,
        region=req.region,
        account_id=account_id,
        access_key_id_masked=_mask_key(req.access_key_id),
        status="connected",
        last_sync_at=None,
        created_at=now,
    )


@router.get("/connections", response_model=List[ConnectionOut])
async def list_connections():
    """Return all stored cloud integrations (secret keys are never exposed)."""
    cypher = "MATCH (c:CloudIntegration) RETURN properties(c) AS props ORDER BY c.created_at DESC"
    rows = db.query(cypher)
    if rows is None:
        raise HTTPException(status_code=500, detail="Neo4j unavailable")

    connections = []
    for row in rows:
        p = row.get("props", {})
        connections.append(ConnectionOut(
            id=p.get("id", ""),
            alias=p.get("alias", ""),
            provider=p.get("provider", "aws"),
            region=p.get("region", ""),
            account_id=p.get("account_id"),
            access_key_id_masked=_mask_key(p.get("access_key_id", "")),
            status=p.get("status", "unknown"),
            last_sync_at=p.get("last_sync_at"),
            created_at=p.get("created_at", ""),
        ))
    return connections


@router.post("/connections/{connection_id}/sync", response_model=SyncResultOut)
async def sync_connection(connection_id: str):
    """Load stored credentials and run the full AWS ingestion pipeline."""
    # 1. Fetch connection from Neo4j
    cypher = "MATCH (c:CloudIntegration {id: $id}) RETURN properties(c) AS props"
    rows = db.query(cypher, parameters={"id": connection_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Connection not found")

    p = rows[0].get("props", {})
    access_key = p.get("access_key_id")
    secret_key = _deobfuscate(p.get("encrypted_secret_key", ""))
    region = p.get("region", "us-east-1")
    account_id = p.get("account_id", "unknown")

    # 2. Mark as syncing
    db.query(
        "MATCH (c:CloudIntegration {id: $id}) SET c.status = 'syncing'",
        parameters={"id": connection_id},
    )

    # 3. Run the existing pipeline
    try:
        client = AWSClient(
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

        collector = AWSInventoryCollector(client)
        raw_inventory = collector.collect_all()

        normalizer = AWSGraphNormalizer(region=region, account_id=account_id)
        nodes, edges = normalizer.normalize(raw_inventory)

        sync_engine = AWSGraphSync()
        sync_result = sync_engine.sync(nodes, edges)

        now = datetime.now(timezone.utc).isoformat()
        db.query(
            "MATCH (c:CloudIntegration {id: $id}) SET c.status = 'connected', c.last_sync_at = $ts",
            parameters={"id": connection_id, "ts": now},
        )

        return SyncResultOut(
            connection_id=connection_id,
            status="success",
            nodes_synced=sync_result.get("nodes_synced", 0),
            edges_synced=sync_result.get("edges_synced", 0),
        )

    except Exception as e:
        logger.exception(f"Sync failed for connection {connection_id}")
        db.query(
            "MATCH (c:CloudIntegration {id: $id}) SET c.status = 'error'",
            parameters={"id": connection_id},
        )
        return SyncResultOut(
            connection_id=connection_id,
            status="error",
            error=str(e),
        )


@router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: str):
    """Remove a connection and cascade-delete all Resource nodes it synced."""
    # 1. Fetch to get account_id for cascade
    cypher = "MATCH (c:CloudIntegration {id: $id}) RETURN properties(c) AS props"
    rows = db.query(cypher, parameters={"id": connection_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Connection not found")

    account_id = rows[0].get("props", {}).get("account_id")

    # 2. Cascade-delete synced resources belonging to this account
    if account_id:
        db.query(
            "MATCH (r:Resource {account_id: $acc}) DETACH DELETE r",
            parameters={"acc": account_id},
        )
        logger.info(f"Cascade-deleted resources for account {account_id}")

    # 3. Delete the connection node itself
    db.query(
        "MATCH (c:CloudIntegration {id: $id}) DELETE c",
        parameters={"id": connection_id},
    )

    return {"message": f"Connection {connection_id} and associated resources deleted"}
