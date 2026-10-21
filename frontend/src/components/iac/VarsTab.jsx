import { Btn, Chip, Field, Section, useTokens } from './ui';

const TYPES = ['string', 'number', 'bool', 'list(string)', 'map(string)'];

export default function VarsTab({ theme, iac, setIac, canEdit }) {
    const t = useTokens(theme);
    const vars = iac.variables || [];
    const outs = iac.outputs || [];
    const locals = Object.entries(iac.locals || {});

    const setVar = (name, patch) => setIac(p => ({
        ...p, variables: p.variables.map((v, i) => i === name ? { ...v, ...patch, auto: false } : v),
    }));
    const delVar = (name) => setIac(p => ({ ...p, variables: p.variables.filter((_, i) => i !== name) }));
    const addVar = () => setIac(p => ({ ...p, variables: [...p.variables, { name: `var_${p.variables.length + 1}`, type: 'string', default: '', description: '', sensitive: false }] }));
    const setOut = (i, patch) => setIac(p => ({ ...p, outputs: p.outputs.map((o, j) => j === i ? { ...o, ...patch } : o) }));
    const setLocals = (entries) => setIac(p => ({ ...p, locals: Object.fromEntries(entries.filter(([k]) => k)) }));

    return (
        <div style={{ overflowY: 'auto', height: '100%', paddingRight: 2 }}>
            <Section t={t} title="Variables" right={<Btn t={t} onClick={addVar} disabled={!canEdit}>+ Add</Btn>}>
                {vars.length === 0 && <div style={{ fontSize: 12, color: t.sub }}>No variables yet. Required values (passwords, bucket names…) appear here automatically.</div>}
                {vars.map((v, vi) => (
                    <div key={vi} style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr 1fr auto', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                        <Field t={t} value={v.name} disabled={!canEdit || v.auto} onChange={x => setVar(vi, { name: x })} />
                        <select value={v.type} disabled={!canEdit} onChange={e => setVar(vi, { type: e.target.value })}
                            style={{ padding: '6px 4px', borderRadius: 7, fontSize: 12, border: `1px solid ${t.border}`, background: t.card, color: t.text }}>
                            {[...new Set([v.type, ...TYPES])].map(x => <option key={x}>{x}</option>)}
                        </select>
                        <Field t={t} value={v.default} placeholder={v.sensitive ? '(none — set at plan time)' : 'default'} disabled={!canEdit || v.sensitive}
                            onChange={x => setVar(vi, { default: x })} />
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {v.auto && <Chip color={t.sub} title="Created by the canvas; edit to make it yours">auto</Chip>}
                            <label title="Sensitive" style={{ fontSize: 11, color: t.sub }}>
                                <input type="checkbox" checked={!!v.sensitive} disabled={!canEdit} onChange={e => setVar(vi, { sensitive: e.target.checked })} /> 🔒
                            </label>
                            {!v.auto && canEdit && <button onClick={() => delVar(vi)} style={{ border: 0, background: 'transparent', color: t.bad, cursor: 'pointer' }}>✕</button>}
                        </div>
                        <Field t={t} value={v.description} placeholder="description" disabled={!canEdit} onChange={x => setVar(vi, { description: x })} style={{ gridColumn: '1 / -1' }} />
                    </div>
                ))}
            </Section>

            <Section t={t} title="Outputs" right={<Btn t={t} disabled={!canEdit} onClick={() => setIac(p => ({ ...p, outputs: [...p.outputs, { name: `output_${p.outputs.length + 1}`, value: '', description: '' }] }))}>+ Add</Btn>}>
                {outs.length === 0 && <div style={{ fontSize: 12, color: t.sub }}>e.g. name <code>vpc_id</code>, value <code>aws_vpc.main.id</code></div>}
                {outs.map((o, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 4, marginBottom: 4 }}>
                        <Field t={t} value={o.name} placeholder="name" disabled={!canEdit} onChange={x => setOut(i, { name: x })} />
                        <Field t={t} value={o.value} placeholder="aws_vpc.main.id" disabled={!canEdit} onChange={x => setOut(i, { value: x })} />
                        {canEdit && <button onClick={() => setIac(p => ({ ...p, outputs: p.outputs.filter((_, j) => j !== i) }))} style={{ border: 0, background: 'transparent', color: t.bad, cursor: 'pointer' }}>✕</button>}
                    </div>
                ))}
            </Section>

            <Section t={t} title="Locals" right={<Btn t={t} disabled={!canEdit} onClick={() => setLocals([...locals, [`local_${locals.length + 1}`, '']])}>+ Add</Btn>}>
                {locals.length === 0 && <div style={{ fontSize: 12, color: t.sub }}>Shared values referenced as <code>local.name</code>.</div>}
                {locals.map(([k, v], i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 4, marginBottom: 4 }}>
                        <Field t={t} value={k} disabled={!canEdit} onChange={x => setLocals(locals.map((e, j) => j === i ? [x, e[1]] : e))} />
                        <Field t={t} value={typeof v === 'string' ? v : JSON.stringify(v)} disabled={!canEdit} onChange={x => setLocals(locals.map((e, j) => j === i ? [e[0], x] : e))} />
                        {canEdit && <button onClick={() => setLocals(locals.filter((_, j) => j !== i))} style={{ border: 0, background: 'transparent', color: t.bad, cursor: 'pointer' }}>✕</button>}
                    </div>
                ))}
            </Section>
        </div>
    );
}
