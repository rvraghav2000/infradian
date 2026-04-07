import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel, { GlassBadge } from './GlassPanel';
import { useAnalysis } from '../context/AnalysisContext';

export default function AnalysisPanel({ node, theme = 'light', onClose, onDeleteNode }) {
  const [activeTab, setActiveTab] = useState('impact');
  const isDark = theme === 'dark';

  const {
    blastRadius, blastLoading,
    safeDeleteResult, safeDeleteLoading,
    simulationResult, simulationLoading,
    activePath, activePathStep,
    loadBlastRadius, loadSafeDelete, loadSimulation,
    selectPath, stepPath,
  } = useAnalysis();

  const isDraft = String(node?.id || '').startsWith('planned-');

  // Fetch blast radius + safe delete when node changes
  useEffect(() => {
    if (node?.id) {
      loadBlastRadius(node.id);
      loadSafeDelete(node.id);
    }
  }, [node?.id, loadBlastRadius, loadSafeDelete]);


  if (!node) return null;

  const TABS = [
    { id: 'impact', label: 'Impact', icon: '💥' },
    { id: 'paths', label: 'Paths', icon: '🔀' },
    { id: 'decision', label: 'Decision', icon: '🛡️' },
    { id: 'simulation', label: 'Simulate', icon: '🧪' },
  ];

  if (isDraft) {
    TABS.unshift({ id: 'config', label: 'Config', icon: '⚙️' });
  }


  const textPrimary = isDark ? '#fff' : '#1d1d1f';
  const textSecondary = '#86868b';

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      className="fixed top-24 right-6 w-96 h-[calc(100vh-140px)] z-50 flex flex-col"
    >
      <GlassPanel intensity="high" className="flex-1 flex flex-col border-white/10 shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold truncate" style={{ color: textPrimary }}>
                {node.label}
              </h2>
              {isDraft && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-widest text-[#FF9500] bg-[#FF9500]/10 uppercase">
                  Draft
                </span>
              )}
            </div>
            <span className="text-[10px] uppercase font-semibold mt-1" style={{ color: textSecondary }}>
              {node.type?.replace('aws_', '').replace(/_/g, ' ')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-1 bg-black/5 dark:bg-white/5 mx-4 mt-4 rounded-xl">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                (activeTab === t.id || (isDraft && t.id === 'config'))
                  ? 'bg-white shadow-sm text-[#007AFF]'
                  : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#fff]'
              }`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 pb-8 custom-scrollbar" style={{ overscrollBehavior: 'contain' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={isDraft ? 'config' : activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {isDraft ? (
                <div className="flex flex-col items-center justify-center pt-10 opacity-60">
                    <span className="text-4xl mb-3">⚙️</span>
                    <p className="text-xs text-center">Draft node configuration will be available soon.</p>
                </div>
              ) : (
                <>
                  {activeTab === 'impact' && <ImpactTab data={blastRadius} loading={blastLoading} isDark={isDark} />}
                  {activeTab === 'paths' && (
                    <PathsTab
                      data={blastRadius}
                      loading={blastLoading}
                      activePath={activePath}
                      activePathStep={activePathStep}
                      onSelectPath={selectPath}
                      onStepPath={stepPath}
                      isDark={isDark}
                    />
                  )}
                  {activeTab === 'decision' && <DecisionTab data={safeDeleteResult} loading={safeDeleteLoading} isDark={isDark} />}
                  {activeTab === 'simulation' && (
                    <SimulationTab
                      nodeId={node.id}
                      data={simulationResult}
                      loading={simulationLoading}
                      onRun={() => loadSimulation(node.id)}
                      isDark={isDark}
                    />
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white/5 border-t border-white/5 flex flex-col gap-2">
          {isDraft ? (
            <button
              onClick={() => onDeleteNode && onDeleteNode(node.id)}
              className="w-full py-2.5 bg-red-500/10 text-[#FF3B30] border border-red-500/20 rounded-xl text-xs font-bold hover:bg-red-500/20 active:scale-[0.98] transition-all"
            >
              Discard Planned Node
            </button>
          ) : (
            <>
              <button
                onClick={() => { loadSimulation(node.id); setActiveTab('simulation'); }}
                disabled={simulationLoading}
                className="w-full py-2.5 bg-[#007AFF] text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {simulationLoading ? 'Simulating…' : 'Simulate Removal'}
              </button>
              <button
                onClick={() => { loadSafeDelete(node.id); setActiveTab('decision'); }}
                disabled={safeDeleteLoading}
                className="w-full py-2.5 bg-white/5 text-[#86868b] border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {safeDeleteLoading ? 'Checking…' : 'Safe to Delete?'}
              </button>
            </>
          )}
        </div>
      </GlassPanel>
    </motion.div>
  );
}

/* ── Loading Skeleton ──────────────────────────────────────────── */
function LoadingPulse() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-6 rounded-lg bg-white/5 animate-pulse" />
      ))}
    </div>
  );
}

/* ── Confidence Bar ────────────────────────────────────────────── */
function ConfidenceBar({ value, label = 'Confidence' }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 70 ? '#34C759' : pct >= 40 ? '#FF9500' : '#FF3B30';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-[9px] font-bold uppercase text-[#86868b]">{label}</span>
        <span className="text-[10px] font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

/* ── IMPACT TAB ────────────────────────────────────────────────── */
function ImpactTab({ data, loading, isDark }) {
  if (loading) return <LoadingPulse />;
  if (!data) return <p className="text-xs opacity-50">Click a node to analyze impact.</p>;

  const impactScore = data.impactScore || 0;
  const affected = data.impactedNodeCount || 0;
  const critical = data.criticalNodesAffected || 0;
  const maxDepth = data.maxDepth || 0;
  const confidence = data.confidence?.overall || 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero metrics */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[28px] font-bold" style={{ color: impactScore > 50 ? '#FF3B30' : impactScore > 20 ? '#FF9500' : '#34C759' }}>
            {impactScore.toFixed(0)}<span className="text-xs font-medium opacity-50">/100</span>
          </span>
          <span className="text-[10px] font-bold uppercase text-[#86868b]">Impact Score</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-[28px] font-bold text-[#007AFF]">{affected}</span>
          <span className="text-[10px] font-bold uppercase text-[#86868b]">Nodes Affected</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Critical Nodes" value={critical} color={critical > 0 ? '#FF3B30' : '#34C759'} />
        <StatCard label="Max Depth" value={`${maxDepth} hops`} />
      </div>

      {/* Confidence */}
      <ConfidenceBar value={confidence} />

      {/* Summary */}
      {data.summary && (
        <p className="text-[11px] leading-relaxed opacity-70 p-3 rounded-xl bg-white/5 border border-white/5">
          {data.summary}
        </p>
      )}

      {/* Impacted nodes list */}
      {data.impactedNodes?.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[11px] font-bold uppercase text-[#86868b]">Affected Nodes</h4>
          {data.impactedNodes.slice(0, 6).map(n => (
            <div key={n.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
              <div className="flex flex-col">
                <span className="text-xs font-medium truncate max-w-[200px]">{n.label}</span>
                <span className="text-[9px] text-[#86868b]">{n.type}</span>
              </div>
              <div className="flex items-center gap-2">
                <GlassBadge color={n.isCritical ? '#FF3B30' : '#007AFF'}>
                  D{n.depth}
                </GlassBadge>
                <span className="text-[9px] text-[#86868b]">{n.cost?.toFixed(1)}</span>
              </div>
            </div>
          ))}
          {data.impactedNodes.length > 6 && (
            <span className="text-[10px] text-center opacity-50">+ {data.impactedNodes.length - 6} more</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── PATHS TAB ─────────────────────────────────────────────────── */
function PathsTab({ data, loading, activePath, activePathStep, onSelectPath, onStepPath, isDark }) {
  if (loading) return <LoadingPulse />;
  if (!data?.topPaths?.length) return <p className="text-xs opacity-50">No critical paths found.</p>;

  const paths = data.topPaths.slice(0, 8);

  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-[11px] font-bold uppercase text-[#86868b]">Critical Paths</h4>

      {/* Path list */}
      <div className="flex flex-col gap-2">
        {paths.map((p, i) => {
          const isActive = activePath && JSON.stringify(activePath.path) === JSON.stringify(p.path);
          return (
            <button
              key={i}
              onClick={() => onSelectPath(isActive ? null : p)}
              className={`text-left p-3 rounded-xl border transition-all ${
                isActive
                  ? 'bg-[#007AFF]/10 border-[#007AFF]/30'
                  : 'bg-white/5 border-white/5 hover:bg-white/10'
              }`}
            >
              <div className="flex justify-between items-start mb-1.5">
                <span className="text-[10px] font-bold" style={{ color: isActive ? '#007AFF' : '#86868b' }}>
                  PATH {i + 1}
                </span>
                <div className="flex gap-1.5">
                  {p.modes?.map((m, mi) => (
                    <GlassBadge key={mi} color={m === 'sync' ? '#007AFF' : m === 'async' ? '#FF9500' : '#86868b'}>
                      {m}
                    </GlassBadge>
                  ))}
                </div>
              </div>
              <p className="text-[10px] leading-snug opacity-70 truncate">{p.description}</p>
              <div className="flex gap-3 mt-1.5">
                <span className="text-[9px] text-[#86868b]">Cost: {p.cost}</span>
                <span className="text-[9px] text-[#86868b]">Score: {p.score}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hop stepper */}
      {activePath?.path && (
        <div className="flex flex-col gap-3 p-3 rounded-xl bg-white/5 border border-[#007AFF]/20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-[#007AFF]">Path Explorer</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onStepPath('prev')}
                disabled={activePathStep <= 0}
                className="w-6 h-6 rounded flex items-center justify-center bg-white/10 text-[10px] disabled:opacity-30 hover:bg-white/20 transition-colors"
              >
                ←
              </button>
              <span className="text-[10px] font-medium text-[#86868b]">
                {activePathStep + 1} / {activePath.path.length}
              </span>
              <button
                onClick={() => onStepPath('next')}
                disabled={activePathStep >= activePath.path.length - 1}
                className="w-6 h-6 rounded flex items-center justify-center bg-white/10 text-[10px] disabled:opacity-30 hover:bg-white/20 transition-colors"
              >
                →
              </button>
            </div>
          </div>

          {/* Current hop detail */}
          <div className="flex flex-col gap-1">
            {activePath.path.map((hopId, idx) => (
              <div
                key={hopId}
                className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                  idx === activePathStep ? 'bg-[#007AFF]/15 border border-[#007AFF]/30' : 'opacity-40'
                }`}
              >
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={{
                    background: idx === activePathStep ? '#007AFF' : 'rgba(255,255,255,0.1)',
                    color: idx === activePathStep ? '#fff' : '#86868b',
                  }}
                >
                  {idx + 1}
                </span>
                <span className="text-[11px] font-medium flex-1 truncate">{hopId}</span>
                {idx < activePath.path.length - 1 && activePath.modes?.[idx] && (
                  <GlassBadge color={
                    activePath.modes[idx] === 'sync' ? '#007AFF'
                    : activePath.modes[idx] === 'async' ? '#FF9500'
                    : '#86868b'
                  }>
                    {activePath.modes[idx]}
                  </GlassBadge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── DECISION TAB ──────────────────────────────────────────────── */
function DecisionTab({ data, loading, isDark }) {
  if (loading) return <LoadingPulse />;
  if (!data) return <p className="text-xs opacity-50">Click "Safe to Delete?" to evaluate.</p>;

  const decision = data.decision || 'UNCERTAIN';
  const confidence = data.confidence || 0;

  const decisionConfig = {
    SAFE_TO_DELETE: { color: '#34C759', bg: 'rgba(52,199,89,0.12)', icon: '✅', label: 'Safe to Delete' },
    UNSAFE_TO_DELETE: { color: '#FF3B30', bg: 'rgba(255,59,48,0.12)', icon: '🚫', label: 'Unsafe to Delete' },
    UNCERTAIN: { color: '#FF9500', bg: 'rgba(255,149,0,0.12)', icon: '⚠️', label: 'Uncertain' },
  }[decision] || { color: '#86868b', bg: 'rgba(134,134,139,0.12)', icon: '❓', label: decision };

  return (
    <div className="flex flex-col gap-5">
      {/* Decision badge */}
      <div className="flex flex-col items-center py-5 rounded-2xl border" style={{ background: decisionConfig.bg, borderColor: `${decisionConfig.color}30` }}>
        <span className="text-3xl mb-2">{decisionConfig.icon}</span>
        <span className="text-sm font-bold" style={{ color: decisionConfig.color }}>{decisionConfig.label}</span>
      </div>

      {/* Confidence */}
      <ConfidenceBar value={confidence} />

      {/* Summary */}
      {data.summary && (
        <p className="text-[11px] leading-relaxed opacity-70 p-3 rounded-xl bg-white/5 border border-white/5">
          {data.summary}
        </p>
      )}

      {/* Blockers */}
      {data.blockerReasons?.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[11px] font-bold uppercase text-[#FF3B30]">Blocking Reasons</h4>
          {data.blockerReasons.map((reason, i) => (
            <div key={i} className="p-2.5 rounded-xl bg-red-500/8 border border-red-500/15 flex items-start gap-2">
              <span className="text-[10px] mt-0.5">🔴</span>
              <span className="text-[10px] leading-snug opacity-80">{reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Evidence */}
      {data.evidenceReasons?.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[11px] font-bold uppercase text-[#34C759]">Supporting Evidence</h4>
          {data.evidenceReasons.map((reason, i) => (
            <div key={i} className="p-2.5 rounded-xl bg-green-500/8 border border-green-500/15 flex items-start gap-2">
              <span className="text-[10px] mt-0.5">🟢</span>
              <span className="text-[10px] leading-snug opacity-80">{reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Impact stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Impact Score" value={`${((data.impactScore || 0) * 100).toFixed(0)}%`} />
        <StatCard label="Critical Paths" value={data.criticalPaths || 0} />
      </div>
    </div>
  );
}

/* ── SIMULATION TAB ────────────────────────────────────────────── */
function SimulationTab({ nodeId, data, loading, onRun, isDark }) {
  if (!data && !loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <span className="text-3xl">🧪</span>
        <p className="text-xs text-center opacity-60 max-w-[240px]">
          Simulate what happens if this node is removed. See which services would break, degrade, or survive.
        </p>
        <button
          onClick={onRun}
          className="px-6 py-2.5 bg-[#007AFF] text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform"
        >
          Run Simulation
        </button>
      </div>
    );
  }

  if (loading) return <LoadingPulse />;

  const broken = data?.brokenNodes || [];
  const degraded = data?.degradedNodes || [];
  const unaffected = data?.unaffectedNodes || [];
  const totalAffected = broken.length + degraded.length + unaffected.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-2">
        <CountCard label="Broken" value={broken.length} color="#FF3B30" />
        <CountCard label="Degraded" value={degraded.length} color="#FF9500" />
        <CountCard label="Safe" value={unaffected.length} color="#34C759" />
      </div>

      {/* Confidence */}
      {data?.confidence && <ConfidenceBar value={data.confidence.overall} />}

      {/* Summary */}
      {data?.summary && (
        <p className="text-[11px] leading-relaxed opacity-70 p-3 rounded-xl bg-white/5 border border-white/5">
          {data.summary}
        </p>
      )}

      {/* Broken list */}
      {broken.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[11px] font-bold uppercase text-[#FF3B30]">Broken Services</h4>
          {broken.slice(0, 5).map(n => (
            <div key={n.id} className="p-2.5 rounded-xl bg-red-500/8 border border-red-500/15">
              <span className="text-[11px] font-medium">{n.label || n.id}</span>
              {n.detail && <p className="text-[9px] opacity-60 mt-0.5">{n.detail}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Degraded list */}
      {degraded.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[11px] font-bold uppercase text-[#FF9500]">Degraded Services</h4>
          {degraded.slice(0, 5).map(n => (
            <div key={n.id} className="p-2.5 rounded-xl bg-orange-500/8 border border-orange-500/15">
              <span className="text-[11px] font-medium">{n.label || n.id}</span>
              {n.detail && <p className="text-[9px] opacity-60 mt-0.5">{n.detail}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Re-run button */}
      <button
        onClick={onRun}
        className="w-full py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-[#86868b] hover:bg-white/10 active:scale-[0.98] transition-all"
      >
        Re-run Simulation
      </button>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────────────── */
function StatCard({ label, value, color }) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col">
      <span className="text-[9px] font-bold uppercase text-[#86868b] mb-1">{label}</span>
      <span className="text-xs font-bold capitalize" style={color ? { color } : {}}>{value}</span>
    </div>
  );
}

function CountCard({ label, value, color }) {
  return (
    <div className="flex flex-col items-center py-3 rounded-xl border" style={{ background: `${color}10`, borderColor: `${color}25` }}>
      <span className="text-lg font-bold" style={{ color }}>{value}</span>
      <span className="text-[9px] font-bold uppercase" style={{ color: `${color}99` }}>{label}</span>
    </div>
  );
}
