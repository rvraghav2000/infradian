/**
 * analysisApi.js — Thin fetch wrappers for the v2 analysis engine endpoints.
 * Single source of truth for all analysis API calls.
 */

const BASE = '/api/v1/analysis/v2';

export async function fetchBlastRadius(nodeId, { maxDepth = 10, maxCost = 1000 } = {}) {
  const res = await fetch(`${BASE}/blast-radius/${encodeURIComponent(nodeId)}?max_depth=${maxDepth}&max_cost=${maxCost}`);
  if (!res.ok) throw new Error(`Blast radius failed: ${res.status}`);
  return res.json();
}

export async function fetchSafeDelete(nodeId) {
  const res = await fetch(`${BASE}/safe-delete/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error(`Safe delete failed: ${res.status}`);
  return res.json();
}

export async function fetchSimulateRemoval(nodeId) {
  const res = await fetch(`${BASE}/simulate-removal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  });
  if (!res.ok) throw new Error(`Simulation failed: ${res.status}`);
  return res.json();
}

export async function fetchTopActions(limit = 5) {
  const res = await fetch(`${BASE}/top-actions?limit=${limit}`);
  if (!res.ok) throw new Error(`Top actions failed: ${res.status}`);
  return res.json();
}


