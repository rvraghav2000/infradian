#!/usr/bin/env python3
"""pod-doctor — find unhealthy pods and report on them (or restart them).

Detects: CrashLoopBackOff, ImagePullBackOff/ErrImagePull, OOMKilled (last state),
Pending/Failed pods, not-ready containers, and high restart counts.

  python tools/pod_doctor.py -n inventory                 # report only (default)
  python tools/pod_doctor.py -n inventory --restart       # delete unhealthy pods so
                                                          # their controller recreates them
  python tools/pod_doctor.py -A --json                    # machine-readable

Exit code: 0 healthy, 1 unhealthy pods found (useful in cron/CI).
Restarting is deliberately limited to controller-owned pods and skips causes a
restart cannot fix (image pull errors) — those are reported instead.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

RESTART_THRESHOLD = 5
NO_RESTART_REASONS = {"ImagePullBackOff", "ErrImagePull", "InvalidImageName"}


def diagnose(pod: dict) -> list[dict]:
    """Return a list of {reason, detail, restartable} problems for one pod."""
    problems: list[dict] = []
    status = pod.get("status", {})
    phase = status.get("phase")
    if phase in ("Failed", "Unknown"):
        problems.append({"reason": phase, "detail": status.get("message", ""), "restartable": True})
    elif phase == "Pending" and not status.get("containerStatuses"):
        cond = next((c for c in status.get("conditions", []) if c.get("status") == "False"), {})
        problems.append({"reason": "Pending", "detail": cond.get("message", "unscheduled"), "restartable": False})

    for cs in status.get("containerStatuses", []):
        name = cs.get("name", "?")
        waiting = cs.get("state", {}).get("waiting") or {}
        last_term = cs.get("lastState", {}).get("terminated") or {}
        reason = waiting.get("reason")
        if reason in ("CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull", "InvalidImageName", "CreateContainerConfigError"):
            problems.append({"reason": reason, "detail": f"{name}: {waiting.get('message', '')}".strip(),
                             "restartable": reason not in NO_RESTART_REASONS and reason != "CreateContainerConfigError"})
        elif last_term.get("reason") == "OOMKilled":
            problems.append({"reason": "OOMKilled", "detail": f"{name}: raise memory limit", "restartable": False})
        elif phase == "Running" and not cs.get("ready"):
            problems.append({"reason": "NotReady", "detail": name, "restartable": True})
        if cs.get("restartCount", 0) >= RESTART_THRESHOLD and not any(p["reason"] == "CrashLoopBackOff" for p in problems):
            problems.append({"reason": "HighRestarts", "detail": f"{name}: {cs['restartCount']} restarts", "restartable": False})
    return problems


def controller_owned(pod: dict) -> bool:
    return any(o.get("controller") for o in pod["metadata"].get("ownerReferences", []))


def kubectl(*args: str) -> str:
    return subprocess.run(["kubectl", *args], check=True, capture_output=True, text=True).stdout


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-n", "--namespace", default="default")
    ap.add_argument("-A", "--all-namespaces", action="store_true")
    ap.add_argument("--restart", action="store_true", help="delete restartable unhealthy pods")
    ap.add_argument("--dry-run", action="store_true", help="with --restart: show, don't delete")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    scope = ["-A"] if args.all_namespaces else ["-n", args.namespace]
    pods = json.loads(kubectl("get", "pods", *scope, "-o", "json"))["items"]

    report = []
    for pod in pods:
        problems = diagnose(pod)
        if not problems:
            continue
        meta = pod["metadata"]
        entry = {"namespace": meta["namespace"], "pod": meta["name"], "problems": problems, "action": "reported"}
        if args.restart and all(p["restartable"] for p in problems) and controller_owned(pod):
            if args.dry_run:
                entry["action"] = "would-restart"
            else:
                kubectl("delete", "pod", meta["name"], "-n", meta["namespace"])
                entry["action"] = "restarted"
        report.append(entry)

    if args.json:
        print(json.dumps({"checked": len(pods), "unhealthy": report}, indent=2))
    else:
        print(f"checked {len(pods)} pods — {len(report)} unhealthy")
        for e in report:
            print(f"\n[{e['action'].upper()}] {e['namespace']}/{e['pod']}")
            for p in e["problems"]:
                print(f"  - {p['reason']}: {p['detail']}")
    return 1 if report else 0


if __name__ == "__main__":
    sys.exit(main())
