/**
 * cloudApi.js — Fetch wrappers for the Cloud Connections Management endpoints.
 */

const BASE = '/api/v1/cloud';

/**
 * Test a cloud connection without saving it.
 * Returns { valid, account_id, arn, error }
 */
export async function testConnection(payload) {
  const res = await fetch(`${BASE}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Test failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Save a new cloud integration.
 * Returns the created ConnectionOut object.
 */
export async function addConnection(payload) {
  const res = await fetch(`${BASE}/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Add connection failed: ${res.status}`);
  }
  return res.json();
}

/**
 * List all saved cloud integrations.
 * Returns ConnectionOut[]
 */
export async function listConnections() {
  const res = await fetch(`${BASE}/connections`);
  if (!res.ok) throw new Error(`List connections failed: ${res.status}`);
  return res.json();
}

/**
 * Trigger a sync for a specific connection.
 * Returns SyncResultOut
 */
export async function syncConnection(connectionId) {
  const res = await fetch(`${BASE}/connections/${encodeURIComponent(connectionId)}/sync`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Sync failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Delete a connection and cascade-delete its synced resources.
 */
export async function deleteConnection(connectionId) {
  const res = await fetch(`${BASE}/connections/${encodeURIComponent(connectionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Delete failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Auto-scaffold a new AWS connection using admin keys.
 * Returns the created ConnectionOut object.
 */
export async function bootstrapConnection({ alias, region, admin_access_key_id, admin_secret_access_key }) {
  const res = await fetch(`${BASE}/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias, region, admin_access_key_id, admin_secret_access_key }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Bootstrap failed: ${res.status}`);
  }
  return res.json();
}
