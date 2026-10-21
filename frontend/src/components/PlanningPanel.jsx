import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { PALETTE_PRIMITIVES, registerCatalog, PROVIDER_META } from '../layout';
import { iacApi } from '../services/iacApi';

/**
 * PlanningPanel — categorized drag palette that slides in from the left.
 * Fully theme-aware (light/dark). The scrollable item list starts with
 * enough top padding to clear the top chrome frosted mesh so the Infradian
 * logo is never obscured.
 */
export default function PlanningPanel({ theme }) {
    const [collapsed, setCollapsed] = useState(false);
    const [catalogGroups, setCatalogGroups] = useState([]);
    const [query, setQuery] = useState('');
    const isDark = theme === 'dark';

    useEffect(() => {
        let alive = true;
        iacApi.catalog()
            .then(c => { if (alive) setCatalogGroups(registerCatalog(c.resources)); })
            .catch(() => { /* backend offline — core palette still works */ });
        return () => { alive = false; };
    }, []);

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const cloud = catalogGroups
            .map(g => ({ ...g, items: q ? g.items.filter(i => `${i.label} ${i.type}`.toLowerCase().includes(q)) : g.items }))
            .filter(g => g.items.length);
        const core = q ? PALETTE_PRIMITIVES.map(g => ({ ...g, items: g.items.filter(i => `${i.label} ${i.type}`.toLowerCase().includes(q)) })).filter(g => g.items.length) : PALETTE_PRIMITIVES;
        return [...core, ...cloud];
    }, [catalogGroups, query]);

    // Theme tokens — panel adapts exactly like the rest of the Infradian UI
    const panelBg        = isDark ? 'rgba(18,18,20,0.92)'        : 'rgba(248,248,250,0.94)';
    const borderColor    = isDark ? 'rgba(255,255,255,0.06)'      : 'rgba(0,0,0,0.06)';
    const headerText     = isDark ? 'rgba(255,255,255,0.9)'       : '#1d1d1f';
    const subtitleText   = isDark ? 'rgba(255,255,255,0.35)'      : '#86868b';
    const hintText       = isDark ? 'rgba(255,255,255,0.2)'       : '#aeaeb2';
    const toggleBg       = isDark ? 'rgba(255,255,255,0.06)'      : 'rgba(0,0,0,0.04)';
    const toggleBgHover  = isDark ? 'rgba(255,255,255,0.12)'      : 'rgba(0,0,0,0.08)';
    const toggleColor    = isDark ? 'rgba(255,255,255,0.5)'       : '#86868b';
    const toggleColorH   = isDark ? 'rgba(255,255,255,0.9)'       : '#1d1d1f';
    const toggleBorder   = isDark ? 'rgba(255,255,255,0.1)'       : 'rgba(0,0,0,0.08)';

    return (
        <AnimatePresence>
            <motion.aside
                key="planning-panel"
                initial={{ x: -320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -320, opacity: 0 }}
                className="fixed"
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: collapsed ? 56 : 260,
                    transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
                    zIndex: 45,  // Sits BELOW the top chrome mesh (z-55)
                    display: 'flex',
                    flexDirection: 'column',
                    background: panelBg,
                    backdropFilter: 'blur(24px) saturate(1.6)',
                    WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                    borderRight: `1px solid ${borderColor}`,
                    boxShadow: isDark
                        ? '4px 0 32px rgba(0,0,0,0.4)'
                        : '4px 0 24px rgba(0,0,0,0.06)',
                    overflowY: collapsed ? 'hidden' : 'auto',
                    overflowX: 'hidden',
                    overscrollBehavior: 'contain',
                }}
            >
                {/* ── Scroll content — starts with clearance for the top chrome ── */}
                <div style={{
                    // Extra padding at top so item list starts BELOW the frosted chrome mesh
                    // (~110px chrome height + 8px breathing room)
                    paddingTop: 118,
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                }}>

                    {/* ── Panel sub-header (below the chrome zone) ───────────── */}
                    {!collapsed && (
                        <div style={{
                            padding: '0 14px 8px',
                            borderBottom: `1px solid ${borderColor}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexShrink: 0,
                        }}>
                            <div>
                                <div style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: subtitleText,
                                    fontFamily: 'Inter, -apple-system, sans-serif',
                                }}>
                                    Draft Mode
                                </div>
                                <div style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: headerText,
                                    letterSpacing: '-0.01em',
                                    marginTop: 2,
                                    fontFamily: 'Inter, -apple-system, sans-serif',
                                }}>
                                    Primitives
                                </div>
                            </div>

                            {/* Collapse / expand toggle */}
                            <button
                                onClick={() => setCollapsed(p => !p)}
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    border: `1px solid ${toggleBorder}`,
                                    background: toggleBg,
                                    color: toggleColor,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    flexShrink: 0,
                                    transition: 'background 0.2s, color 0.2s',
                                }}
                                title="Collapse palette"
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = toggleBgHover;
                                    e.currentTarget.style.color = toggleColorH;
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = toggleBg;
                                    e.currentTarget.style.color = toggleColor;
                                }}
                            >
                                ◀
                            </button>
                        </div>
                    )}

                    {/* Collapsed-mode expand button */}
                    {collapsed && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                            <button
                                onClick={() => setCollapsed(false)}
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    border: `1px solid ${toggleBorder}`,
                                    background: toggleBg,
                                    color: toggleColor,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    transition: 'background 0.2s, color 0.2s',
                                }}
                                title="Expand palette"
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = toggleBgHover;
                                    e.currentTarget.style.color = toggleColorH;
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = toggleBg;
                                    e.currentTarget.style.color = toggleColor;
                                }}
                            >
                                ▶
                            </button>
                        </div>
                    )}

                    {/* Hint */}
                    {!collapsed && (
                        <div style={{
                            padding: '6px 14px 2px',
                            fontSize: 10,
                            color: hintText,
                            fontFamily: 'Inter, -apple-system, sans-serif',
                            fontWeight: 500,
                            letterSpacing: '0.01em',
                            flexShrink: 0,
                        }}>
                            Drag onto canvas to place
                        </div>
                    )}

                    {/* ── Categories ──────────────────────────────────────────── */}
                    <div style={{ padding: collapsed ? '8px 0' : '8px 10px 32px', flex: 1 }}>
                        {!collapsed && (
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search AWS · Azure · GCP · OCI…"
                                style={{
                                    margin: '0 0 8px', width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, fontSize: 12,
                                    border: `1px solid ${toggleBorder}`, background: toggleBg, color: headerText, outline: 'none',
                                }}
                            />
                        )}
                        {groups.map((group) => (
                            <CategorySection
                                key={group.category}
                                group={group}
                                collapsed={collapsed}
                                isDark={isDark}
                                borderColor={borderColor}
                                subtitleText={subtitleText}
                            />
                        ))}
                    </div>
                </div>
            </motion.aside>
        </AnimatePresence>
    );
}

/* ── Category Section ──────────────────────────────────────────── */

function CategorySection({ group, collapsed, isDark, borderColor, subtitleText }) {
    const [open, setOpen] = useState(true);

    if (collapsed) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 8px' }}>
                {group.items.map(item => (
                    <DraggableItem key={item.type} item={item} collapsed={true} isDark={isDark} />
                ))}
            </div>
        );
    }

    return (
        <div style={{ marginTop: 14 }}>
            <button
                onClick={() => setOpen(p => !p)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 4px 6px',
                    borderRadius: 6,
                }}
            >
                <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: subtitleText,
                    fontFamily: 'Inter, -apple-system, sans-serif',
                    flex: 1,
                    textAlign: 'left',
                }}>
                    {group.category}
                </span>
                <span style={{ fontSize: 9, color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }}>
                    {open ? '▾' : '▸'}
                </span>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 3 }}
                    >
                        {group.items.map(item => (
                            <DraggableItem key={item.type} item={item} collapsed={false} isDark={isDark} />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Draggable Item ────────────────────────────────────────────── */

function DraggableItem({ item, collapsed, isDark }) {
    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);

    function handleDragStart(e) {
        setDragging(true);
        e.dataTransfer.setData('application/infradian-node-data', JSON.stringify(item.defaultData));
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/infradian-node', item.type);
    }

    function handleDragEnd() { setDragging(false); }

    const bg = hovered
        ? `${item.color}15`
        : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';

    const border = hovered
        ? `1px solid ${item.color}35`
        : dragging
            ? `1px solid ${item.color}50`
            : isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)';

    const labelColor = hovered
        ? (isDark ? 'rgba(255,255,255,0.95)' : '#1d1d1f')
        : (isDark ? 'rgba(255,255,255,0.7)'  : '#3a3a3c');

    if (collapsed) {
        return (
            <div
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                title={item.label}
                style={{
                    width: 40, height: 40, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, background: bg, border, cursor: 'grab',
                    transition: 'background 0.15s, border 0.15s',
                    userSelect: 'none',
                }}
            >
                {item.icon}
            </div>
        );
    }

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 10, background: bg, border,
                cursor: 'grab',
                transition: 'background 0.15s, border 0.15s, transform 0.1s',
                transform: dragging ? 'scale(0.97)' : 'scale(1)',
                userSelect: 'none',
            }}
        >
            {/* Icon badge */}
            <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${item.color}14`,
                border: `1px solid ${item.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
            }}>
                {item.icon}
            </div>

            {/* Label */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 12, fontWeight: 500,
                    color: labelColor,
                    letterSpacing: '-0.01em',
                    fontFamily: 'Inter, -apple-system, sans-serif',
                    transition: 'color 0.15s',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {item.label}
                </div>
            </div>

            {/* Drag handle pip */}
            <div style={{
                fontSize: 9,
                color: hovered
                    ? (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)')
                    : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                transition: 'color 0.15s', flexShrink: 0,
            }}>
                ⠿
            </div>
        </div>
    );
}
