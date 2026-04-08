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

import json
import boto3
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.database import db
from app.integrations.aws.client import AWSClient
from app.integrations.aws.inventory import AWSInventoryCollector
from app.integrations.aws.normalize import AWSGraphNormalizer
from app.integrations.aws.graph_sync import AWSGraphSync
from app.integrations.aws.verifier import AWSVerifier
from app.integrations.azure.verifier import AzureVerifier
from app.integrations.gcp.verifier import GCPVerifier

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cloud", tags=["cloud-connections"])


# ── Request / Response Models ────────────────────────────────────────

class TestConnectionRequest(BaseModel):
    provider: str = Field(default="aws", description="Cloud provider")
    region: str = Field(default="us-east-1")
    # AWS
    access_key_id: Optional[str] = Field(default=None)
    secret_access_key: Optional[str] = Field(default=None)
    # Azure
    tenant_id: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    subscription_id: Optional[str] = None
    # GCP
    project_id: Optional[str] = None
    service_account_info: Optional[dict] = None

class TestConnectionResponse(BaseModel):
    valid: bool
    account_id: Optional[str] = None
    arn: Optional[str] = None
    error: Optional[str] = None

class AddConnectionRequest(BaseModel):
    alias: str = Field(..., min_length=1, description="Human-friendly name")
    provider: str = Field(default="aws")
    region: str = Field(default="us-east-1")
    # AWS
    access_key_id: Optional[str] = Field(default=None)
    secret_access_key: Optional[str] = Field(default=None)
    # Azure
    tenant_id: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    subscription_id: Optional[str] = None
    # GCP
    project_id: Optional[str] = None
    service_account_info: Optional[dict] = None

class BootstrapConnectionRequest(BaseModel):
    alias: str = Field(default="Infradian Auto", description="Human-friendly name")
    region: str = Field(default="us-east-1")
    admin_access_key_id: str = Field(..., min_length=1)
    admin_secret_access_key: str = Field(..., min_length=1)

class ConnectionOut(BaseModel):
    id: str
    alias: str
    provider: str
    region: str
    account_id: Optional[str] = None
    access_key_id_masked: Optional[str] = None
    status: str
    last_sync_at: Optional[str] = None
    created_at: str

class SyncResultOut(BaseModel):
    connection_id: str
    status: str
    nodes_synced: int = 0
    edges_synced: int = 0
    error: Optional[str] = None
    collector_errors: List[str] = Field(default_factory=list)
    message: str = ""


class AWSVerifyRequest(BaseModel):
    connection_id: Optional[str] = Field(default=None, description="Verify stored connection")
    region: str = Field(default="us-east-1")
    access_key_id: Optional[str] = Field(default=None)
    secret_access_key: Optional[str] = Field(default=None)

class AWSCheckResult(BaseModel):
    service: str
    status: str  # PASS | FAIL
    message: str
    missing_permissions: List[str] = Field(default_factory=list)
    suggested_policy_snippet: Optional[dict] = None

class AWSVerificationReport(BaseModel):
    connection_id: Optional[str] = None
    account_id: Optional[str] = None
    overall_status: str  # healthy | partial | disconnected
    checks: List[AWSCheckResult]


class AzureVerifyRequest(BaseModel):
    connection_id: Optional[str] = Field(default=None)
    tenant_id: Optional[str] = Field(default=None)
    client_id: Optional[str] = Field(default=None)
    client_secret: Optional[str] = Field(default=None)
    subscription_id: Optional[str] = Field(default=None)

class GCPVerifyRequest(BaseModel):
    connection_id: Optional[str] = Field(default=None)
    project_id: Optional[str] = Field(default=None)
    service_account_info: Optional[dict] = Field(default=None)

class CloudCheckResult(BaseModel):
    service: str
    status: str
    message: str
    missing_permissions: List[str] = Field(default_factory=list)
    suggested_policy_snippet: Optional[str] = None

