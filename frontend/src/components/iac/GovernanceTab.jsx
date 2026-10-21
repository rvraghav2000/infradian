import { useState } from 'react';
import { iacApi } from '../../services/iacApi';
import { Btn, Chip, Section, SEVERITY_COLOR, money, useTokens } from './ui';

export default function GovernanceTab({ theme, sync, files, onFocusNode }) {
    const t = useTokens(theme);
    const a = sync.analysis;
    const [deep, setDeep] = useState({ busy: false, findings: null, error: null });

    const runCheckov = async () => {
        setDeep({ busy: true, findings: null, error: null });
        try {
            const r = await iacApi.checkov(files);
            setDeep({ busy: false, findings: r.findings, error: null });
        } catch (e) { setDeep({ busy: false, findings: null, error: e.message }); }
    };

    if (sync.analysisError) return <div style={{ color: t.bad, fontSize: 12 }}>Analysis failed: {sync.analysisError}</div>;
    if (!a) return <div style={{ color: t.sub, fontSize: 12 }}>Add resources to the canvas to see security, policy and cost results.</div>;

    const sevCounts = a.security.reduce((m, f) => ({ ...m, [f.severity]: (m[f.severity] || 0) + 1 }), {});
    const deny = a.policy.filter(v => v.enforcement === 'deny');

    return (
        <div style={{ overflowY: 'auto', height: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                <Stat t={t} label="Est. monthly cost" value={money(a.cost.monthly_total)} />
                <Stat t={t} label="Security findings" value={a.security.length} color={a.security.length ? SEVERITY_COLOR[a.security[0].severity] : t.ok} />
                <Stat t={t} label="Policy blockers" value={deny.length} color={deny.length ? t.bad : t.ok} />
            </div>

            <Section t={t} title="Cost estimate" right={<Chip color={t.sub} title={a.cost.note}>{a.cost.source}</Chip>}>
                {a.cost.items.length === 0 && <div style={{ fontSize: 12, color: t.sub }}>No billable resources.</div>}
                {a.cost.items.map(i => (
                    <Row key={i.resource} t={t} onClick={() => onFocusNode(i.node)}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.label || i.resource}<span style={{ color: t.sub }}> · {i.resource.split('.')[0]}</span></span>
                        <b>{money(i.monthly)}</b>
                    </Row>
                ))}
                <div style={{ fontSize: 10, color: t.sub, marginTop: 4 }}>{a.cost.note}</div>
            </Section>

            <Section t={t} title={`Policy as code (${a.policy.length})`}>
                {a.policy.length === 0 && <div style={{ fontSize: 12, color: t.ok }}>✓ All policies pass.</div>}
                {a.policy.map((v, i) => (
                    <Row key={i} t={t} onClick={() => onFocusNode(v.node)}>
                        <Chip color={v.enforcement === 'deny' ? t.bad : t.warn}>{v.enforcement}</Chip>
                        <span style={{ flex: 1 }}>{v.description}<div style={{ color: t.sub, fontSize: 10 }}>{v.resource} · {v.attribute} = {String(v.actual)} (want {v.expected})</div></span>
                    </Row>
                ))}
            </Section>

            <Section t={t} title={`Security scan (${a.security.length})`}
                right={<Btn t={t} onClick={runCheckov} disabled={deep.busy} title="Runs the full Checkov rule set in Docker">{deep.busy ? 'Scanning…' : 'Deep scan (Checkov)'}</Btn>}>
                {Object.keys(sevCounts).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                        {Object.entries(sevCounts).map(([s, n]) => <Chip key={s} color={SEVERITY_COLOR[s]}>{n} {s}</Chip>)}
                    </div>
                )}
                {a.security.length === 0 && <div style={{ fontSize: 12, color: t.ok }}>✓ No findings from built-in guardrails.</div>}
                {a.security.map((f, i) => (
                    <Row key={i} t={t} onClick={() => onFocusNode(f.node)}>
                        <Chip color={SEVERITY_COLOR[f.severity]}>{f.severity}</Chip>
                        <span style={{ flex: 1 }}>{f.title}<div style={{ color: t.sub, fontSize: 10 }}>{f.resource} — {f.fix}</div></span>
                    </Row>
                ))}
                {deep.error && <div style={{ color: t.bad, fontSize: 11, marginTop: 6 }}>{deep.error}</div>}
                {deep.findings && (
                    <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: t.sub, marginBottom: 4 }}>CHECKOV — {deep.findings.length} failed checks</div>
                        {deep.findings.slice(0, 50).map((f, i) => (
                            <Row key={i} t={t}><Chip color={SEVERITY_COLOR[f.severity] || t.warn}>{f.severity}</Chip>
                                <span style={{ flex: 1 }}>{f.title}<div style={{ color: t.sub, fontSize: 10 }}>{f.rule} · {f.resource}</div></span></Row>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}

function Stat({ t, label, value, color }) {
    return (
        <div style={{ padding: 10, borderRadius: 10, background: t.card, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.sub }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: color || t.text, marginTop: 2 }}>{value}</div>
        </div>
    );
}

function Row({ t, children, onClick }) {
    return (
        <div onClick={onClick} style={{
            display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', marginBottom: 3, borderRadius: 8, fontSize: 12,
            background: t.card, border: `1px solid ${t.border}`, color: t.text, cursor: onClick ? 'pointer' : 'default',
        }}>{children}</div>
    );
}
