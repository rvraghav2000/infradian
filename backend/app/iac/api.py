"""HTTP API for the IaC studio: code generation, import, governance, deployment, collaboration."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from pydantic import BaseModel, Field

from . import collab, cost, gitsync, rbac, rules, runner
from .catalog import PROVIDERS, public_catalog
from .codegen import generate
from .parse import parse_files

router = APIRouter(prefix="/iac", tags=["IaC"])


class GraphIn(BaseModel):
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    variables: List[Dict[str, Any]] = []
    outputs: List[Dict[str, Any]] = []
    locals: Dict[str, Any] = {}


class GenerateReq(BaseModel):
    graph: GraphIn
    tool: str = "terraform"


class FilesReq(BaseModel):
    files: Dict[str, str]


class AnalyzeReq(BaseModel):
    files: Optional[Dict[str, str]] = None
    graph: Optional[GraphIn] = None
    tool: str = "terraform"


class RunReq(BaseModel):
    action: str
    workspace: str = "default"
    files: Dict[str, str]
    tool: str = "terraform"
    confirm: bool = False


class GitCommitReq(BaseModel):
    workspace: str = "default"
    files: Dict[str, str]
    message: str = "Update infrastructure"
    remote: Optional[str] = None
    branch: str = "main"
    push: bool = False


class GitImportReq(BaseModel):
    url: str
    ref: Optional[str] = None
    subdir: str = ""


def _files(req: AnalyzeReq) -> Dict[str, str]:
    if req.files is not None:
        return req.files
    if req.graph is not None:
        return generate(req.graph.model_dump(), req.tool)["files"]
    raise HTTPException(422, "provide files or graph")


@router.get("/catalog")
def catalog():
    return {"providers": {k: {"label": v["label"]} for k, v in PROVIDERS.items()}, "resources": public_catalog()}


@router.get("/me")
def me(ident: rbac.Identity = Depends(rbac.identity)):
    return {**ident.as_dict(), "apply_enabled": os.environ.get("INFRADIAN_ALLOW_APPLY") == "1"}


@router.post("/generate")
def generate_code(req: GenerateReq, _: rbac.Identity = Depends(rbac.require("view"))):
    if req.tool not in ("terraform", "opentofu"):
        raise HTTPException(422, "tool must be terraform or opentofu")
    return generate(req.graph.model_dump(), req.tool)


@router.post("/parse")
def parse_code(req: FilesReq, _: rbac.Identity = Depends(rbac.require("view"))):
    try:
        return parse_files(req.files)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.post("/import/git")
def import_git(req: GitImportReq, _: rbac.Identity = Depends(rbac.require("edit"))):
    try:
        files = gitsync.read_repo(req.url, req.ref, req.subdir)
        if not files:
            raise ValueError("no .tf files found in that repository path")
        return {**parse_files(files), "files": files}
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.post("/analyze")
def analyze(req: AnalyzeReq, _: rbac.Identity = Depends(rbac.require("view"))):
    files = _files(req)
    try:
        sec, pol, price = rules.security_scan(files), rules.evaluate_policies(files), cost.estimate(files)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"security": sec, "policy": pol, "cost": price,
            "blocking": [v for v in pol if v["enforcement"] == "deny"]}


@router.post("/scan/checkov")
def checkov(req: FilesReq, _: rbac.Identity = Depends(rbac.require("view"))):
    """Full Checkov rule set via Docker (slow, optional)."""
    with tempfile.TemporaryDirectory() as d:
        for n, c in req.files.items():
            open(os.path.join(d, os.path.basename(n)), "w").write(c)
        try:
            p = subprocess.run(["docker", "run", "--rm", "-v", f"{d}:/tf:ro", "bridgecrew/checkov:3", "-d", "/tf",
                                "--framework", "terraform", "-o", "json", "--quiet"],
                               capture_output=True, text=True, timeout=300)
        except (FileNotFoundError, subprocess.TimeoutExpired) as e:
            raise HTTPException(503, f"Checkov unavailable: {e}")
    try:
        data = json.loads(p.stdout or "{}")
    except ValueError:
        raise HTTPException(502, "Checkov returned no JSON: " + (p.stderr or "")[-300:])
    data = data[0] if isinstance(data, list) and data else data
    failed = (data.get("results") or {}).get("failed_checks", [])
    return {"engine": "checkov", "findings": [{"rule": c["check_id"], "severity": (c.get("severity") or "medium").lower(),
                                                "title": c["check_name"], "resource": c["resource"], "engine": "checkov",
                                                "fix": c.get("guideline") or ""} for c in failed]}


@router.post("/run")
def run_action(req: RunReq, ident: rbac.Identity = Depends(rbac.identity)):
    needed = "apply" if req.action == "apply" else "plan"
    if not rbac.can(ident.role, needed):
        raise HTTPException(403, f"'{ident.user}' ({ident.role}) lacks '{needed}' permission")
    return runner.run(req.action, req.workspace, req.files, req.tool, req.confirm)


@router.post("/git/commit")
def git_commit(req: GitCommitReq, ident: rbac.Identity = Depends(rbac.identity)):
    needed = "apply" if req.push else "edit"
    if not rbac.can(ident.role, needed):
        raise HTTPException(403, f"'{needed}' permission required")
    return gitsync.commit(req.workspace, req.files, req.message, req.remote, req.branch, req.push, ident.user)


# ── governance config ─────────────────────────────────────────────
@router.get("/policies")
def get_policies(_: rbac.Identity = Depends(rbac.require("view"))):
    return rules.load_policies()


@router.put("/policies")
def put_policies(policies: List[Dict[str, Any]], _: rbac.Identity = Depends(rbac.require("manage_policies"))):
    for p in policies:
        if p.get("operator") not in rules.OPS or not p.get("id") or not p.get("attribute"):
            raise HTTPException(422, f"invalid policy: {p.get('id')}")
    rules.save_policies(policies)
    return policies


# ── RBAC ──────────────────────────────────────────────────────────
@router.get("/users")
def get_users(_: rbac.Identity = Depends(rbac.require("manage_users"))):
    return {"roles": rbac.ROLES, "users": rbac._load()}


@router.put("/users")
def put_users(users: Dict[str, Dict[str, str]], ident: rbac.Identity = Depends(rbac.require("manage_users"))):
    for u, v in users.items():
        if v.get("role") not in rbac.ROLES:
            raise HTTPException(422, f"invalid role for {u}")
    if not any(v.get("role") == "admin" for v in users.values()) and os.environ.get("INFRADIAN_DEFAULT_ROLE", "admin") != "admin":
        raise HTTPException(422, "at least one admin is required")
    rbac.save_users(users)
    return users


# ── comments & templates ──────────────────────────────────────────
class CommentIn(BaseModel):
    node: Optional[str] = None
    text: str = Field(..., min_length=1, max_length=2000)


class TemplateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = ""
    graph: GraphIn
    tags: List[str] = []
    approved: bool = False


@router.get("/workspaces/{ws}/comments")
def comments(ws: str, _: rbac.Identity = Depends(rbac.require("view"))):
    return collab.list_comments(ws)


@router.post("/workspaces/{ws}/comments")
def post_comment(ws: str, body: CommentIn, ident: rbac.Identity = Depends(rbac.require("comment"))):
    return collab.add_comment(ws, ident.user, body.node, body.text)


@router.get("/templates")
def templates(_: rbac.Identity = Depends(rbac.require("view"))):
    return collab.list_templates()


@router.get("/templates/{tid}")
def template(tid: str, _: rbac.Identity = Depends(rbac.require("view"))):
    t = collab.get_template(tid)
    if not t:
        raise HTTPException(404, "template not found")
    return t


@router.post("/templates")
def new_template(body: TemplateIn, ident: rbac.Identity = Depends(rbac.require("template"))):
    approved = body.approved and rbac.can(ident.role, "manage_policies")  # only admins can approve
    return collab.save_template(body.name, body.description, body.graph.model_dump(), ident.user, body.tags, approved)


# ── websocket (mounted separately in main) ────────────────────────
async def collab_ws(ws: WebSocket, workspace: str):
    await collab.handle(ws, workspace, ws.query_params.get("user") or "anonymous")
