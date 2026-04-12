const API_BASE = '/api/v1/workspaces';

export const workspaceApi = {
    // List all available workspaces
    list: async () => {
        const res = await fetch(`${API_BASE}/`);
        if (!res.ok) throw new Error('Failed to fetch workspaces');
        return await res.json();
    },

    // Get a specific workspace
    get: async (id) => {
        const res = await fetch(`${API_BASE}/${id}`);
        if (!res.ok) throw new Error('Failed to fetch workspace');
        return await res.json();
    },

    // Create a new workspace
    create: async (payload) => {
        const res = await fetch(`${API_BASE}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create workspace');
        return await res.json();
    },

    // Update an existing workspace
    update: async (id, payload) => {
        const res = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update workspace');
        return await res.json();
    },

    // Delete a workspace
    delete: async (id) => {
        const res = await fetch(`${API_BASE}/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete workspace');
        return await res.json();
    }
};
