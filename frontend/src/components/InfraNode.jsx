import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCategoryMeta } from '../layout';

/* ── Load profile — Apple colors ───────────────────────────────── */

function loadProfile(load) {
    if (load > 0.8) return { tier: 'high', color: '#FF3B30' };
    if (load > 0.5) return { tier: 'mid', color: '#FF9500' };
    return { tier: 'low', color: '#34C759' };
}

/* ── Status badge colors ───────────────────────────────────────── */

const STATUS_STYLE = {
    success: { color: '#34C759', bg: 'rgba(52,199,89,0.08)', icon: '✓' },
    failure: { color: '#FF3B30', bg: 'rgba(255,59,48,0.08)', icon: '✕' },
    in_progress: { color: '#FF9500', bg: 'rgba(255,149,0,0.08)', icon: '⟳' },
};

/* ── Positioned Node ───────────────────────────────────────────── */

export default function InfraNode({
    nodeLayout,
    dimmed = false,
    focused = false,
    theme = 'light',
    onNodeClick,
    onNodeDoubleClick,
    onNodeMouseDown,
    onGodModeSelect,
    expandedNodeId,
    isDragging = false,
    physicsHovered = false,
}) {
    const [localHovered, setHovered] = useState(false);
    const hovered = physicsHovered || localHovered;
    const { node } = nodeLayout;
    const lp = loadProfile(node.metrics?.current_load || 0);
    const meta = getCategoryMeta(node.type);

    if (nodeLayout.isRegion) {
        return <RegionNode layout={nodeLayout} meta={meta} dimmed={dimmed} focused={focused} theme={theme} onNodeMouseDown={onNodeMouseDown} isDragging={isDragging} />;
    }

    const isExpanded = expandedNodeId === node.id;

    return (
        <CardNode
            layout={nodeLayout} meta={meta} lp={lp}
            hovered={hovered} setHovered={setHovered}
            dimmed={dimmed} focused={focused} theme={theme}
            onNodeClick={onNodeClick} 
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeMouseDown={onNodeMouseDown} 
            isExpanded={isExpanded}
            onGodModeSelect={onGodModeSelect} isDragging={isDragging}
        />
    );
}

/* ── Region (VPC / Subnet) — Dotted boundary ──────────────────── */

