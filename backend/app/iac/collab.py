"""Live multiplayer: presence, graph sync, comments and the template catalog.

Rooms are per-workspace, kept in memory (single API process). Graph edits are last-writer-wins
operations broadcast to everyone else; viewers can watch but their edits are rejected.
Comments and templates persist as JSON under data/.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket

from .rbac import can, role_of
from .rules import DATA_DIR

COMMENTS_DIR = os.path.join(DATA_DIR, "comments")
TEMPLATES_DIR = os.path.join(DATA_DIR, "templates")

COLORS = ["#007AFF", "#34C759", "#FF9500", "#AF52DE", "#FF3B30", "#5AC8FA", "#FFCC00"]


class Room:
    def __init__(self) -> None:
        self.clients: Dict[WebSocket, Dict[str, Any]] = {}
        self.snapshot: Optional[Dict[str, Any]] = None
        self.version = 0

    def presence(self) -> List[Dict[str, Any]]:
        return [{"user": c["user"], "role": c["role"], "color": c["color"], "cursor": c.get("cursor"),
                 "selected": c.get("selected")} for c in self.clients.values()]


ROOMS: Dict[str, Room] = {}


async def _broadcast(room: Room, msg: Dict[str, Any], exclude: Optional[WebSocket] = None) -> None:
    dead = []
    for ws in room.clients:
        if ws is exclude:
            continue
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(ws)
    for ws in dead:
        room.clients.pop(ws, None)


async def handle(ws: WebSocket, workspace: str, user: str) -> None:
    await ws.accept()
    room = ROOMS.setdefault(workspace, Room())
    role = role_of(user)
    room.clients[ws] = {"user": user, "role": role, "color": COLORS[len(room.clients) % len(COLORS)]}
    await ws.send_text(json.dumps({"type": "hello", "you": user, "role": role, "version": room.version,
                                   "snapshot": room.snapshot, "presence": room.presence()}))
    await _broadcast(room, {"type": "presence", "presence": room.presence()})
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            kind = msg.get("type")
            if kind == "cursor":
                room.clients[ws]["cursor"] = msg.get("pos")
                room.clients[ws]["selected"] = msg.get("selected")
                await _broadcast(room, {"type": "presence", "presence": room.presence()}, exclude=ws)
            elif kind == "graph":
                if not can(role, "edit"):
                    await ws.send_text(json.dumps({"type": "error", "message": "viewers cannot edit"}))
                    continue
                room.version += 1
                room.snapshot = msg.get("graph")
                await _broadcast(room, {"type": "graph", "graph": room.snapshot, "by": user, "version": room.version}, exclude=ws)
                await ws.send_text(json.dumps({"type": "ack", "version": room.version}))
            elif kind == "comment" and can(role, "comment"):
                c = add_comment(workspace, user, msg.get("node"), msg.get("text", ""))
                await _broadcast(room, {"type": "comment", "comment": c})
    except Exception:
        pass
    finally:
        room.clients.pop(ws, None)
        await _broadcast(room, {"type": "presence", "presence": room.presence()})
        if not room.clients:
            ROOMS.pop(workspace, None)


# ── comments ──────────────────────────────────────────────────────
def _cfile(workspace: str) -> str:
    os.makedirs(COMMENTS_DIR, exist_ok=True)
    return os.path.join(COMMENTS_DIR, "".join(ch for ch in workspace if ch.isalnum() or ch in "-_")[:64] + ".json")


def list_comments(workspace: str) -> List[Dict[str, Any]]:
    try:
        with open(_cfile(workspace)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def add_comment(workspace: str, user: str, node: Optional[str], text: str) -> Dict[str, Any]:
    c = {"id": uuid.uuid4().hex[:8], "user": user, "node": node, "text": text[:2000], "at": int(time.time())}
    items = list_comments(workspace) + [c]
    with open(_cfile(workspace), "w") as f:
        json.dump(items, f)
    return c


# ── templates ─────────────────────────────────────────────────────
def _tfile(tid: str) -> str:
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    return os.path.join(TEMPLATES_DIR, "".join(ch for ch in tid if ch.isalnum() or ch in "-_")[:64] + ".json")


def list_templates() -> List[Dict[str, Any]]:
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    out = []
    for n in sorted(os.listdir(TEMPLATES_DIR)):
        if n.endswith(".json"):
            try:
                t = json.load(open(os.path.join(TEMPLATES_DIR, n)))
                out.append({k: t[k] for k in ("id", "name", "description", "author", "tags", "approved") if k in t}
                           | {"nodes": len(t.get("graph", {}).get("nodes", []))})
            except (OSError, ValueError):
                pass
    return out


def save_template(name: str, description: str, graph: Dict[str, Any], author: str, tags: List[str], approved: bool) -> Dict[str, Any]:
    tid = "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")[:48] or uuid.uuid4().hex[:8]
    t = {"id": tid, "name": name, "description": description, "author": author, "tags": tags, "approved": approved, "graph": graph}
    with open(_tfile(tid), "w") as f:
        json.dump(t, f, indent=2)
    return t


def get_template(tid: str) -> Optional[Dict[str, Any]]:
    try:
        with open(_tfile(tid)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None