class CloudVerificationReport(BaseModel):
    cloud_provider: str
    connection_id: Optional[str] = None
    account_id: Optional[str] = None
    overall_status: str
    checks: List[CloudCheckResult]


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
    """Validate credentials based on provider."""
    try:
        if req.provider == "aws":
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
        elif req.provider == "azure":
            verifier = AzureVerifier(req.tenant_id, req.client_id, req.client_secret, req.subscription_id)
            valid, msg = verifier.verify_identity()
            return TestConnectionResponse(valid=valid, account_id=verifier.account_id, error=None if valid else msg)
        elif req.provider == "gcp":
            verifier = GCPVerifier(req.service_account_info, req.project_id)
            valid, msg = verifier.verify_identity()
            return TestConnectionResponse(valid=valid, account_id=verifier.account_id, error=None if valid else msg)
        else:
            return TestConnectionResponse(valid=False, error=f"Unsupported provider: {req.provider}")
    except Exception as e:
        logger.warning(f"Connection test failed: {e}")
        return TestConnectionResponse(valid=False, error=str(e))


@router.post("/aws/verify", response_model=AWSVerificationReport)
async def verify_aws_connection(req: AWSVerifyRequest):
    """
    Modular AWS Check: Runs a comprehensive diagnostic probe to verify
    identity and service-level authority.
    """
    # 1. Resolve Credentials
    access_key = req.access_key_id
    secret_key = req.secret_access_key
    region = req.region
    connection_id = req.connection_id

    if connection_id:
        # Fetch from DB
        cypher = "MATCH (c:CloudIntegration {id: $id}) RETURN properties(c) AS props"
        rows = db.query(cypher, parameters={"id": connection_id})
        if not rows:
            raise HTTPException(status_code=404, detail="Connection not found")
        
        p = rows[0].get("props", {})
        access_key = p.get("access_key_id")
        secret_key = _deobfuscate(p.get("encrypted_secret_key", ""))
        region = p.get("region", region) # Use saved region if not passed

    if not access_key or not secret_key:
        raise HTTPException(status_code=400, detail="Missing AWS credentials")

    # 2. Run Diagnostics
    client = AWSClient(
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key
    )
    verifier = AWSVerifier(client)

    # A. Handshake (Identity)
    valid, identity_msg = verifier.verify_identity()
    if not valid:
        # User defined requirement: 401 on identity failure
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid Access/Secret Key pair."
        )

    # B. Authority Probe
    checks = verifier.run_comprehensive_check()

    # 3. Aggregate Status
    failed_counts = len([c for c in checks if c["status"] == "FAIL"])
    if failed_counts == 0:
        overall = "healthy"
    elif failed_counts < len(checks):
        overall = "partial"
    else:
        overall = "disconnected"

    return AWSVerificationReport(
        connection_id=connection_id,
        account_id=verifier.account_id,
        overall_status=overall,
        checks=checks
    )


@router.post("/azure/verify", response_model=CloudVerificationReport)
async def verify_azure_connection(req: AzureVerifyRequest):
    """Modular Azure Check."""
    tenant_id = req.tenant_id
    client_id = req.client_id
    client_secret = req.client_secret
    subscription_id = req.subscription_id
    connection_id = req.connection_id

    if connection_id:
        cypher = "MATCH (c:CloudIntegration {id: $id}) RETURN properties(c) AS props"
        rows = db.query(cypher, parameters={"id": connection_id})
        if not rows: raise HTTPException(status_code=404, detail="Connection not found")
        p = rows[0].get("props", {})
        tenant_id = p.get("tenant_id")
        client_id = p.get("client_id")
        client_secret = _deobfuscate(p.get("encrypted_client_secret", ""))
        subscription_id = p.get("subscription_id", subscription_id)

    if not all([tenant_id, client_id, client_secret]):
        raise HTTPException(status_code=400, detail="Missing Azure credentials")

    verifier = AzureVerifier(tenant_id, client_id, client_secret, subscription_id)
    valid, identity_msg = verifier.verify_identity()
    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=identity_msg)

    checks = verifier.run_comprehensive_check()
    failed_counts = len([c for c in checks if c["status"] == "FAIL"])
    overall = "healthy" if failed_counts == 0 else "partial" if failed_counts < len(checks) else "disconnected"

    return CloudVerificationReport(
        cloud_provider="azure",
        connection_id=connection_id,
        account_id=verifier.account_id,
        overall_status=overall,
        checks=checks
    )


