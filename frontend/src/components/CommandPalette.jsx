import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CommandPalette — Apple Spotlight-style
 */
export default function CommandPalette({ nodes, edges, isOpen, onClose, onSelect }) {
    const [query, setQuery] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIdx(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const results = useMemo(() => {
        if (!query.trim()) return nodes;
        const q = query.toLowerCase();
        return nodes.filter(
            n =>
                n.id.toLowerCase().includes(q) ||
                n.label.toLowerCase().includes(q) ||
                n.type.toLowerCase().includes(q)
        );
    }, [nodes, query]);

    useEffect(() => {
        if (selectedIdx >= results.length) setSelectedIdx(Math.max(0, results.length - 1));
    }, [results.length, selectedIdx]);

    function handleKeyDown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIdx]) {
            e.preventDefault();
            onSelect(results[selectedIdx].id);
            onClose();
        } else if (e.key === 'Escape') {
            onClose();
        }
    }

    function connectedCount(nodeId) {
        return edges.filter(e => e.source_id === nodeId || e.target_id === nodeId).length;
    }

    const TYPE_ICONS = {
        aws_vpc: '🌐',
        aws_subnet: '📦',
        aws_instance: '🖥️',
        aws_db_instance: '🗄️',
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop — Apple light blur */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[1000]"
                        style={{
                            background: 'rgba(0,0,0,0.2)',
                            backdropFilter: 'blur(8px) saturate(1.5)',
                            WebkitBackdropFilter: 'blur(8px) saturate(1.5)',
                        }}
                    />

                    {/* Modal — Apple Spotlight */}
                    <motion.div
                        initial={{ opacity: 0, y: -12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -12, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="fixed z-[1001] left-1/2 top-[22%] -translate-x-1/2 w-[520px]"
                        style={{
                            background: 'rgba(255,255,255,0.95)',
                            backdropFilter: 'blur(40px) saturate(2)',
                            WebkitBackdropFilter: 'blur(40px) saturate(2)',
                            border: '1px solid rgba(0,0,0,0.1)',
                            borderRadius: 16,
                            boxShadow:
                                '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Search input */}
                        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="2" strokeLinecap="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search infrastructure…"
                                className="flex-1 bg-transparent outline-none text-[15px] text-[#1d1d1f] placeholder:text-[#aeaeb2]"
                                style={{ fontFamily: "'Inter', -apple-system, sans-serif", fontWeight: 400 }}
                            />
                            <kbd className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                                style={{ color: '#86868b', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}
                            >
                                ESC
                            </kbd>
                        </div>

                        {/* Results */}
                        <div className="max-h-[300px] overflow-y-auto py-1">
                            {results.length === 0 ? (
                                <div className="px-5 py-6 text-center text-sm" style={{ color: '#aeaeb2' }}>
                                    No matching nodes
                                </div>
                            ) : (
                                results.map((node, i) => (
                                    <button
                                        key={node.id}
                                        onClick={() => { onSelect(node.id); onClose(); }}
                                        onMouseEnter={() => setSelectedIdx(i)}
                                        className="w-full text-left px-5 py-3 flex items-center gap-3 cursor-pointer border-0 transition-colors"
                                        style={{
                                            background: i === selectedIdx ? 'rgba(0,122,255,0.08)' : 'transparent',
                                            borderLeft: i === selectedIdx ? '2px solid #007AFF' : '2px solid transparent',
                                        }}
                                    >
                                        <span className="text-lg">{TYPE_ICONS[node.type] || '⬡'}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[14px] font-medium truncate" style={{ color: '#1d1d1f' }}>{node.label}</div>
                                            <div className="text-[11px] truncate" style={{ color: '#86868b' }}>{node.id} · {node.type}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div
                                                className="text-[12px] font-medium"
                                                style={{
                                                    color:
                                                        node.metrics.current_load > 0.8 ? '#FF3B30' :
                                                            node.metrics.current_load > 0.5 ? '#FF9500' : '#34C759',
                                                }}
                                            >
                                                {(node.metrics.current_load * 100).toFixed(0)}%
                                            </div>
                                            <div className="text-[10px]" style={{ color: '#aeaeb2' }}>
                                                {connectedCount(node.id)} conn
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-2.5 flex gap-4 text-[10px] font-medium"
                            style={{ borderTop: '1px solid rgba(0,0,0,0.06)', color: '#aeaeb2' }}
                        >
                            <span>↑↓ navigate</span>
                            <span>↵ select & focus</span>
                            <span>esc close</span>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
