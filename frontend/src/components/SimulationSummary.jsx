import { motion } from 'framer-motion';
import GlassPanel from './GlassPanel';
import { useAnalysis } from '../context/AnalysisContext';

export default function SimulationSummary({ theme = 'light' }) {
  const isDark = theme === 'dark';
  const { simulationResult, simulationLoading, blastRadius } = useAnalysis();

  // Show real simulation data if available, else show blast radius summary
  const hasSimulation = simulationResult && !simulationLoading;
  const broken = hasSimulation ? simulationResult.brokenNodes?.length || 0 : 0;
  const degraded = hasSimulation ? simulationResult.degradedNodes?.length || 0 : 0;
  const unaffected = hasSimulation ? simulationResult.unaffectedNodes?.length || 0 : 0;
  const totalImpact = broken + degraded;

  // Fallback to blast radius stats if no simulation has run
  const impactScore = hasSimulation ? null : blastRadius?.impactScore;
  const affectedCount = hasSimulation ? null : blastRadius?.impactedNodeCount;

  if (!hasSimulation && !blastRadius) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60]"
    >
      <GlassPanel intensity="medium" className="px-6 py-4 flex items-center gap-8 shadow-2xl border-white/10 min-w-max">
        {hasSimulation ? (
          <>
            {/* Broken count */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-[#86868b] tracking-wider mb-1">Broken</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-lg font-bold ${broken > 0 ? 'text-[#FF3B30]' : 'text-[#34C759]'}`}>
                  {broken}
                </span>
                <span className="text-[10px] opacity-60 font-medium">services</span>
              </div>
            </div>

            <div className="w-px h-8 bg-white/10" />

            {/* Degraded count */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-[#86868b] tracking-wider mb-1">Degraded</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-lg font-bold ${degraded > 0 ? 'text-[#FF9500]' : 'text-[#34C759]'}`}>
                  {degraded}
                </span>
                <span className="text-[10px] opacity-60 font-medium">services</span>
              </div>
            </div>

            <div className="w-px h-8 bg-white/10" />

            {/* Unaffected count */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-[#86868b] tracking-wider mb-1">Unaffected</span>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-[#34C759]">{unaffected}</span>
                <span className="text-[10px] opacity-60 font-medium">services</span>
              </div>
            </div>

            <div className="w-px h-8 bg-white/10" />

            {/* Status indicator */}
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${broken > 0 ? 'bg-red-500/20 text-red-500' : degraded > 0 ? 'bg-orange-500/20 text-orange-500' : 'bg-green-500/20 text-green-500'}`}>
                {broken > 0 ? '⚠️' : degraded > 0 ? '⚡' : '✅'}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold leading-tight" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
                  {broken > 0 ? 'Breaking Changes' : degraded > 0 ? 'Partial Degradation' : 'Clean Removal'}
                </span>
                <span className="text-[9px] opacity-60">
                  {broken > 0 ? `${broken} service${broken > 1 ? 's' : ''} will fail` : degraded > 0 ? 'Fallback routes available' : 'No downstream impact'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Blast radius fallback */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-[#86868b] tracking-wider mb-1">Impact Score</span>
              <span className={`text-lg font-bold ${impactScore > 50 ? 'text-[#FF3B30]' : 'text-[#34C759]'}`}>
                {impactScore?.toFixed(0) || 0}/100
              </span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-[#86868b] tracking-wider mb-1">Affected</span>
              <span className="text-lg font-bold text-[#007AFF]">{affectedCount || 0} nodes</span>
            </div>
          </>
        )}
      </GlassPanel>
    </motion.div>
  );
}
