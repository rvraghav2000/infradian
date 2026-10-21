from fastapi import APIRouter, HTTPException, Path, Body, Depends
from app.iac.rbac import require
from pydantic import BaseModel, Field
import json
import os
import uuid
from typing import List, Dict, Any, Optional

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/workspaces"))
os.makedirs(WORKSPACE_DIR, exist_ok=True)

class WorkspaceMetadata(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""

class WorkspacePayload(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    draftNodes: List[Dict[str, Any]] = []
    draftEdges: List[Dict[str, Any]] = []
    ghostNodeIds: List[str] = []
    annotations: List[Dict[str, Any]] = []
    cloudFilter: Dict[str, bool] = {"aws": True, "azure": True, "gcp": True, "oci": True}
    iac: Dict[str, Any] = {}

@router.get("/", response_model=List[WorkspaceMetadata])
async def list_workspaces():
    workspaces = []
    for filename in os.listdir(WORKSPACE_DIR):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(WORKSPACE_DIR, filename), "r") as f:
                    data = json.load(f)
                    workspaces.append(WorkspaceMetadata(
                        id=data.get("id"),
                        name=data.get("name"),
                        description=data.get("description", "")
                    ))
            except Exception:
                pass
    return sorted(workspaces, key=lambda x: x.name)

@router.get("/{workspace_id}", response_model=WorkspacePayload)
async def get_workspace(workspace_id: str = Path(...)):
    filepath = os.path.join(WORKSPACE_DIR, f"{workspace_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    try:
        with open(filepath, "r") as f:
            data = json.load(f)
            return WorkspacePayload(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading workspace: {str(e)}")

@router.post("/", response_model=WorkspacePayload)
async def create_workspace(payload: WorkspacePayload, _=Depends(require("edit"))):
    if not payload.id:
        payload.id = str(uuid.uuid4())
    
    filepath = os.path.join(WORKSPACE_DIR, f"{payload.id}.json")
    try:
        with open(filepath, "w") as f:
            json.dump(payload.model_dump(), f, indent=2)
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving workspace: {str(e)}")

@router.put("/{workspace_id}", response_model=WorkspacePayload)
async def update_workspace(workspace_id: str, payload: WorkspacePayload, _=Depends(require("edit"))):
    payload.id = workspace_id
    filepath = os.path.join(WORKSPACE_DIR, f"{workspace_id}.json")
    
    # Allow creating if it doesn't exist, behaves like an upsert
    try:
        with open(filepath, "w") as f:
            json.dump(payload.model_dump(), f, indent=2)
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving workspace: {str(e)}")

@router.delete("/{workspace_id}")
async def delete_workspace(workspace_id: str, _=Depends(require("edit"))):
    filepath = os.path.join(WORKSPACE_DIR, f"{workspace_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    try:
        os.remove(filepath)
        return {"status": "success", "message": f"Workspace {workspace_id} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting workspace: {str(e)}")
