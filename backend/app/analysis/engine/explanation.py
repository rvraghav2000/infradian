"""
Deterministic template-based explanation generator.

No LLM — pure string construction from analysis results.
"""

from __future__ import annotations
from typing import Dict, Any, Optional


def explain_blast_radius(result: dict) -> str:
    """Generate a human-readable blast radius summary."""
    node_id = result.get("nodeId", "?")
    count = result.get("impactedNodeCount", 0)
    depth = result.get("maxDepth", 0)
    critical = result.get("criticalNodesAffected", 0)
    score = result.get("impactScore", 0)

    if count == 0:
        return f"{node_id} has no downstream dependencies — isolated node."

    severity = "Critical" if score > 70 else "Moderate" if score > 30 else "Low"
    parts = [f"{severity} blast radius: {count} node{'s' if count != 1 else ''} impacted across {depth} hop{'s' if depth != 1 else ''}."]

    if critical > 0:
        parts.append(f"{critical} critical infrastructure node{'s' if critical != 1 else ''} in blast zone.")

    confidence = result.get("confidence", {})
    if isinstance(confidence, dict):
        conf_val = confidence.get("overall", 1.0)
        if conf_val < 0.5:
            parts.append(f"Low analysis confidence ({conf_val:.0%}) — results should be validated.")

    return " ".join(parts)


def explain_safe_delete(decision: dict) -> str:
    """Generate a human-readable safe-delete summary."""
    node_id = decision.get("nodeId", "?")
    verdict = decision.get("decision", "UNCERTAIN")
    confidence = decision.get("confidence", 0)
    blockers = decision.get("blockerReasons", [])
    evidence = decision.get("evidenceReasons", [])

    if verdict == "SAFE_TO_DELETE":
        reasons = "; ".join(evidence[:3]) if evidence else "no blocking conditions found"
        return f"{node_id} is safe to delete ({confidence:.0%} confidence): {reasons}."

    if verdict == "UNSAFE_TO_DELETE":
        reasons = "; ".join(blockers[:3]) if blockers else "blocking conditions detected"
        return f"{node_id} cannot be safely deleted: {reasons}."

    # UNCERTAIN
    if confidence < 0.5:
        return f"{node_id} deletion status is uncertain — insufficient data confidence ({confidence:.0%})."
    return f"{node_id} deletion status is uncertain — evidence is inconclusive."


def explain_simulation(result: dict) -> str:
    """Generate a human-readable simulation summary."""
    node_id = result.get("nodeId", "?")
    broken = result.get("brokenNodes", [])
    degraded = result.get("degradedNodes", [])
    unaffected = result.get("unaffectedNodes", [])

    broken_count = len(broken)
    degraded_count = len(degraded)
    unaffected_count = len(unaffected)
    total = broken_count + degraded_count + unaffected_count

    if total == 0:
        return f"Removing {node_id} has no downstream impact — no dependent services found."

    parts = [f"Removing {node_id} would affect {total} node{'s' if total != 1 else ''}:"]

    if broken_count > 0:
        broken_ids = ", ".join(b["id"] for b in broken[:3])
        suffix = f" (+{broken_count - 3} more)" if broken_count > 3 else ""
        parts.append(f"{broken_count} broken ({broken_ids}{suffix})")

    if degraded_count > 0:
        degraded_ids = ", ".join(d["id"] for d in degraded[:3])
        suffix = f" (+{degraded_count - 3} more)" if degraded_count > 3 else ""
        parts.append(f"{degraded_count} degraded ({degraded_ids}{suffix})")

    if unaffected_count > 0:
        parts.append(f"{unaffected_count} unaffected (alternate routes available)")

    return " — ".join(parts) + "."


def explain_action(
    action_type: str,
    node_id: str,
    label: str,
    score: float,
    context: Dict[str, Any],
) -> str:
    """Generate a one-sentence explanation for a ranked action item."""
    if action_type == "risk":
        is_spof = context.get("is_spof", False)
        blast = context.get("blast_severity", 0)
        spof_note = " and is a single point of failure" if is_spof else ""
        severity = "high" if score > 0.7 else "moderate" if score > 0.3 else "low"
        return f"{label} ({node_id}) has {severity} risk (blast: {blast:.0%}){spof_note}."

    if action_type == "safe_delete":
        cost = context.get("monthly_cost", 0)
        evidence = context.get("evidence", [])
        reason = evidence[0] if evidence else "low utilization"
        cost_note = f" — saves ${cost:.0f}/mo" if cost > 0 else ""
        return f"{label} ({node_id}) can be safely removed: {reason}{cost_note}."

    if action_type == "waste":
        cost = context.get("monthly_cost", 0)
        usage = context.get("usage_score", 0)
        return f"{label} ({node_id}) is underutilized ({usage:.0%} usage) at ${cost:.0f}/mo."

    return f"{label} ({node_id}): score {score:.2f}."
