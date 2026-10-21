import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysis } from '../../context/AnalysisContext';
import { iacApi } from '../../services/iacApi';
import { useIacSync } from './useIacSync';
import { useCollab } from './useCollab';
import CodeTab from './CodeTab';
import VarsTab from './VarsTab';
import GovernanceTab from './GovernanceTab';
import DeployTab from './DeployTab';
import TeamTab from './TeamTab';
import { Btn, Chip, useTokens } from './ui';

const TABS = [
    ['code', '</> Code'],
    ['vars', 'Variables'],
    ['gov', 'Governance'],
    ['deploy', 'Deploy'],
    ['team', 'Team'],
];

/**
 * IacStudio — the Brainboard-style code/governance/deploy/collaboration drawer.
 * Always mounted (so presence and live graph sync keep working); `open` only toggles the UI.
 */
export default function IacStudio({ open, onClose, theme, liveNodes, liveEdges, focusedNodeId, onFocusNode }) {
    const t = useTokens(theme);
    const { draftData, setDraftData, iac, setIac, activeWorkspace } = useAnalysis();
    const workspaceId = activeWorkspace?.id || 'default';
    const [tab, setTab] = useState('code');
    const [me, setMe] = useState(null);
    const [notice, setNotice] = useState('');

    useEffect(() => { iacApi.me().then(setMe).catch(() => setMe(null)); }, []);

    const sync = useIacSync({ draftData, setDraftData, iac, setIac, enabled: true });
    const collab = useCollab({ workspaceId, draftData, setDraftData, iac, setIac });

    const perms = useMemo(() => new Set(me?.permissions || []), [me]);
    const canEdit = !me || perms.has('edit');

    const importLive = () => {
        const n = sync.importLive(liveNodes, liveEdges);
        setNotice(n ? `Copied ${n} discovered resources into the draft.` : 'No discovered resources have a Terraform generator.');
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.aside
                    key="iac-studio"
                    initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{
                        position: 'fixed', top: 112, right: 12, bottom: 12, width: 'min(560px, calc(100vw - 24px))', zIndex: 70,
                        display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 16,
                        background: t.bg, color: t.text, border: `1px solid ${t.border}`,
                        backdropFilter: 'blur(24px) saturate(1.6)', WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                        boxShadow: '0 12px 48px rgba(0,0,0,0.25)', fontFamily: 'Inter, -apple-system, sans-serif',
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>IaC Studio</div>
                        {me && <Chip color={t.accent}>{me.role}</Chip>}
                        <div style={{ display: 'flex', marginLeft: 4 }}>
                            {collab.presence.slice(0, 5).map((p, i) => (
                                <span key={i} title={`${p.user} (${p.role})`} style={{
                                    width: 22, height: 22, borderRadius: 99, background: p.color, color: '#fff', fontSize: 10, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: i ? -6 : 0, border: `2px solid ${t.bg}`,
                                }}>{p.user.slice(0, 1).toUpperCase()}</span>
                            ))}
                        </div>
                        <div style={{ flex: 1 }} />
                        <Btn t={t} onClick={importLive} title="Copy discovered/live resources into the draft to generate code for them">Import live infra</Btn>
                        <button onClick={onClose} style={{ border: 0, background: 'transparent', color: t.sub, cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    {notice && <div style={{ fontSize: 11, color: t.sub }}>{notice}</div>}

                    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${t.border}`, paddingBottom: 6 }}>
                        {TABS.map(([id, label]) => (
                            <button key={id} onClick={() => setTab(id)} style={{
                                padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 0,
                                background: tab === id ? `${t.accent}1c` : 'transparent', color: tab === id ? t.accent : t.sub,
                            }}>
                                {label}
                                {id === 'gov' && sync.analysis && (sync.analysis.blocking.length + sync.analysis.security.length) > 0 &&
                                    <span style={{ marginLeft: 6, color: t.bad }}>●</span>}
                            </button>
                        ))}
                    </div>

                    <div style={{ flex: 1, minHeight: 0 }}>
                        {tab === 'code' && <CodeTab theme={theme} sync={sync} iac={iac} setIac={setIac} canEdit={canEdit} />}
                        {tab === 'vars' && <VarsTab theme={theme} iac={iac} setIac={setIac} canEdit={canEdit} />}
                        {tab === 'gov' && <GovernanceTab theme={theme} sync={sync} files={sync.files} onFocusNode={onFocusNode} />}
                        {tab === 'deploy' && (
                            <DeployTab theme={theme} files={sync.files} iac={iac} workspaceId={workspaceId} me={me} sync={sync}
                                canPlan={!me || perms.has('plan')} canApply={!me || perms.has('apply')} />
                        )}
                        {tab === 'team' && (
                            <TeamTab theme={theme} collab={collab} me={me} draftData={draftData} setDraftData={setDraftData} iac={iac} setIac={setIac}
                                workspaceId={workspaceId} focusedNodeId={focusedNodeId} canEdit={canEdit}
                                canTemplate={!me || perms.has('template')} isAdmin={!!me && perms.has('manage_users')} />
                        )}
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
}
