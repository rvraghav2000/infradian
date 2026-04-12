import { motion } from 'framer-motion';
import { useAnalysis } from '../context/AnalysisContext';

const LAYER_COLORS = {
  runtime: '#007AFF',
  structural: '#8E8E93',
  data: '#AF52DE',
  control_plane: '#FF9500',
  eventing: '#34C759',
};

/**
 * ReadinessBadge — Floating radial scores for completeness/readiness/confidence.
 * Appears in draft/simulation mode only. Glassmorphism-consistent.
 */
export default function ReadinessBadge({ theme = 'light' }) {
  const isDark = theme === 'dark';
  const { readinessResult, readinessLoading, isSimulationMode, validationResult } = useAnalysis();

  if (!isSimulationMode) return null;

  const scores = readinessResult || {};
  const completeness = scores.completeness?.score ?? 0;
  const readiness = scores.readiness?.score ?? 0;
  const confidence = scores.confidence?.score ?? 0;
  const overall = scores.overallScore ?? 0;
  const warnings = scores.warnings?.length ?? 0;
  const validationErrors = validationResult?.errorCount ?? 0;
  const validationWarnings = validationResult?.warningCount ?? 0;

  const getColor = (v) => v >= 80 ? '#34C759' : v >= 50 ? '#FF9500' : '#FF3B30';

  const RadialScore = ({ value, label, size = 44 }) => {
    const radius = (size - 6) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    const color = getColor(value);

    return (
      <div className="flex flex-col items-center gap-1">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} strokeWidth={3} />
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
              stroke={color} strokeWidth={3}
              strokeDasharray={circumference} strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-bold" style={{ color }}>{Math.round(value)}</span>
          </div>
        </div>
        <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: '#86868b' }}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      className="fixed bottom-[140px] right-6 z-[45] select-none scale-[0.80] origin-bottom-right"
    >
      <div
        className="rounded-2xl p-3 flex flex-col gap-3"
        style={{
          background: isDark ? 'rgba(30,30,32,0.9)' : 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(24px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.08)',
          minWidth: 160,
        }}
      >
        {/* Title */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#86868b' }}>
            Readiness
          </span>
          {readinessLoading && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-pulse" />
          )}
        </div>

        {/* Overall score */}
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <RadialScore value={overall} label="Overall" size={56} />
          </div>
        </div>

        {/* Sub-scores */}
        <div className="flex justify-between px-1">
          <div className="relative">
            <RadialScore value={completeness} label="Complete" size={38} />
          </div>
          <div className="relative">
            <RadialScore value={readiness} label="Ready" size={38} />
          </div>
          <div className="relative">
            <RadialScore value={confidence} label="Confident" size={38} />
          </div>
        </div>

        {/* Warnings summary */}
        {(validationErrors > 0 || validationWarnings > 0) && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
            style={{ background: isDark ? 'rgba(255,59,48,0.1)' : 'rgba(255,59,48,0.06)' }}
          >
            <span className="text-[10px]">⚠</span>
            <span className="text-[9px] font-medium" style={{ color: '#FF3B30' }}>
              {validationErrors > 0 && `${validationErrors} error${validationErrors !== 1 ? 's' : ''}`}
              {validationErrors > 0 && validationWarnings > 0 && ', '}
              {validationWarnings > 0 && `${validationWarnings} warning${validationWarnings !== 1 ? 's' : ''}`}
            </span>
          </div>
        )}

        {/* Summary text */}
        {scores.summary && (
          <p className="text-[9px] leading-snug px-1 opacity-60" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
            {scores.summary}
          </p>
        )}
      </div>
    </motion.div>
  );
}
