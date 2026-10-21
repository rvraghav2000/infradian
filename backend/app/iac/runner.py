"""Run Terraform/OpenTofu from the platform — in Docker, so no local CLI is needed.

Actions: init, validate, plan, apply.  There is deliberately NO destroy action.
`apply` only applies a saved plan, is blocked by policy denials, and is disabled unless
INFRADIAN_ALLOW_APPLY=1 is set on the server. Cloud credentials are forwarded from the
server's environment (AWS_*, ARM_*, GOOGLE_*, OCI_*) — never from the browser.
"""
from __future__ import annotations

import os
import re
import subprocess
from typing import Any, Dict, List

from .rules import DATA_DIR, evaluate_policies

IAC_DIR = os.path.join(DATA_DIR, "iac")
IMAGES = {"terraform": "hashicorp/terraform:1.10", "opentofu": "ghcr.io/opentofu/opentofu:1.9"}
CRED_ENV = re.compile(r"^(AWS_|ARM_|AZURE_|GOOGLE_|GCP_|OCI_|TF_VAR_)")
ALLOWED = {"init", "validate", "plan", "apply"}


def workspace_dir(workspace: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", workspace or "default")[:64]
    d = os.path.join(IAC_DIR, safe)
    os.makedirs(d, exist_ok=True)
    return d


def write_files(workspace: str, files: Dict[str, str]) -> str:
    d = workspace_dir(workspace)
    for old in os.listdir(d):  # keep the dir in sync with the canvas
        if old.endswith(".tf"):
            os.remove(os.path.join(d, old))
    for name, content in files.items():
        with open(os.path.join(d, os.path.basename(name)), "w") as f:
            f.write(content)
    return d


def _docker(tool: str, d: str, args: List[str], timeout: int = 600) -> Dict[str, Any]:
    env_flags: List[str] = []
    for k in os.environ:
        if CRED_ENV.match(k):
            env_flags += ["-e", k]
    cmd = ["docker", "run", "--rm", "-v", f"{d}:/work", "-w", "/work", "-e", "TF_IN_AUTOMATION=1",
           "-e", "TF_CLI_ARGS=-no-color", *env_flags, IMAGES[tool], *args]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=os.environ)
    except FileNotFoundError:
        return {"ok": False, "exit_code": 127, "output": "Docker CLI not found on the API host."}
    except subprocess.TimeoutExpired:
        return {"ok": False, "exit_code": 124, "output": f"timed out after {timeout}s"}
    return {"ok": p.returncode == 0, "exit_code": p.returncode, "output": (p.stdout + p.stderr)[-20000:]}


def run(action: str, workspace: str, files: Dict[str, str], tool: str = "terraform", confirm: bool = False) -> Dict[str, Any]:
    if action not in ALLOWED:
        return {"ok": False, "exit_code": 2, "output": f"'{action}' is not supported (destroy is intentionally unavailable)."}
    if tool not in IMAGES:
        return {"ok": False, "exit_code": 2, "output": f"unknown tool '{tool}'"}
    d = write_files(workspace, files)

    if action == "apply":
        if os.environ.get("INFRADIAN_ALLOW_APPLY") != "1":
            return {"ok": False, "exit_code": 3, "output": "apply is disabled on this server (set INFRADIAN_ALLOW_APPLY=1)."}
        if not confirm:
            return {"ok": False, "exit_code": 3, "output": "apply requires explicit confirmation."}
        denied = [v for v in evaluate_policies(files) if v["enforcement"] == "deny"]
        if denied:
            return {"ok": False, "exit_code": 4, "output": "blocked by policy:\n" + "\n".join(
                f'  {v["policy"]} {v["resource"]}: {v["description"]}' for v in denied), "policy_violations": denied}
        if not os.path.exists(os.path.join(d, "tfplan")):
            return {"ok": False, "exit_code": 3, "output": "no saved plan — run plan first."}
        return _docker(tool, d, ["apply", "-input=false", "tfplan"])

    init_args = ["init", "-input=false"] + (["-backend=false"] if action == "validate" else [])
    base = _docker(tool, d, init_args)
    if action == "init" or not base["ok"]:
        return base
    if action == "validate":
        return _docker(tool, d, ["validate"])
    result = _docker(tool, d, ["plan", "-input=false", "-out=tfplan", "-lock-timeout=30s"])
    result["policy_violations"] = evaluate_policies(files)
    return result
