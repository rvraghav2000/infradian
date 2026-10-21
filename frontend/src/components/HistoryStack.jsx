import { motion, AnimatePresence } from 'framer-motion';

/**
 * HistoryStack — Apple-style frosted cards
 */

const STATUS_STYLE = {
    success: { border: '#34C759', bg: 'rgba(52,199,89,0.04)', badge: '#34C759', icon: '✓' },
    failure: { border: '#FF3B30', bg: 'rgba(255,59,48,0.04)', badge: '#FF3B30', icon: '✕' },
    in_progress: { border: '#FF9500', bg: 'rgba(255,149,0,0.04)', badge: '#FF9500', icon: '⟳' },
};

export default function HistoryStack({ node, onClose }) {
    if (!node || !node.history || node.history.length === 0) return null;

    const events = [...node.history].reverse();

    return (
        <div
            className="history-stack-anchor"
            style={{
                position: 'absolute',
                left: '50%',
                bottom: '100%',
                transform: 'translateX(-50%)',
                transformStyle: 'preserve-3d',
                zIndex: 200,
                pointerEvents: 'auto',
            }}
        >
            {/* Close button */}
            <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="absolute -top-2 -right-6 w-5 h-5 rounded-full flex items-center justify-center text-xs cursor-pointer z-[300]"
                style={{
                    background: 'rgba(255,255,255,0.9)',
                    border: '1px solid rgba(0,0,0,0.1)',
                    color: '#86868b',
                    transform: `translateZ(${(events.length + 1) * 50}px)`,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                }}
            >
                ×
            </motion.button>

            {/* Title label */}
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.05 }}
                className="text-[10px] font-medium text-center mb-2 whitespace-nowrap"
                style={{ color: '#86868b', transform: `translateZ(${(events.length + 1) * 50}px)` }}
            >
                CI/CD Timeline · {node.label}
            </motion.div>

            {/* Stacked cards — Apple frosted glass */}
            <AnimatePresence>
                {events.map((event, i) => {
                    const ss = STATUS_STYLE[event.status] || STATUS_STYLE.success;
                    const zOffset = (events.length - i) * 50;

                    return (
                        <motion.div
                            key={`${node.id}-${i}`}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.25, delay: i * 0.06 }}
                            style={{
                                transform: `translateZ(${zOffset}px)`,
                                transformStyle: 'preserve-3d',
                                width: 260,
                                marginBottom: 6,
                                padding: '10px 14px',
                                background: 'rgba(255,255,255,0.92)',
                                backdropFilter: 'blur(20px) saturate(1.8)',
                                WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
                                border: `1.5px solid ${ss.border}33`,
                                borderLeft: `3px solid ${ss.border}`,
                                borderRadius: 10,
                                boxShadow: '0 2px 10px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
                            }}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                    style={{ background: `${ss.badge}10`, color: ss.badge }}
                                >
                                    {ss.icon}
                                </span>
                                <span
                                    className="text-[11px] font-semibold uppercase tracking-wider"
                                    style={{ color: ss.badge, letterSpacing: '0.04em' }}
                                >
                                    {event.status.replace('_', ' ')}
                                </span>
                                <span className="ml-auto text-[9px] font-medium" style={{ color: '#aeaeb2' }}>
                                    {formatTimestamp(event.timestamp)}
                                </span>
                            </div>

                            <p className="text-[11px] leading-relaxed m-0" style={{ color: '#1d1d1f' }}>
                                {event.message}
                            </p>
                        </motion.div>
                    );
                })}
            </AnimatePresence>

            {/* Vertical connector */}
            <div
                className="absolute left-1/2 bottom-0 w-px"
                style={{
                    height: events.length * 56 + 30,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.1), rgba(0,0,0,0.02))',
                    transform: 'translateX(-50%)',
                    zIndex: -1,
                }}
            />
        </div>
    );
}

function formatTimestamp(ts) {
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            + ' · '
            + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return ts;
    }
}
