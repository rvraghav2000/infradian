"""Role-based access control.

Roles (each includes the ones before it): viewer < editor < deployer < admin.
Identity comes from the `X-Infradian-User` header (or `?user=` on websockets) and is looked up in
data/rbac.json. NOTE: this is authorization without authentication — put the API behind an
auth proxy / SSO (which sets that header) before exposing it beyond a trusted network.
Unknown users get INFRADIAN_DEFAULT_ROLE (default: "admin", i.e. open for local development).
"""
from __future__ import annotations

import json
import os
from typing import Dict, Optional

from fastapi import Header, HTTPException

from .rules import DATA_DIR

RBAC_FILE = os.path.join(DATA_DIR, "rbac.json")
ROLES = ["viewer", "editor", "deployer", "admin"]
PERMISSIONS = {
    "viewer": ["view"],
    "editor": ["view", "edit", "comment", "template"],
    "deployer": ["view", "edit", "comment", "template", "plan", "apply"],
    "admin": ["view", "edit", "comment", "template", "plan", "apply", "manage_users", "manage_policies"],
}


def _load() -> Dict[str, Dict[str, str]]:
    try:
        with open(RBAC_FILE) as f:
            return json.load(f).get("users", {})
    except (OSError, ValueError):
        return {}


def save_users(users: Dict[str, Dict[str, str]]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(RBAC_FILE, "w") as f:
        json.dump({"users": users}, f, indent=2)


def role_of(user: Optional[str]) -> str:
    users = _load()
    if user and user in users and users[user].get("role") in ROLES:
        return users[user]["role"]
    default = os.environ.get("INFRADIAN_DEFAULT_ROLE", "admin")
    return default if default in ROLES else "viewer"


def can(role: str, permission: str) -> bool:
    return permission in PERMISSIONS.get(role, [])


class Identity:
    def __init__(self, user: str, role: str):
        self.user, self.role = user, role

    def as_dict(self):
        return {"user": self.user, "role": self.role, "permissions": PERMISSIONS[self.role]}


def identity(x_infradian_user: Optional[str] = Header(default=None)) -> Identity:
    user = x_infradian_user or "local"
    return Identity(user, role_of(user))


def require(permission: str):
    def dep(x_infradian_user: Optional[str] = Header(default=None)) -> Identity:
        ident = identity(x_infradian_user)
        if not can(ident.role, permission):
            raise HTTPException(403, f"'{ident.user}' is a {ident.role}; '{permission}' permission required")
        return ident
    return dep
