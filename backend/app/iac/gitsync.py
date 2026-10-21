"""Git integration: commit generated code into a per-workspace repo, optionally push, and import a repo.

Provider-agnostic (GitHub, GitLab, Bitbucket, Azure DevOps all speak git over https/ssh).
Pushing uses whatever credentials the API host's git is already configured with; it only
happens when the caller explicitly asks (`push: true`) and has the `apply`-level role.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional

from .runner import workspace_dir, write_files

MAX_FILES, MAX_BYTES = 200, 512 * 1024
URL_RE = re.compile(r"^(https://|ssh://|git@)[\w.@:/~+-]+$")


def _git(d: str, *args: str, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", d, *args], capture_output=True, text=True, timeout=timeout,
                          env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})


def commit(workspace: str, files: Dict[str, str], message: str, remote: Optional[str] = None,
           branch: str = "main", push: bool = False, author: str = "infradian") -> Dict[str, Any]:
    d = write_files(workspace, files)
    if not os.path.isdir(os.path.join(d, ".git")):
        _git(d, "init", "-b", branch)
    with open(os.path.join(d, ".gitignore"), "w") as f:
        f.write(".terraform/\n*.tfstate\n*.tfstate.backup\ntfplan\n*.tfvars\n")
    _git(d, "add", "-A")
    c = _git(d, "-c", f"user.name={author}", "-c", "user.email=infradian@local", "commit", "-m", message or "Update infrastructure")
    committed = c.returncode == 0
    sha = _git(d, "rev-parse", "--short", "HEAD").stdout.strip()
    out: Dict[str, Any] = {"committed": committed, "sha": sha, "output": (c.stdout + c.stderr).strip()[-500:], "pushed": False}
    if push:
        if not remote or not URL_RE.match(remote):
            out["output"] += "\npush skipped: a valid https/ssh remote URL is required"
            return out
        _git(d, "remote", "remove", "origin")
        _git(d, "remote", "add", "origin", remote)
        p = _git(d, "push", "-u", "origin", branch, timeout=180)
        out["pushed"] = p.returncode == 0
        out["output"] += "\n" + (p.stdout + p.stderr).strip()[-500:]
    return out


def read_repo(url: str, ref: Optional[str] = None, subdir: str = "") -> Dict[str, str]:
    """Shallow-clone a repo and return its .tf files (read-only — nothing is executed)."""
    if not URL_RE.match(url) or url.startswith("-"):
        raise ValueError("repository URL must be https://, ssh:// or git@host:path")
    tmp = tempfile.mkdtemp(prefix="infradian-import-")
    try:
        args = ["clone", "--depth", "1", "--single-branch"] + (["--branch", ref] if ref else []) + ["--", url, tmp + "/repo"]
        p = subprocess.run(["git", *args], capture_output=True, text=True, timeout=180,
                           env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
        if p.returncode != 0:
            raise ValueError("git clone failed: " + p.stderr.strip()[-300:])
        root = os.path.realpath(os.path.join(tmp, "repo", subdir.strip("/")))
        if not root.startswith(os.path.realpath(tmp)):
            raise ValueError("invalid subdirectory")
        files: Dict[str, str] = {}
        for dirpath, dirs, names in os.walk(root):
            dirs[:] = [x for x in dirs if x not in (".git", ".terraform")]
            for n in names:
                fp = os.path.join(dirpath, n)
                if n.endswith((".tf", ".tofu")) and not os.path.islink(fp) and os.path.getsize(fp) <= MAX_BYTES:
                    files[os.path.relpath(fp, root)] = open(fp, errors="replace").read()
                if len(files) >= MAX_FILES:
                    return files
        return files
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
