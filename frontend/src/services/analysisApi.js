/**
 * analysisApi.js — Thin fetch wrappers for the v2 analysis engine endpoints.
 * Single source of truth for all analysis API calls.
 */

const BASE = '/api/v1/analysis/v2';

/**
 * Common helper for POSTing to analysis endpoints with optional simulation context.
 */
async function postAnalysis(endpoint, nodeId, draftGraph = null, extra = {}) {
  const body = {
    nodeId,
    simulation: draftGraph ? {
      nodes: draftGraph.nodes || [],
      edges: draftGraph.edges || []
    } : null,
    ...extra
  };

  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Analysis failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchBlastRadius(nodeId, draftGraph = null, { maxDepth = 10, maxCost = 1000 } = {}) {
  return postAnalysis('/blast-radius', nodeId, draftGraph, { maxDepth, maxCost });
}

export async function fetchSafeDelete(nodeId, draftGraph = null) {
  return postAnalysis('/safe-delete', nodeId, draftGraph);
}

export async function fetchSimulateRemoval(nodeId, draftGraph = null) {
  return postAnalysis('/simulate-removal', nodeId, draftGraph);
}

export async function fetchTopActions(limit = 5, draftGraph = null) {
  return postAnalysis('/top-actions', '', draftGraph, { maxDepth: limit }); // Reusing maxDepth as limit
}



