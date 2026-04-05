import logging
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

from app.integrations.aws.client import AWSClient
from app.integrations.aws.inventory import AWSInventoryCollector
from app.integrations.aws.normalize import AWSGraphNormalizer
from app.integrations.aws.graph_sync import AWSGraphSync

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations/aws", tags=["aws-integration"])

class AWSCredentialsRequest(BaseModel):
    awsAccessKeyId: Optional[str] = Field(None, description="Temporary or static AWS Access Key")
    awsSecretAccessKey: Optional[str] = Field(None, description="Temporary or static AWS Secret Key")
    awsSessionToken: Optional[str] = Field(None, description="Optional STS Session Token")
    region: Optional[str] = Field(None, description="Target AWS region")

class SyncResponse(BaseModel):
    status: str
    region: str
    account_id: str
    nodes_synced: int
    edges_synced: int
    resource_counts: Dict[str, Any]
    errors: Optional[List[str]] = None

@router.post("/status")
async def check_aws_status(creds: AWSCredentialsRequest = Body(default_factory=AWSCredentialsRequest)):
    """Check if the AWS integration has working credentials and connectivity."""
    is_connected = AWSClient.test_connection(
        region_name=creds.region,
        aws_access_key_id=creds.awsAccessKeyId,
        aws_secret_access_key=creds.awsSecretAccessKey,
        aws_session_token=creds.awsSessionToken
    )
    if is_connected:
        return {"status": "ok", "message": "AWS credentials valid and reachable."}
    else:
        logger.warning("AWS status check failed: credentials invalid or unreachable.")
        raise HTTPException(
            status_code=503, 
            detail="AWS credentials invalid or unreachable."
        )

@router.post("/sync", response_model=SyncResponse)
async def sync_aws_to_graph(creds: AWSCredentialsRequest = Body(default_factory=AWSCredentialsRequest)):
    """
    Triggers a full AWS infrastructure discovery, normalization,
    and Neo4j graph state synchronization securely over memory.
    """
    try:
        client = AWSClient(
            region_name=creds.region,
            aws_access_key_id=creds.awsAccessKeyId,
            aws_secret_access_key=creds.awsSecretAccessKey,
            aws_session_token=creds.awsSessionToken
        )
        active_region = client.region_name
        
        sts_client = client.get_client('sts')
        account_id = sts_client.get_caller_identity().get("Account", "unknown")
        
        collector = AWSInventoryCollector(client)
        raw_inventory = collector.collect_all()
        
        normalizer = AWSGraphNormalizer(region=active_region, account_id=account_id)
        nodes, edges = normalizer.normalize(raw_inventory)
        
        sync_engine = AWSGraphSync()
        sync_result = sync_engine.sync(nodes, edges)
        
        return SyncResponse(
            status="success",
            region=active_region,
            account_id=account_id,
            nodes_synced=sync_result.get("nodes_synced", 0),
            edges_synced=sync_result.get("edges_synced", 0),
            resource_counts=sync_result.get("resource_counts", {})
        )

    except Exception as e:
        logger.exception("AWS Sync Failed")
        raise HTTPException(status_code=500, detail=f"AWS Sync Failed: {str(e)}")
