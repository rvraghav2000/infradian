/**
 * uimApi.js — Fetch wrappers for the UIM (Unified Infrastructure Model) endpoints.
 * Handles validation, readiness, diff, simulate, and planned actions.
 */

const BASE = '/api/v1/uim';

/**
 * Helper for POSTing JSON to UIM endpoints.
 */
async function postUIM(endpoint, body = {}) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `UIM request failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Build simulation context from draft state.
 */
function buildSimulationCtx(draftNodes = [], draftEdges = []) {
  if (!draftNodes.length && !draftEdges.length) return null;
  return {
    nodes: draftNodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label || n.name || n.id,
      status: n.status || 'planned',
      parent_id: n.parent_id || n.parentId,
      current_load: n.metrics?.current_load || 0.0,
      environment: n.environment || 'production',
      criticality: n.criticality || 'medium',
      monthly_cost: n.monthly_cost || 0,
      layer: n.layer || null,
      tags: n.tags || {},
    })),
    edges: draftEdges.map(e => ({
      id: e.id,
      source: e.source || e.source_id,
      target: e.target || e.target_id,
      label: e.label || 'DEPENDS_ON',
      dependency_mode: e.dependency_mode || 'sync',
      confidence: e.confidence || 1.0,
      traffic_share: e.traffic_share || 1.0,
      interaction_type: e.interaction_type || 'runtime_call',
      primary: e.primary !== false,
      inferred: e.inferred || false,
    })),
  };
}

/**
 * Run architecture validation on current + draft graph.
 */
export async function fetchValidation(draftNodes = [], draftEdges = []) {
  return postUIM('/validate', {
    simulation: buildSimulationCtx(draftNodes, draftEdges),
  });
}

/**
 * Compute readiness/completeness scores.
 */
export async function fetchReadiness(draftNodes = [], draftEdges = []) {
  return postUIM('/readiness', {
    simulation: buildSimulationCtx(draftNodes, draftEdges),
  });
}

/**
 * Compute diff between current and proposed graph.
 */
export async function fetchDiff(proposedNodes, proposedEdges, draftNodes = [], draftEdges = []) {
  return postUIM('/diff', {
    proposed: {
      nodes: proposedNodes.map(n => ({
        id: n.id, type: n.type, label: n.label || n.id,
        status: n.status || 'planned',
        parent_id: n.parent_id || n.parentId,
      })),
      edges: proposedEdges.map(e => ({
        id: e.id, source: e.source || e.source_id, target: e.target || e.target_id,
        label: e.label || 'DEPENDS_ON',
      })),
    },
    simulation: buildSimulationCtx(draftNodes, draftEdges),
  });
}

/**
 * Simulate mutations (add/remove) and get impact analysis.
 */
export async function fetchSimulateMutations({
  addNodes = [], removeNodeIds = [], addEdges = [],
  draftNodes = [], draftEdges = [],
} = {}) {
  return postUIM('/simulate', {
    add_nodes: addNodes.map(n => ({
      id: n.id, type: n.type, label: n.label || n.id,
      status: 'planned', parent_id: n.parent_id || n.parentId,
    })),
    remove_node_ids: removeNodeIds,
    add_edges: addEdges.map(e => ({
      id: e.id, source: e.source || e.source_id, target: e.target || e.target_id,
      label: e.label || 'DEPENDS_ON',
    })),
    simulation: buildSimulationCtx(draftNodes, draftEdges),
  });
}

/**
 * Get top actions including planned insights.
 */
export async function fetchUIMActions(limit = 5, draftNodes = [], draftEdges = []) {
  return postUIM('/actions', {
    limit,
    simulation: buildSimulationCtx(draftNodes, draftEdges),
  });
}
