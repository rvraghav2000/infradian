import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import GlassPanel, { GlassBadge } from './GlassPanel';
import { useAnalysis } from '../context/AnalysisContext';
import { fetchDiff } from '../services/uimApi';

/**
 * DiffSummary — Compact bottom bar showing "Current vs Proposed" architecture delta.
 * Appears in draft/simulation mode when draft nodes exist.
 */
export default function DiffSummary({ theme = 'light', rawData = { nodes: [], edges: [] } }) {
  const isDark = theme === 'dark';
  const { isSimulationMode, draftData, ghostNodeIds } = useAnalysis();
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);

  // Auto-compute diff when draft changes
  useEffect(() => {
    // Show diff if we are in draft mode and have either added nodes or marked nodes for removal
    if (!isSimulationMode || (draftData.nodes.length === 0 && ghostNodeIds.size === 0)) {
      setDiff(null);
      return;
    }

    const computeDiff = async () => {
      setLoading(true);
      try {
        // Proposed = live + draft - ghost
        const proposedNodes = [...rawData.nodes, ...draftData.nodes]
           .filter(n => !ghostNodeIds.has(String(n.id)));
        
        const proposedEdges = [...rawData.edges, ...draftData.edges]
           .filter(e => !ghostNodeIds.has(String(e.source || e.source_id)) && !ghostNodeIds.has(String(e.target || e.target_id)));
        
        // fetchDiff compares a base engine (live) against proposed.
        const result = await fetchDiff(proposedNodes, proposedEdges);
        setDiff(result);
      } catch (e) {
        console.error('Diff computation failed:', e);
        setDiff(null);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(computeDiff, 500); // debounce
    return () => clearTimeout(timer);
  }, [isSimulationMode, draftData, rawData, ghostNodeIds]);

  if (!isSimulationMode || !diff) return null;

  const stats = diff.stats || {};
  const riskColor = diff.riskDelta > 0 ? '#FF3B30' : diff.riskDelta < 0 ? '#34C759' : '#86868b';
  const redundancyColor = diff.redundancyDelta > 0 ? '#34C759' : diff.redundancyDelta < 0 ? '#FF3B30' : '#86868b';

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[55]"
    >
      <GlassPanel intensity="medium" className="px-5 py-3 flex items-center gap-6 shadow-2xl border-white/10 min-w-max">
        {/* Title */}
        <div className="flex items-center gap-2">
          <span className="text-[10px]">⚡</span>
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#86868b' }}>
            Diff
          </span>
          {loading && <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-pulse" />}
        </div>

        <div className="w-px h-7" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />

        {/* Node changes */}
        <div className="flex items-center gap-3">
          {stats.nodesAdded > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-[#34C759]">+{stats.nodesAdded}</span>
              <span className="text-[9px] opacity-50">added</span>
            </div>
          )}
          {stats.nodesRemoved > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-[#FF3B30]">-{stats.nodesRemoved}</span>
              <span className="text-[9px] opacity-50">removed</span>
            </div>
          )}
          {stats.nodesModified > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-[#FF9500]">~{stats.nodesModified}</span>
              <span className="text-[9px] opacity-50">modified</span>
            </div>
          )}
          {stats.edgesAdded > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-[#007AFF]">+{stats.edgesAdded}</span>
              <span className="text-[9px] opacity-50">edges</span>
            </div>
          )}
          {stats.edgesRemoved > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-[#FF3B30]">-{stats.edgesRemoved}</span>
              <span className="text-[9px] opacity-50">edges</span>
            </div>
          )}
        </div>

        <div className="w-px h-7" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />

        {/* Risk & Redundancy deltas */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: '#86868b' }}>Risk</span>
            <span className="text-[11px] font-bold" style={{ color: riskColor }}>
              {diff.riskDelta > 0 ? '↑' : diff.riskDelta < 0 ? '↓' : '—'}
              {diff.riskDelta !== 0 && ` ${Math.abs(diff.riskDelta * 100).toFixed(0)}%`}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: '#86868b' }}>Redundancy</span>
            <span className="text-[11px] font-bold" style={{ color: redundancyColor }}>
              {diff.redundancyDelta > 0 ? '↑' : diff.redundancyDelta < 0 ? '↓' : '—'}
              {diff.redundancyDelta !== 0 && ` ${Math.abs(diff.redundancyDelta * 100).toFixed(0)}%`}
            </span>
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}
