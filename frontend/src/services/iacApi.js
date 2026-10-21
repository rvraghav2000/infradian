/**
 * iacApi.js — client for the IaC studio (/api/v1/iac) and live collaboration.
 * The acting user is sent as X-Infradian-User; the backend maps it to a role (RBAC).
 */
const BASE = '/api/v1/iac';
const USER_KEY = 'infradian.user';

export function getUser() {
    try { return localStorage.getItem(USER_KEY) || 'local'; } catch { return 'local'; }
}

export function setUser(name) {
    try { localStorage.setItem(USER_KEY, name || 'local'); } catch { /* storage blocked */ }
}

export function authHeaders(extra = {}) {
    return { 'X-Infradian-User': getUser(), ...extra };
}

async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
        const d = data?.detail;
        const msg = Array.isArray(d) ? d.map(x => `${(x.loc || []).slice(1).join('.')}: ${x.msg}`).join('; ') : d;
        throw new Error(msg || `${method} ${path} failed (${res.status})`);
    }
    return data;
}

/** Canvas nodes/edges → the backend graph contract (edges use source/target). */
export function toGraph(nodes, edges, iac = {}) {
    return {
        nodes: nodes.map(n => ({
            id: n.id, type: n.type, label: n.label, tf_name: n.tfName || undefined, parentId: n.parentId || n.parent_id || null,
            attributes: Object.fromEntries(Object.entries(n.attributes || {}).filter(([k]) => k !== 'spawnX' && k !== 'spawnY')),
        })),
        edges: edges.map(e => ({ id: e.id, source: e.source ?? e.source_id, target: e.target ?? e.target_id })),
        variables: (iac.variables || []).filter(v => !v.auto),
        outputs: iac.outputs || [],
        locals: iac.locals || {},
    };
}

export const iacApi = {
    catalog: () => call('/catalog'),
    me: () => call('/me'),
    generate: (graph, tool) => call('/generate', { method: 'POST', body: { graph, tool } }),
    parse: (files) => call('/parse', { method: 'POST', body: { files } }),
    importGit: (url, ref, subdir) => call('/import/git', { method: 'POST', body: { url, ref: ref || null, subdir: subdir || '' } }),
    analyze: (files) => call('/analyze', { method: 'POST', body: { files } }),
    checkov: (files) => call('/scan/checkov', { method: 'POST', body: { files } }),
    run: (action, workspace, files, tool, confirm = false) =>
        call('/run', { method: 'POST', body: { action, workspace, files, tool, confirm } }),
    gitCommit: (body) => call('/git/commit', { method: 'POST', body }),
    policies: () => call('/policies'),
    savePolicies: (p) => call('/policies', { method: 'PUT', body: p }),
    users: () => call('/users'),
    saveUsers: (u) => call('/users', { method: 'PUT', body: u }),
    comments: (ws) => call(`/workspaces/${encodeURIComponent(ws)}/comments`),
    addComment: (ws, node, text) => call(`/workspaces/${encodeURIComponent(ws)}/comments`, { method: 'POST', body: { node, text } }),
    templates: () => call('/templates'),
    template: (id) => call(`/templates/${encodeURIComponent(id)}`),
    saveTemplate: (body) => call('/templates', { method: 'POST', body }),
};

export function collabUrl(workspace) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/api/v1/collab/ws/${encodeURIComponent(workspace)}?user=${encodeURIComponent(getUser())}`;
}
