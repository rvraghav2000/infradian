import { useEffect, useRef, useState } from 'react';
import { collabUrl, getUser } from '../../services/iacApi';

/**
 * Live multiplayer for a workspace: presence + last-writer-wins graph sync.
 * Remote graphs are applied without echoing them back.
 */
export function useCollab({ workspaceId, draftData, setDraftData, iac, setIac }) {
    const [presence, setPresence] = useState([]);
    const [role, setRole] = useState(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const lastSync = useRef('');
    const roleRef = useRef(null);

    const snapshot = (d, i) => JSON.stringify({ nodes: d.nodes, edges: d.edges, iac: { tool: i.tool, outputs: i.outputs, locals: i.locals, variables: (i.variables || []).filter(v => !v.auto) } });

    useEffect(() => {
        let ws; let closed = false; let retry;
        const connect = () => {
            try { ws = new WebSocket(collabUrl(workspaceId || 'default')); } catch { return; }
            wsRef.current = ws;
            ws.onopen = () => setConnected(true);
            ws.onclose = () => { setConnected(false); setPresence([]); if (!closed) retry = setTimeout(connect, 4000); };
            ws.onmessage = (ev) => {
                const m = JSON.parse(ev.data);
                if (m.type === 'hello') {
                    setRole(m.role); roleRef.current = m.role; setPresence(m.presence);
                    if (m.snapshot) apply(m.snapshot);
                } else if (m.type === 'presence') setPresence(m.presence);
                else if (m.type === 'graph') apply(m.graph);
            };
        };
        const apply = (g) => {
            lastSync.current = JSON.stringify(g);
            setDraftData({ nodes: g.nodes || [], edges: g.edges || [] });
            if (g.iac) setIac(p => ({ ...p, ...g.iac }));
        };
        connect();
        return () => { closed = true; clearTimeout(retry); ws && ws.close(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId]);

    useEffect(() => {
        const s = snapshot(draftData, iac);
        if (s === lastSync.current) return;
        lastSync.current = s;
        const ws = wsRef.current;
        if (ws && ws.readyState === 1 && roleRef.current && roleRef.current !== 'viewer') {
            ws.send(JSON.stringify({ type: 'graph', graph: JSON.parse(s) }));
        }
    }, [draftData, iac.tool, iac.outputs, iac.locals, iac.variables]);

    const sendComment = (node, text) => wsRef.current?.readyState === 1 &&
        wsRef.current.send(JSON.stringify({ type: 'comment', node, text }));

    return { presence, role, connected, me: getUser(), sendComment };
}