@router.post("/gcp/verify", response_model=CloudVerificationReport)
async def verify_gcp_connection(req: GCPVerifyRequest):
    """Modular GCP Check."""
    sa_info = req.service_account_info
    project_id = req.project_id
    connection_id = req.connection_id

    if connection_id:
        cypher = "MATCH (c:CloudIntegration {id: $id}) RETURN properties(c) AS props"
        rows = db.query(cypher, parameters={"id": connection_id})
        if not rows: raise HTTPException(status_code=404, detail="Connection not found")
        p = rows[0].get("props", {})
        sa_info = json.loads(_deobfuscate(p.get("encrypted_sa_json", "")))
        project_id = p.get("project_id", project_id)

    if not sa_info:
        raise HTTPException(status_code=400, detail="Missing GCP credentials")

    verifier = GCPVerifier(sa_info, project_id)
    valid, identity_msg = verifier.verify_identity()
    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=identity_msg)

    checks = verifier.run_comprehensive_check()
    failed_counts = len([c for c in checks if c["status"] == "FAIL"])
    overall = "healthy" if failed_counts == 0 else "partial" if failed_counts < len(checks) else "disconnected"

    return CloudVerificationReport(
        cloud_provider="gcp",
        connection_id=connection_id,
        account_id=verifier.account_id,
        overall_status=overall,
        checks=checks
    )


