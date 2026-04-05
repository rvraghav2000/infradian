import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel, { GlassBadge } from './GlassPanel';
import { useAnalysis } from '../context/AnalysisContext';

export default function TopActionsDrawer({ theme = 'light', onNodeSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('fix');
  const isDark = theme === 'dark';

  const { topActions, topActionsLoading, loadTopActions } = useAnalysis();

  // Load top actions on mount
  useEffect(() => {
    loadTopActions(5);
  }, [loadTopActions]);

  const sections = [
    { id: 'fix', label: 'Risks', icon: '🔴', color: '#FF3B30' },
    { id: 'delete', label: 'Safe Deletes', icon: '🟢', color: '#34C759' },
    { id: 'optimize', label: 'Waste', icon: '🟡', color: '#FF9500' },
    { id: 'investigate', label: 'Unknowns', icon: '🔎', color: '#007AFF' },
  ];

  const getItems = () => {
    if (!topActions) return [];
    if (activeSection === 'fix') return topActions.topRisks || [];
    if (activeSection === 'delete') return topActions.safeDeletionCandidates || [];
    if (activeSection === 'optimize') return topActions.wasteCandidates || [];
    if (activeSection === 'investigate') return topActions.investigationCandidates || [];
    return [];
  };

  const items = getItems();

  return (
    <div className="fixed bottom-7 left-8 z-50 select-none">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(p => !p)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border-0 shadow cursor-pointer"
        style={{
          background: isDark ? 'rgba(44,44,46,0.95)' : 'rgba(255,255,255,0.95)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
          backdropFilter: 'blur(20px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.6)' : '0 4px 16px rgba(0,0,0,0.1)',
          color: isOpen ? '#007AFF' : (isDark ? '#aeaeb2' : '#86868b'),
        }}
      >
        <span>⚡</span>
        <span>Actions</span>
        <span className="text-[9px] opacity-50 ml-1">{isOpen ? '▼' : '▲'}</span>
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
            style={{ position: 'absolute', bottom: '100%', left: 0, width: 340 }}
          >
            <GlassPanel intensity="high" className="border-white/10 shadow-2xl">
              {/* Section tabs */}
              <div className="flex p-2 gap-1 mx-3 mt-3 bg-black/5 dark:bg-white/5 rounded-xl border border-white/5">
                {sections.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`flex-1 py-1.5 text-[9px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 border-0 cursor-pointer ${
                      activeSection === s.id
                        ? 'bg-white dark:bg-[#1c1c1e] shadow-sm'
                        : 'bg-transparent text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#fff]'
                    }`}
                    style={activeSection === s.id ? { color: s.color } : {}}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>

              {/* Items */}
              <div className="p-3 max-h-[320px] overflow-y-auto custom-scrollbar" style={{ overscrollBehavior: 'contain' }}>
                {topActionsLoading && (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />
                    ))}
                  </div>
                )}

                {!topActionsLoading && items.length === 0 && (
                  <p className="text-[10px] text-center opacity-40 py-8 font-medium">No actions needed here.</p>
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
                        key={item.id || i}
                        onClick={() => {
                          if (onNodeSelect) onNodeSelect(item.nodeId);
                          setIsOpen(false);
                        }}
                        className="text-left p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all flex flex-col gap-1.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold truncate flex-1" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
                            {item.title || item.nodeId}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.costDelta > 0 && (
                              <span className="text-[10px] font-bold text-[#34C759] bg-[#34C759]/10 px-1.5 py-0.5 rounded">
                                +${item.costDelta.toFixed(0)}/mo
                              </span>
                            )}
                            <GlassBadge color={
                              activeSection === 'fix' ? '#FF3B30' :
                              activeSection === 'delete' ? '#34C759' : 
                              activeSection === 'optimize' ? '#FF9500' : '#007AFF'
                            }>
                              {(item.score * 100).toFixed(0)}
                            </GlassBadge>
                          </div>
                        </div>
                        
                        {item.summary && (
                          <p className="text-[10px] leading-snug opacity-70 mb-0.5">{item.summary}</p>
                        )}
                        
                        <div className="flex items-center gap-2 mt-1">
                           <div className="flex items-center gap-1.5 flex-1 w-full bg-black/10 dark:bg-white/10 p-1.5 rounded-lg">
                               <span className="text-[9px] font-bold uppercase text-[#86868b] w-8">Conf</span>
                               <div className="flex-1 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                                  <div 
                                    className="h-full rounded-full" 
                                    style={{ 
                                        width: `${(item.confidence * 100)}%`,
                                        background: item.confidence > 0.7 ? '#34C759' : item.confidence > 0.4 ? '#FF9500' : '#FF3B30'
                                    }} 
                                  />
                               </div>
                           </div>
                           
                           {item.affectedSystems > 0 && (
                               <span className="text-[9px] font-medium text-[#FF3B30] whitespace-nowrap">
                                   {item.affectedSystems} affected
                               </span>
                           )}
                        </div>
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
