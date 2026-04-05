import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel, { GlassBadge } from './GlassPanel';
import { useAnalysis } from '../context/AnalysisContext';

export default function TopActionsDrawer({ theme = 'light', onNodeSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('risks');
  const isDark = theme === 'dark';

  const { topActions, topActionsLoading, loadTopActions } = useAnalysis();

  // Load top actions on mount
  useEffect(() => {
    loadTopActions(5);
  }, [loadTopActions]);

  const sections = [
    { id: 'risks', label: 'Risks', icon: '🔴', color: '#FF3B30' },
    { id: 'deletions', label: 'Safe to Delete', icon: '🟢', color: '#34C759' },
    { id: 'waste', label: 'Waste', icon: '🟡', color: '#FF9500' },
  ];

  const getItems = () => {
    if (!topActions) return [];
    if (activeSection === 'risks') return topActions.topRisks || [];
    if (activeSection === 'deletions') return topActions.safeDeletionCandidates || [];
    if (activeSection === 'waste') return topActions.wasteCandidates || [];
    return [];
  };

  const items = getItems();

  return (
    <div className="fixed bottom-7 left-8 z-50 select-none">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(p => !p)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
        style={{
          background: isDark ? 'rgba(44,44,46,0.9)' : 'rgba(255,255,255,0.9)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
          backdropFilter: 'blur(20px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 10px rgba(0,0,0,0.06)',
          color: isOpen ? '#007AFF' : (isDark ? '#aeaeb2' : '#86868b'),
        }}
      >
        <span>⚡</span>
        <span>Actions</span>
        <span className="text-[9px] opacity-50">{isOpen ? '▼' : '▲'}</span>
      </button>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: 20, opacity: 0, height: 0 }}
            animate={{ y: 0, opacity: 1, height: 'auto' }}
            exit={{ y: 20, opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="mb-2 overflow-hidden"
            style={{ position: 'absolute', bottom: '100%', left: 0, width: 320 }}
          >
            <GlassPanel intensity="high" className="border-white/10 shadow-2xl">
              {/* Section tabs */}
              <div className="flex p-2 gap-1 mx-3 mt-3 bg-black/5 dark:bg-white/5 rounded-xl">
                {sections.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`flex-1 py-1.5 text-[9px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                      activeSection === s.id
                        ? 'bg-white shadow-sm'
                        : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#fff]'
                    }`}
                    style={activeSection === s.id ? { color: s.color } : {}}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>

              {/* Items */}
              <div className="p-3 max-h-[280px] overflow-y-auto custom-scrollbar" style={{ overscrollBehavior: 'contain' }}>
                {topActionsLoading && (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
                    ))}
                  </div>
                )}

                {!topActionsLoading && items.length === 0 && (
                  <p className="text-[10px] text-center opacity-40 py-4">No items found.</p>
                )}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-2"
                  >
                    {items.map((item, i) => (
                      <button
                        key={item.nodeId || i}
                        onClick={() => {
                          if (onNodeSelect) onNodeSelect(item.nodeId);
                          setIsOpen(false);
                        }}
                        className="text-left p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold truncate max-w-[180px]" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
                            {item.label || item.nodeId}
                          </span>
                          <div className="flex items-center gap-2">
                            <GlassBadge color={
                              activeSection === 'risks' ? '#FF3B30' :
                              activeSection === 'deletions' ? '#34C759' : '#FF9500'
                            }>
                              {(item.score * 100).toFixed(0)}
                            </GlassBadge>
                            <span className="text-[9px] text-[#86868b]">{(item.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        {item.summary && (
                          <p className="text-[9px] leading-snug opacity-60 line-clamp-2">{item.summary}</p>
                        )}
                        {item.monthlyCost > 0 && (
                          <span className="text-[9px] font-medium text-[#FF9500]">${item.monthlyCost.toFixed(0)}/mo</span>
                        )}
                      </button>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
