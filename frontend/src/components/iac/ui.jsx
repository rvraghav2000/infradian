import { useMemo } from 'react';

/** Theme tokens shared by the IaC studio tabs. */
export function useTokens(theme) {
    return useMemo(() => {
        const d = theme === 'dark';
        return {
            d,
            bg: d ? 'rgba(22,22,26,0.96)' : 'rgba(252,252,254,0.97)',
            card: d ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            border: d ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)',
            text: d ? 'rgba(255,255,255,0.92)' : '#1d1d1f',
            sub: d ? 'rgba(255,255,255,0.5)' : '#6e6e73',
            code: d ? '#0e0e10' : '#f5f5f7',
            accent: '#007AFF', ok: '#34C759', warn: '#FF9500', bad: '#FF3B30',
        };
    }, [theme]);
}

export const SEVERITY_COLOR = { critical: '#FF3B30', high: '#FF6B3B', medium: '#FF9500', low: '#8E8E93', info: '#8E8E93' };

export function Btn({ t, children, onClick, disabled, kind = 'default', title, style }) {
    const color = kind === 'primary' ? '#fff' : kind === 'danger' ? t.bad : t.text;
    const bg = kind === 'primary' ? t.accent : t.card;
    return (
        <button
            onClick={onClick} disabled={disabled} title={title}
            style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
                border: `1px solid ${kind === 'primary' ? t.accent : t.border}`, background: bg, color, opacity: disabled ? 0.45 : 1, ...style,
            }}
        >{children}</button>
    );
}

export function Chip({ color, children, title }) {
    return (
        <span title={title} style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
            color, background: `${color}1f`, border: `1px solid ${color}40`, whiteSpace: 'nowrap',
        }}>{children}</span>
    );
}

export function Field({ t, value, onChange, placeholder, style, type = 'text', disabled }) {
    return (
        <input
            type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
            style={{
                padding: '6px 8px', borderRadius: 7, fontSize: 12, border: `1px solid ${t.border}`, background: t.card,
                color: t.text, outline: 'none', minWidth: 0, ...style,
            }}
        />
    );
}

export function Section({ t, title, right, children }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.sub }}>{title}</div>
                {right}
            </div>
            {children}
        </div>
    );
}

export const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
