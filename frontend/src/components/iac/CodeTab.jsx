import { useEffect, useState } from 'react';
import { Chip, Btn, useTokens } from './ui';

export default function CodeTab({ theme, sync, iac, setIac, canEdit }) {
    const t = useTokens(theme);
    const names = Object.keys(sync.files);
    const [active, setActive] = useState('main.tf');
    useEffect(() => { if (names.length && !names.includes(active)) setActive(names[0]); }, [names.join(',')]); // eslint-disable-line

    const status = sync.parseError
        ? <Chip color={t.bad} title={sync.parseError}>Syntax error — canvas unchanged</Chip>
        : sync.syncState === 'parsing' ? <Chip color={t.warn}>Applying to canvas…</Chip>
        : sync.syncState === 'generating' ? <Chip color={t.warn}>Generating…</Chip>
        : <Chip color={t.ok}>In sync</Chip>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {['terraform', 'opentofu'].map(tool => (
                    <Btn key={tool} t={t} kind={iac.tool === tool ? 'primary' : 'default'} onClick={() => setIac(p => ({ ...p, tool }))}>
                        {tool === 'terraform' ? 'Terraform' : 'OpenTofu'}
                    </Btn>
                ))}
                <div style={{ flex: 1 }} />
                {status}
            </div>
            {sync.parseError && (
                <div style={{ fontSize: 11, color: t.bad, background: `${t.bad}12`, padding: '6px 8px', borderRadius: 7, fontFamily: 'ui-monospace, monospace' }}>
                    {sync.parseError}
                </div>
            )}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {names.map(n => (
                    <button key={n} onClick={() => setActive(n)} style={{
                        padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${active === n ? t.accent : t.border}`, background: active === n ? `${t.accent}18` : 'transparent',
                        color: active === n ? t.accent : t.sub,
                    }}>{n}</button>
                ))}
            </div>
            <textarea
                value={sync.files[active] ?? ''}
                readOnly={!canEdit}
                onChange={e => sync.editFile(active, e.target.value)}
                spellCheck={false}
                placeholder="# Drag resources onto the canvas — code appears here. Edit it and the canvas follows."
                style={{
                    flex: 1, minHeight: 200, resize: 'none', padding: 10, borderRadius: 10, border: `1px solid ${t.border}`,
                    background: t.code, color: t.text, fontSize: 12, lineHeight: 1.5, outline: 'none', tabSize: 2,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre',
                }}
            />
            {sync.warnings.length > 0 && (
                <div style={{ fontSize: 11, color: t.sub, maxHeight: 70, overflowY: 'auto' }}>
                    {sync.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
            )}
        </div>
    );
}
