import { motion, AnimatePresence } from 'framer-motion';
import { getCategoryMeta } from '../layout';

export default function NodeDetailsModal({ nodeLayout, onClose, onDelete, theme }) {
    if (!nodeLayout || !nodeLayout.node) return null;

    const { node, w } = nodeLayout;
    const meta = getCategoryMeta(node.type);
    const attrs = node.attributes || {};
    const events = node.history || [];
    
    // Attempt to extract live load for the card clone
    const load = node.metrics?.current_load || 0;
    const lp = load > 0.8 ? { color: '#FF3B30' } : load > 0.5 ? { color: '#FF9500' } : { color: '#34C759' };

    const isDark = theme === 'dark';

    return (
        <AnimatePresence>
            {node && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-6"
                    style={{ pointerEvents: 'auto' }}
                >
                    {/* Blurred Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 cursor-pointer"
                        style={{
                            background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)',
                            backdropFilter: 'blur(24px) saturate(1.8)',
                            WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
                        }}
                        onClick={onClose}
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-2xl flex flex-col pointer-events-auto"
                        style={{
                            maxHeight: '85vh',
                            background: isDark ? '#2c2c2e' : '#ffffff',
                            borderRadius: 24,
                            boxShadow: isDark 
                                ? '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)' 
                                : '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                            overflow: 'hidden',
                        }}
                    >
                        {/* ── Top: Node Card Clone Elevated ── */}
                        <div 
                            className="shrink-0 p-6 flex flex-col gap-4 relative z-10"
                            style={{ 
                                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                            }}
                        >
                            {/* Close button top right */}
                            <button
                                onClick={onClose}
                                className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer border-0"
                                style={{ 
                                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)', 
                                    color: isDark ? '#aeaeb2' : '#86868b' 
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'}
                                onMouseLeave={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)'}
                            >
                                ✕
                            </button>

                            {/* Node Block Representation */}
                            <div
                                className="flex items-center gap-4 p-4 rounded-2xl w-full max-w-sm mx-auto shadow-lg"
                                style={{
                                    background: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                                    border: `1.5px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                                }}
                            >
                                {/* Icon badge */}
                                <div
                                    className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                                    style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}
                                >
                                    {meta.icon}
                                </div>

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-[14px] font-semibold truncate leading-tight" style={{ color: isDark ? 'rgba(255,255,255,0.9)' : '#1d1d1f' }}>
                                        {node.label}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[11px] font-medium" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>{meta.label}</span>
                                        <span className="text-[10px]" style={{ color: isDark ? '#636366' : '#d1d1d6' }}>·</span>
                                        <span className="text-[11px] font-medium" style={{ color: lp.color }}>
                                            {(load * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </div>

                                {/* Pipeline count badge */}
                                {events.length > 0 && (
                                    <div
                                        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                                        style={{ background: 'rgba(0,122,255,0.1)', color: '#007AFF' }}
                                    >
                                        {events.length}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Bottom: Raw Properties ── */}
                        <div className="flex-1 overflow-y-auto p-6" style={{ background: isDark ? '#2c2c2e' : '#fff' }}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: isDark ? '#86868b' : '#86868b', letterSpacing: '0.05em' }}>
                                    Terraform Configuration Attributes
                                </h3>
                                {node.id.startsWith('planned-') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                                        className="text-[10px] font-bold uppercase tracking-tight px-3 py-1.5 rounded-lg border-0 cursor-pointer transition-all"
                                        style={{
                                            background: isDark ? 'rgba(255,59,48,0.1)' : 'rgba(255,59,48,0.08)',
                                            color: '#FF3B30',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,59,48,0.2)' : 'rgba(255,59,48,0.15)'}
                                        onMouseLeave={e => e.currentTarget.style.background = isDark ? 'rgba(255,59,48,0.1)' : 'rgba(255,59,48,0.08)'}
                                    >
                                        Delete Resource
                                    </button>
                                )}
                            </div>
                            
                            {Object.keys(attrs).length === 0 ? (
                                <div className="text-sm italic" style={{ color: isDark ? '#636366' : '#aeaeb2' }}>
                                    No configuration data available.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-px rounded-xl overflow-hidden" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                                    {Object.entries(attrs).map(([key, value]) => {
                                        const displayValue = typeof value === 'object' && value !== null
                                            ? JSON.stringify(value, null, 2)
                                            : String(value);

                                        return (
                                            <div key={key} className="flex flex-col gap-1.5 p-4" style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff' }}>
                                                <span className="text-[10px] font-medium uppercase" style={{ color: isDark ? '#aeaeb2' : '#86868b', letterSpacing: '0.02em' }}>
                                                    {key}
                                                </span>
                                                <span 
                                                    className="text-[12px] break-words" 
                                                    style={{ 
                                                        color: isDark ? 'rgba(255,255,255,0.85)' : '#1d1d1f',
                                                        whiteSpace: typeof value === 'object' && value !== null ? 'pre-wrap' : 'normal',
                                                        fontFamily: 'SFMono-Regular, Consolas, monospace',
                                                        lineHeight: '1.5'
                                                    }}
                                                >
                                                    {displayValue}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
