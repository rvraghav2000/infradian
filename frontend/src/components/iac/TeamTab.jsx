import { useCallback, useEffect, useState } from 'react';
import { iacApi, getUser, setUser, toGraph } from '../../services/iacApi';
import { Btn, Chip, Field, Section, useTokens } from './ui';

const ROLE_COLOR = { viewer: '#8E8E93', editor: '#007AFF', deployer: '#FF9500', admin: '#AF52DE' };

export default function TeamTab({ theme, collab, me, draftData, setDraftData, iac, setIac, workspaceId, focusedNodeId, canEdit, canTemplate, isAdmin }) {
    const t = useTokens(theme);
    const [name, setName] = useState(getUser());
    const [comments, setComments] = useState([]);
    const [text, setText] = useState('');
    const [templates, setTemplates] = useState([]);
    const [tpl, setTpl] = useState({ name: '', description: '' });
    const [users, setUsers] = useState(null);
    const [newUser, setNewUser] = useState({ name: '', role: 'editor' });
    const [msg, setMsg] = useState('');

    const loadComments = useCallback(() => iacApi.comments(workspaceId).then(setComments).catch(() => {}), [workspaceId]);
    const loadTemplates = useCallback(() => iacApi.templates().then(setTemplates).catch(() => {}), []);
    useEffect(() => { loadComments(); loadTemplates(); }, [loadComments, loadTemplates]);
    useEffect(() => { if (isAdmin) iacApi.users().then(setUsers).catch(() => {}); }, [isAdmin]);

    const post = async () => {
        if (!text.trim()) return;
        try { await iacApi.addComment(workspaceId, focusedNodeId || null, text); setText(''); loadComments(); }
        catch (e) { setMsg(e.message); }
    };

    const saveTemplate = async () => {
        try {
            await iacApi.saveTemplate({ name: tpl.name, description: tpl.description, graph: toGraph(draftData.nodes, draftData.edges, iac), tags: [], approved: false });
            setTpl({ name: '', description: '' }); setMsg('Template saved.'); loadTemplates();
        } catch (e) { setMsg(e.message); }
    };

    const useTemplate = async (id) => {
        if (draftData.nodes.length && !window.confirm('Replace the current draft with this template?')) return;
        try {
            const full = await iacApi.template(id);
            const g = full.graph;
            const idOf = (x) => (String(x).startsWith('planned-') ? x : `planned-${x}`);
            setDraftData({
                nodes: g.nodes.map(n => ({ ...n, id: idOf(n.id), parentId: n.parentId ? idOf(n.parentId) : null, parent_id: n.parentId ? idOf(n.parentId) : null,
                    status: 'planned', metrics: { current_load: 0 }, history: [] })),
                edges: g.edges.map(e => ({ id: `planned-edge-${idOf(e.source)}-${idOf(e.target)}`, source: idOf(e.source), target: idOf(e.target),
                    source_id: idOf(e.source), target_id: idOf(e.target), label: 'DEPENDS_ON', dependency_mode: 'sync',
                    interaction_type: 'runtime_call', primary: true, confidence: 1, traffic_share: 1 })),
            });
            setIac(p => ({ ...p, variables: g.variables || [], outputs: g.outputs || [], locals: g.locals || {} }));
            setMsg(`Loaded “${full.name}”.`);
        } catch (e) { setMsg(e.message); }
    };

    const saveUsers = async (next) => {
        try { await iacApi.saveUsers(next); setUsers(u => ({ ...u, users: next })); } catch (e) { setMsg(e.message); }
    };

    const nodeComments = comments.filter(c => !focusedNodeId || c.node === focusedNodeId);

    return (
        <div style={{ overflowY: 'auto', height: '100%' }}>
            <Section t={t} title="You">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Field t={t} value={name} onChange={setName} placeholder="user name" style={{ width: 130 }} />
                    <Btn t={t} onClick={() => { setUser(name.trim() || 'local'); window.location.reload(); }}>Switch user</Btn>
                    {me && <Chip color={ROLE_COLOR[me.role]}>{me.role}</Chip>}
                    <Chip color={collab.connected ? t.ok : t.bad}>{collab.connected ? 'live' : 'offline'}</Chip>
                </div>
                <div style={{ fontSize: 10, color: t.sub, marginTop: 4 }}>
                    Identity is a header the API trusts — put it behind your SSO/auth proxy before sharing beyond a trusted network.
                </div>
            </Section>

            <Section t={t} title={`Online now (${collab.presence.length})`}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {collab.presence.map((p, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: `${p.color}1c`, border: `1px solid ${p.color}50`, fontSize: 12, color: t.text }}>
                            <span style={{ width: 8, height: 8, borderRadius: 99, background: p.color }} />{p.user}<span style={{ color: t.sub, fontSize: 10 }}>{p.role}</span>
                        </span>
                    ))}
                    {collab.presence.length === 0 && <span style={{ fontSize: 12, color: t.sub }}>Open this workspace in another window (different user) to design together.</span>}
                </div>
            </Section>

            <Section t={t} title={focusedNodeId ? 'Comments on selected node' : 'Comments'}>
                {nodeComments.map(c => (
                    <div key={c.id} style={{ fontSize: 12, padding: '6px 8px', marginBottom: 3, borderRadius: 8, background: t.card, border: `1px solid ${t.border}`, color: t.text }}>
                        <b>{c.user}</b> <span style={{ color: t.sub, fontSize: 10 }}>{new Date(c.at * 1000).toLocaleString()}{c.node ? ` · ${c.node}` : ''}</span>
                        <div>{c.text}</div>
                    </div>
                ))}
                {nodeComments.length === 0 && <div style={{ fontSize: 12, color: t.sub }}>No comments yet.</div>}
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <Field t={t} value={text} onChange={setText} placeholder="Add a comment…" style={{ flex: 1 }} disabled={!canEdit} />
                    <Btn t={t} onClick={post} disabled={!canEdit || !text.trim()}>Post</Btn>
                </div>
            </Section>

            <Section t={t} title="Architecture templates">
                {templates.map(x => (
                    <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', marginBottom: 3, borderRadius: 8, background: t.card, border: `1px solid ${t.border}`, fontSize: 12, color: t.text }}>
                        <span style={{ flex: 1 }}>{x.name}<div style={{ color: t.sub, fontSize: 10 }}>{x.nodes} resources · {x.author}{x.description ? ` · ${x.description}` : ''}</div></span>
                        {x.approved && <Chip color={t.ok}>approved</Chip>}
                        <Btn t={t} onClick={() => useTemplate(x.id)} disabled={!canEdit}>Use</Btn>
                    </div>
                ))}
                {templates.length === 0 && <div style={{ fontSize: 12, color: t.sub }}>No templates yet.</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 4, marginTop: 4 }}>
                    <Field t={t} value={tpl.name} onChange={x => setTpl(v => ({ ...v, name: x }))} placeholder="name" disabled={!canTemplate} />
                    <Field t={t} value={tpl.description} onChange={x => setTpl(v => ({ ...v, description: x }))} placeholder="description" disabled={!canTemplate} />
                    <Btn t={t} onClick={saveTemplate} disabled={!canTemplate || !tpl.name.trim() || !draftData.nodes.length}>Save current</Btn>
                </div>
            </Section>

            {isAdmin && users && (
                <Section t={t} title="Access control (RBAC)">
                    {Object.entries(users.users).map(([u, v]) => (
                        <div key={u} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, fontSize: 12, color: t.text }}>
                            <span style={{ flex: 1 }}>{u}</span>
                            <select value={v.role} onChange={e => saveUsers({ ...users.users, [u]: { role: e.target.value } })}
                                style={{ padding: 4, borderRadius: 6, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 12 }}>
                                {users.roles.map(r => <option key={r}>{r}</option>)}
                            </select>
                            <button onClick={() => { const n = { ...users.users }; delete n[u]; saveUsers(n); }} style={{ border: 0, background: 'transparent', color: t.bad, cursor: 'pointer' }}>✕</button>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <Field t={t} value={newUser.name} onChange={x => setNewUser(n => ({ ...n, name: x }))} placeholder="user name" style={{ flex: 1 }} />
                        <select value={newUser.role} onChange={e => setNewUser(n => ({ ...n, role: e.target.value }))}
                            style={{ padding: 4, borderRadius: 6, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 12 }}>
                            {users.roles.map(r => <option key={r}>{r}</option>)}
                        </select>
                        <Btn t={t} disabled={!newUser.name.trim()} onClick={() => { saveUsers({ ...users.users, [newUser.name.trim()]: { role: newUser.role } }); setNewUser({ name: '', role: 'editor' }); }}>Add</Btn>
                    </div>
                    <div style={{ fontSize: 10, color: t.sub, marginTop: 4 }}>viewer: look · editor: design · deployer: plan/apply/push · admin: users &amp; policies. Unlisted users get the server default role.</div>
                </Section>
            )}
            {msg && <div style={{ fontSize: 11, color: t.sub }}>{msg}</div>}
        </div>
    );
}