function RegionNode({ layout, meta, dimmed, focused, theme, onNodeMouseDown, isDragging }) {
    const { node } = layout;
    const isVPC = node.type === 'aws_vpc';
    const isDark = theme === 'dark';

    const accentColor = isVPC
        ? (isDark ? '#0a84ff' : '#007AFF')
        : (isDark ? '#5e5ce6' : '#5856D6');

    return (
        <motion.div
            className="node-region"
            initial={{ opacity: 0 }}
            animate={{
                opacity: dimmed ? 0.15 : 1,
                filter: dimmed ? 'saturate(0.2)' : 'saturate(1)',
            }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                // Dashed region border — matches the overall isometric grid aesthetic
                border: focused
                    ? `2px solid #007AFF`
                    : `1.5px dashed ${isVPC
                        ? (isDark ? 'rgba(10,132,255,0.22)' : 'rgba(0,122,255,0.18)')
                        : (isDark ? 'rgba(94,92,230,0.22)' : 'rgba(88,86,214,0.14)')}`,
                borderRadius: isVPC ? 24 : 16,
                background: isVPC
                    ? (isDark ? 'rgba(10,132,255,0.025)' : 'rgba(0,122,255,0.015)')
                    : (isDark ? 'rgba(94,92,230,0.025)' : 'rgba(88,86,214,0.012)'),
                pointerEvents: 'none',
                willChange: 'transform, width, height',
            }}
        >
            {/* Label badge — top-left, matching the rest of the Infradian UI system */}
            <div
                style={{
                    position: 'absolute',
                    top: 10,
                    left: 14,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px 3px 6px',
                    borderRadius: 8,
                    background: isDark ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.75)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                    boxShadow: isDark ? '0 1px 6px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.05)',
                    pointerEvents: 'none',
                    maxWidth: 'calc(100% - 28px)',
                    overflow: 'hidden',
                }}
            >
                {/* Category icon */}
                <span style={{ fontSize: 11, lineHeight: 1, flexShrink: 0 }}>{meta.icon}</span>

                {/* Label — Inter, semibold, same scale as node meta text */}
                <span style={{
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    color: accentColor,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {node.label}
                </span>

                {/* ID chip — muted, same as the sub-label on CardNode */}
                <span style={{
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: 9,
                    fontWeight: 500,
                    color: isDark ? '#636366' : '#aeaeb2',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}>
                    {node.id}
                </span>
            </div>
        </motion.div>
    );
}

/* ── Card Node — Click to expand pipeline panel ───────────────── */

function CardNode({
    layout, meta, lp, hovered, setHovered,
    dimmed, focused, theme, onNodeClick, onNodeDoubleClick, onNodeMouseDown, onGodModeSelect, isExpanded, isDragging,
}) {
    const { x, y, w, h, node } = layout;
    const events = node.history || [];
    const hasEvents = events.length > 0;
    const isDark = theme === 'dark';
    const isPlanned = node.status === 'planned';

    return (
        <motion.div
            className={`node-card absolute ${isPlanned ? 'ghost-socket' : ''} cursor-grab active:cursor-grabbing`}
            onMouseDown={(e) => onNodeMouseDown && onNodeMouseDown(node.id, e)}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
                opacity: dimmed ? 0.12 : (isPlanned ? undefined : 1), // Let CSS handle planned opacity
                scale: 1,
                filter: dimmed ? 'saturate(0.2) brightness(0.8)' : 'brightness(1)',
            }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                transform: `translate3d(${x}px, ${y}px, 0)`,
                width: isExpanded ? 320 : w,
                position: 'relative',
                zIndex: isExpanded ? 100 : hovered ? 50 : 10,
                pointerEvents: 'none', // Critical: Let drag events reach WebGL Cytoscape beneath
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.15), width 0.3s ease',
            }}
        >
            {/* ── Compact card (always visible) ─────────────────────────── */}
            <div
                className="rounded-xl flex items-center gap-3 px-3 select-none cursor-pointer"
                style={{
                    pointerEvents: 'none', // Keep un-draggable
                    height: h,
                    background: isPlanned ? 'rgba(0,122,255,0.05)' : (isDark ? 'rgba(44,44,46,0.75)' : 'rgba(255,255,255,0.88)'),
                    backdropFilter: 'blur(20px) saturate(1.8)',
                    WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
                    border: isPlanned
                        ? '2px dashed rgba(0,122,255,0.8)'
                        : focused
                            ? '1.5px solid #007AFF'
                            : isExpanded
                                ? '1px solid rgba(0,122,255,0.3)'
                                : isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)',
                    borderRadius: isExpanded ? '14px 14px 0 0' : 14,
                    boxShadow: isPlanned
                        ? 'none' // Handled by CSS animation
                        : focused
                            ? (isDark ? '0 0 0 3px rgba(10,132,255,0.2), 0 4px 16px rgba(0,0,0,0.4)' : '0 0 0 3px rgba(0,122,255,0.12), 0 4px 16px rgba(0,0,0,0.06)')
                            : hovered
                                ? (isDark ? '0 4px 20px rgba(0,0,0,0.4), 0 1px 4px rgba(255,255,255,0.04)' : '0 4px 20px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)')
                                : (isDark ? '0 1px 3px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)'),
                    transition: 'box-shadow 0.25s ease, border-color 0.2s ease, border-radius 0.2s ease',
                }}
            >
                {/* Icon badge */}
                <div
                    className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                    style={{ background: `${meta.color}10`, border: `1px solid ${meta.color}20` }}
                >
                    {meta.icon}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="text-[12px] font-semibold truncate leading-tight" style={{ color: isDark ? 'rgba(255,255,255,0.9)' : '#1d1d1f', letterSpacing: '-0.01em' }}>
                            {node.label}
                        </div>
                        {isPlanned && (
                            <span className="text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm" style={{ background: 'rgba(0,122,255,0.15)', color: '#007AFF' }}>
                                Planned
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-medium" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>{meta.label}</span>
                        {!isPlanned && (
                            <>
                                <span className="text-[9px]" style={{ color: isDark ? '#636366' : '#d1d1d6' }}>·</span>
                                <span className="text-[10px] font-medium" style={{ color: lp.color }}>
                                    {((node.metrics?.current_load || 0) * 100).toFixed(0)}%
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Pipeline count badge */}
                {hasEvents && (
                    <div
                        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{
                            background: isExpanded ? '#007AFF' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                            color: isExpanded ? '#fff' : (isDark ? '#aeaeb2' : '#86868b'),
                            transition: 'background 0.2s ease, color 0.2s ease',
                        }}
                    >
                        {events.length}
                    </div>
                )}
            </div>

            {/* ── Hover action bar ──────────────────────────────────────── */}
            <AnimatePresence>
                {hovered && !isExpanded && !dimmed && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute flex items-center gap-1"
                        style={{
                            bottom: -32,
                            left: 0,
                            right: 0,
                            justifyContent: 'center',
                            zIndex: 60,
                            pointerEvents: 'auto', // Buttons MUST be clickable!
                        }}
                    >
                        <ActionButton
                            icon="📋"
                            label="Pipelines"
                            count={events.length}
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); onNodeClick && onNodeClick(node.id, e); }}
                        />
                        <ActionButton
                            icon="📊"
                            label="Metrics"
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); }}
                        />
                        <ActionButton
                            icon="⚙️"
                            label="Config"
                            isDark={isDark}
                            onClick={(e) => { e.stopPropagation(); onGodModeSelect && onGodModeSelect(node.id, e); }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Expanded pipeline panel (slides open below) ────────── */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                        style={{
                            overflow: 'hidden',
                            background: isDark ? 'rgba(44,44,46,0.95)' : 'rgba(255,255,255,0.92)',
                            backdropFilter: 'blur(20px) saturate(1.8)',
                            WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
                            borderLeft: '1px solid rgba(0,122,255,0.2)',
                            borderRight: '1px solid rgba(0,122,255,0.2)',
                            borderBottom: '1px solid rgba(0,122,255,0.2)',
                            borderRadius: '0 0 14px 14px',
                            boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.08)',
                            pointerEvents: 'auto', // Panel MUST be clickable!
                        }}
                    >
                        {/* Panel header */}
                        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}` }}>
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: isDark ? '#aeaeb2' : '#86868b', letterSpacing: '0.06em' }}>
                                CI/CD Pipeline
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onNodeClick && onNodeClick(null, e); }}
                                className="text-[10px] cursor-pointer bg-transparent border-0 font-medium"
                                style={{ color: isDark ? '#636366' : '#aeaeb2' }}
                            >
                                ✕ close
                            </button>
                        </div>

                        <div className="px-3 py-2 flex flex-col gap-1.5" style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {events.length === 0 ? (
                                <div className="text-[11px] py-3 text-center" style={{ color: isDark ? '#636366' : '#aeaeb2' }}>
                                    No pipeline events recorded
                                </div>
                            ) : (
                                [...events].reverse().map((event, i) => {
                                    const ss = STATUS_STYLE[event.status] || STATUS_STYLE.success;
                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.15, delay: i * 0.04 }}
                                            className="flex items-start gap-2 rounded-lg px-2.5 py-2"
                                            style={{ background: ss.bg }}
                                        >
                                            {/* Status icon */}
                                            <span
                                                className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold mt-0.5"
                                                style={{ color: ss.color, background: `${ss.color}15` }}
                                            >
                                                {ss.icon}
                                            </span>

                                            {/* Event content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-semibold uppercase" style={{ color: ss.color, letterSpacing: '0.03em' }}>
                                                        {event.status.replace('_', ' ')}
                                                    </span>
                                                    <span className="text-[9px]" style={{ color: isDark ? '#636366' : '#d1d1d6' }}>·</span>
                                                    <span className="text-[9px]" style={{ color: isDark ? '#aeaeb2' : '#aeaeb2' }}>
                                                        {formatTime(event.timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] leading-relaxed m-0 mt-0.5" style={{ color: isDark ? '#e5e5ea' : '#1d1d1f' }}>
                                                    {event.message}
                                                </p>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* ── Hover action button ───────────────────────────────────────── */

function ActionButton({ icon, label, count, onClick, isDark }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer border-0 text-[10px] font-medium"
            style={{
                background: isDark ? 'rgba(44,44,46,0.92)' : 'rgba(255,255,255,0.92)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                color: isDark ? '#e5e5ea' : '#1d1d1f',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.06)',
                transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(10,132,255,0.15)' : 'rgba(0,122,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? 'rgba(44,44,46,0.92)' : 'rgba(255,255,255,0.92)'; }}
        >
            <span>{icon}</span>
            <span>{label}</span>
            {count !== undefined && count > 0 && (
                <span className="text-[8px] font-bold px-1 py-0.5 rounded-full" style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: isDark ? '#aeaeb2' : '#86868b' }}>
                    {count}
                </span>
            )}
        </button>
    );
}

/* ── Time formatter ────────────────────────────────────────────── */

function formatTime(ts) {
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            + ' · '
            + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return ts;
    }
}