@router.post("/connections", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
async def add_connection(req: AddConnectionRequest):
    """Persist a new cloud integration to Neo4j after verifying credentials."""
    account_id = "unknown"
    masked_key = "****"
    
    # 1. Verify credentials and get identity
    try:
        if req.provider == "aws":
            if not all([req.access_key_id, req.secret_access_key]):
                raise Exception("Missing AWS credentials")
            client = AWSClient(region_name=req.region, aws_access_key_id=req.access_key_id, aws_secret_access_key=req.secret_access_key)
            identity = client.get_client("sts").get_caller_identity()
            account_id = identity.get("Account", "unknown")
            masked_key = _mask_key(req.access_key_id)
        elif req.provider == "azure":
            if not all([req.tenant_id, req.client_id, req.client_secret]):
                raise Exception("Missing Azure credentials")
            verifier = AzureVerifier(req.tenant_id, req.client_id, req.client_secret, req.subscription_id)
            valid, msg = verifier.verify_identity()
            if not valid: raise Exception(msg)
            account_id = verifier.account_id
            masked_key = _mask_key(req.client_id)
        elif req.provider == "gcp":
            if not req.service_account_info:
                raise Exception("Missing GCP Service Account info")
            verifier = GCPVerifier(req.service_account_info, req.project_id)
            valid, msg = verifier.verify_identity()
            if not valid: raise Exception(msg)
            account_id = verifier.account_id
            masked_key = req.service_account_info.get("client_email", "****")
        else:
            raise Exception(f"Unsupported provider: {req.provider}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Credentials invalid: {e}")

    # 2. Store in Neo4j
    conn_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Generic storage pattern: store provider-specific fields
    cypher_props = {
        "id": conn_id,
        "alias": req.alias,
        "provider": req.provider,
        "region": req.region,
        "account_id": account_id,
        "status": 'connected',
        "last_sync_at": None,
        "created_at": now
    }
    
    if req.provider == "aws":
        cypher_props.update({
            "access_key_id": req.access_key_id,
            "encrypted_secret_key": _obfuscate(req.secret_access_key)
        })
    elif req.provider == "azure":
        cypher_props.update({
            "tenant_id": req.tenant_id,
            "client_id": req.client_id,
            "subscription_id": req.subscription_id,
            "encrypted_client_secret": _obfuscate(req.client_secret)
        })
    elif req.provider == "gcp":
        cypher_props.update({
            "project_id": account_id,
            "encrypted_sa_json": _obfuscate(json.dumps(req.service_account_info))
        })

    cypher = f"""
    CREATE (c:CloudIntegration)
    SET c = $props
    RETURN properties(c) AS props
    """
    result = db.query(cypher, parameters={"props": cypher_props})

    if not result:
        raise HTTPException(status_code=500, detail="Failed to persist connection")

    return ConnectionOut(
        id=conn_id,
        alias=req.alias,
        provider=req.provider,
        region=req.region,
        account_id=account_id,
        access_key_id_masked=masked_key,
        status="connected",
        last_sync_at=None,
        created_at=now,
    )


@router.post("/bootstrap", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
async def bootstrap_connection(req: BootstrapConnectionRequest):
    """
    Automated AWS Scaffolding:
    1. Uses admin keys to create a restricted 'infradian-scanner' user.
    2. Attaches the InfradianDiscoveryPolicy.
    3. Generates new restricted Access Keys.
    4. Persists the connection to Neo4j and discards admin keys.
    """
    try:
        # A. Initialize admin clients
        session = boto3.Session(
            aws_access_key_id=req.admin_access_key_id,
            aws_secret_access_key=req.admin_secret_access_key,
            region_name=req.region
        )
        iam = session.client("iam")
        sts = session.client("sts")
        
        # B. Get Account ID
        identity = sts.get_caller_identity()
        account_id = identity.get("Account")
        
        user_name = "infradian-scanner"
        policy_name = "InfradianDiscoveryPolicy"
        
        # C. Create IAM User (ignore if exists)
        try:
            iam.create_user(UserName=user_name)
            logger.info(f"Created IAM user: {user_name}")
        except iam.exceptions.EntityAlreadyExistsException:
            logger.info(f"IAM user {user_name} already exists")

        # D. Put Inline Policy
        discovery_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "InfradianScanner",
                    "Effect": "Allow",
                    "Action": [
                        "ec2:DescribeVpcs",
                        "ec2:DescribeSubnets",
                        "ec2:DescribeInstances",
                        "ec2:DescribeSecurityGroups",
                        "elasticloadbalancing:DescribeLoadBalancers",
                        "elasticloadbalancing:DescribeTargetGroups",
                        "elasticloadbalancing:DescribeTargetHealth",
                        "rds:DescribeDBInstances",
                        "lambda:ListFunctions",
                        "s3:ListAllMyBuckets",
                        "s3:ListBuckets",
                        "sts:GetCallerIdentity"
                    ],
                    "Resource": "*"
                }
            ]
        }
        
        iam.put_user_policy(
            UserName=user_name,
            PolicyName=policy_name,
            PolicyDocument=json.dumps(discovery_policy)
        )
        logger.info(f"Attached {policy_name} to {user_name}")

        # E. Generate Access Key
        key_response = iam.create_access_key(UserName=user_name)
        new_access_key = key_response["AccessKey"]["AccessKeyId"]
        new_secret_key = key_response["AccessKey"]["SecretAccessKey"]
        
        # F. Persist to Neo4j
        conn_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        cypher = """
        CREATE (c:CloudIntegration {
            id: $id,
            alias: $alias,
            provider: 'aws',
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
        db.query(cypher, parameters={
            "id": conn_id,
            "alias": req.alias,
            "region": req.region,
            "account_id": account_id,
            "access_key_id": new_access_key,
            "encrypted_secret_key": _obfuscate(new_secret_key),
            "created_at": now,
        })
        
        logger.info(f"Successfully bootstrapped restricted connection for account {account_id}")

        return ConnectionOut(
            id=conn_id,
            alias=req.alias,
            provider="aws",
            region=req.region,
            account_id=account_id,
            access_key_id_masked=_mask_key(new_access_key),
            status="connected",
            last_sync_at=None,
            created_at=now,
        )

    except Exception as e:
        logger.exception("Bootstrap failed")
        raise HTTPException(status_code=500, detail=f"Bootstrap failed: {str(e)}")



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
        collector_errors = collector.errors  # Captured per-service errors

        normalizer = AWSGraphNormalizer(region=region, account_id=account_id)
        nodes, edges = normalizer.normalize(raw_inventory)

        sync_engine = AWSGraphSync()
        sync_result = sync_engine.sync(nodes, edges)

        nodes_synced = sync_result.get("nodes_synced", 0)
        edges_synced = sync_result.get("edges_synced", 0)
        now = datetime.now(timezone.utc).isoformat()

        # Determine final status based on results
        if nodes_synced == 0 and len(collector_errors) > 0:
            # All collectors failed — likely IAM issue
            final_status = "warning"
            message = f"Sync completed but 0 resources found. {len(collector_errors)} service(s) returned errors — check IAM permissions."
        elif nodes_synced == 0:
            final_status = "warning"
            message = "Sync completed but 0 resources found in this region. Deploy some infrastructure or check the region."
        else:
            final_status = "connected"
            message = f"Successfully synced {nodes_synced} nodes and {edges_synced} edges."

        db.query(
            "MATCH (c:CloudIntegration {id: $id}) SET c.status = $status, c.last_sync_at = $ts",
            parameters={"id": connection_id, "status": final_status, "ts": now},
        )

        return SyncResultOut(
            connection_id=connection_id,
            status=final_status,
            nodes_synced=nodes_synced,
            edges_synced=edges_synced,
            collector_errors=collector_errors,
            message=message,
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
            message=f"Sync failed: {str(e)}",
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
