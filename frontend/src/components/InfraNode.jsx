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
    onNodeClick,
    expandedNodeId,
}) {
    const [hovered, setHovered] = useState(false);
    const { node } = nodeLayout;
    const lp = loadProfile(node.metrics.current_load);
    const meta = getCategoryMeta(node.type);

    if (nodeLayout.isRegion) {
        return <RegionNode layout={nodeLayout} meta={meta} dimmed={dimmed} focused={focused} />;
    }

    const isExpanded = expandedNodeId === node.id;

    return (
        <CardNode
            layout={nodeLayout} meta={meta} lp={lp}
            hovered={hovered} setHovered={setHovered}
            dimmed={dimmed} focused={focused}
            onNodeClick={onNodeClick} isExpanded={isExpanded}
        />
    );
}

/* ── Region (VPC / Subnet) — Dotted boundary ──────────────────── */

function RegionNode({ layout, meta, dimmed, focused }) {
    const { x, y, w, h, node } = layout;
    const isVPC = node.type === 'aws_vpc';

    return (
        <motion.div
            className="node-region absolute"
            initial={{ opacity: 0 }}
            animate={{
                opacity: dimmed ? 0.2 : 1,
                filter: dimmed ? 'saturate(0.3)' : 'saturate(1)',
            }}
            transition={{ duration: 0.4 }}
            style={{
                left: x, top: y, width: w, height: h,
                position: 'absolute',
                border: focused
                    ? '2px solid #007AFF'
                    : `1.5px dashed ${isVPC ? 'rgba(0,122,255,0.25)' : 'rgba(88,86,214,0.2)'}`,
                borderRadius: isVPC ? 20 : 14,
                background: isVPC ? 'rgba(0,122,255,0.02)' : 'rgba(88,86,214,0.02)',
                pointerEvents: 'none',
            }}
        >
            <div
                className="absolute flex items-center gap-2 px-4"
                style={{
                    top: 8, left: 12, fontSize: 12, fontWeight: 600,
                    color: isVPC ? '#007AFF' : '#5856D6',
                    opacity: 0.7, letterSpacing: '-0.01em',
                }}
            >
                <span>{meta.icon}</span>
                <span>{node.label}</span>
                <span className="text-[10px] font-normal ml-2" style={{ color: '#aeaeb2' }}>{node.id}</span>
            </div>
        </motion.div>
    );
}

/* ── Card Node — Click to expand pipeline panel ───────────────── */

function CardNode({
    layout, meta, lp, hovered, setHovered,
    dimmed, focused, onNodeClick, isExpanded,
}) {
    const { x, y, w, h, node } = layout;
    const events = node.history || [];
    const hasEvents = events.length > 0;

    return (
        <motion.div
            className="node-card absolute"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
                opacity: dimmed ? 0.12 : 1,
                scale: 1,
                filter: dimmed ? 'saturate(0.2) brightness(0.8)' : 'brightness(1)',
            }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                left: x, top: y,
                width: isExpanded ? 320 : w,
                position: 'absolute',
                zIndex: isExpanded ? 100 : hovered ? 50 : 10,
                transition: 'width 0.3s ease',
            }}
        >
            {/* ── Compact card (always visible) ─────────────────────────── */}
            <div
                className="rounded-xl flex items-center gap-3 px-3 select-none cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onNodeClick && onNodeClick(node.id); }}
                style={{
                    height: h,
                    background: 'rgba(255,255,255,0.88)',
                    backdropFilter: 'blur(16px) saturate(1.8)',
                    WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
                    border: focused
                        ? '1.5px solid #007AFF'
                        : isExpanded
                            ? '1px solid rgba(0,122,255,0.2)'
                            : '1px solid rgba(0,0,0,0.07)',
                    borderRadius: isExpanded ? '14px 14px 0 0' : 14,
                    boxShadow: focused
                        ? '0 0 0 3px rgba(0,122,255,0.12), 0 4px 16px rgba(0,0,0,0.06)'
                        : hovered
                            ? '0 4px 20px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)'
                            : '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)',
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
                    <div className="text-[12px] font-semibold truncate leading-tight" style={{ color: '#1d1d1f', letterSpacing: '-0.01em' }}>
                        {node.label}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-medium" style={{ color: '#aeaeb2' }}>{meta.label}</span>
                        <span className="text-[9px]" style={{ color: '#d1d1d6' }}>·</span>
                        <span className="text-[10px] font-medium" style={{ color: lp.color }}>
                            {(node.metrics.current_load * 100).toFixed(0)}%
                        </span>
                    </div>
                </div>

                {/* Pipeline count badge */}
                {hasEvents && (
                    <div
                        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{
                            background: isExpanded ? '#007AFF' : 'rgba(0,0,0,0.06)',
                            color: isExpanded ? '#fff' : '#86868b',
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
                        }}
                    >
                        <ActionButton
                            icon="📋"
                            label="Pipelines"
                            count={events.length}
                            onClick={(e) => { e.stopPropagation(); onNodeClick && onNodeClick(node.id); }}
                        />
                        <ActionButton
                            icon="📊"
                            label="Metrics"
                            onClick={(e) => { e.stopPropagation(); }}
                        />
                        <ActionButton
                            icon="🔗"
                            label="Deps"
                            onClick={(e) => { e.stopPropagation(); }}
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
                            background: 'rgba(255,255,255,0.92)',
                            backdropFilter: 'blur(16px) saturate(1.8)',
                            WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
                            borderLeft: '1px solid rgba(0,122,255,0.2)',
                            borderRight: '1px solid rgba(0,122,255,0.2)',
                            borderBottom: '1px solid rgba(0,122,255,0.2)',
                            borderRadius: '0 0 14px 14px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                        }}
                    >
                        {/* Panel header */}
                        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#86868b', letterSpacing: '0.06em' }}>
                                CI/CD Pipeline
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onNodeClick && onNodeClick(null); }}
                                className="text-[10px] cursor-pointer bg-transparent border-0 font-medium"
                                style={{ color: '#aeaeb2' }}
                            >
                                ✕ close
                            </button>
                        </div>

                        {/* Pipeline events */}
                        <div className="px-3 py-2 flex flex-col gap-1.5" style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {events.length === 0 ? (
                                <div className="text-[11px] py-3 text-center" style={{ color: '#aeaeb2' }}>
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
                                                    <span className="text-[9px]" style={{ color: '#d1d1d6' }}>·</span>
                                                    <span className="text-[9px]" style={{ color: '#aeaeb2' }}>
                                                        {formatTime(event.timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] leading-relaxed m-0 mt-0.5" style={{ color: '#1d1d1f' }}>
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

function ActionButton({ icon, label, count, onClick }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer border-0 text-[10px] font-medium"
            style={{
                background: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(0,0,0,0.08)',
                color: '#1d1d1f',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.92)'; }}
        >
            <span>{icon}</span>
            <span>{label}</span>
            {count !== undefined && count > 0 && (
                <span className="text-[8px] font-bold px-1 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.06)', color: '#86868b' }}>
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
