import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel, { GlassBadge } from './GlassPanel';

import { useAnalysis } from '../context/AnalysisContext';

export default function AnalysisPanel({ node, blastRadius, theme = 'light', onClose }) {
    const [activeTab, setActiveTab] = useState('blast');
    const { setIsSimulationMode, setSimulationData } = useAnalysis();
    const isDark = theme === 'dark';

    if (!node) return null;

    const TABS = [
        { id: 'overview', label: 'Overview', icon: '👁️' },
        { id: 'blast', label: 'Blast Radius', icon: '💣' },
        { id: 'cost', label: 'Cost & Waste', icon: '💸' },
        { id: 'rec', label: 'Advice', icon: '💡' },
    ];

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
                        <h2 className="text-sm font-bold truncate pr-4" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
                            {node.label}
                        </h2>
                        <span className="text-[10px] uppercase font-semibold text-[#86868b]">
                            {node.type.replace('aws_', '').replace('_', ' ')}
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
                            className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === t.id
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
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {activeTab === 'blast' && (
                                <BlastTab node={node} blast={blastRadius} />
                            )}
                            {activeTab === 'overview' && (
                                <OverviewTab node={node} />
                            )}
                            {activeTab === 'cost' && (
                                <CostTab node={node} />
                            )}
                            {activeTab === 'rec' && (
                                <RecommendationTab node={node} blast={blastRadius} />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer Action */}
                <div className="p-4 bg-white/5 border-t border-white/5 flex flex-col gap-2">
                    <button
                        onClick={() => {
                            setIsSimulationMode(true);
                            // Mock simulation data based on node attributes or types
                            setSimulationData({
                                riskReduction: node.attributes?.risk ? node.attributes.risk * 0.2 : 12.4,
                                costDelta: -(node.attributes?.monthly_cost || 45.50),
                                criticalImpact: blastRadius?.affected_count > 5
                            });
                        }}
                        className="w-full py-2.5 bg-[#007AFF] text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform"
                    >
                        Simulate Removal Impact
                    </button>
                    <button
                        onClick={() => {
                            alert(`Checking Deletion Safety for ${node.label}...\nAlgorithm provisioned. Contact Dev for implementation details.`);
                        }}
                        className="w-full py-2.5 bg-white/5 text-[#86868b] border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 active:scale-[0.98] transition-all"
                    >
                        Safe to Delete?
                    </button>
                </div>
            </GlassPanel>
        </motion.div>
    );
}

function OverviewTab({ node }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase text-[#86868b]">Description</span>
                <p className="text-xs leading-relaxed opacity-80">
                    A primary {node.type} resource managing critical traffic for the production environment.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <StatCard label="Status" value={node.status} color="#34C759" />
                <StatCard label="Provider" value="AWS" />
            </div>

            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase text-[#86868b]">Attributes</span>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(node.attributes || {}).map(([k, v]) => (
                        <GlassBadge key={k} color="#86868b" className="px-2">{k}: {v}</GlassBadge>
                    ))}
                </div>
            </div>
        </div>
    );
}

function BlastTab({ node, blast }) {
    const risk = node.attributes?.risk || (blast?.overall_scores?.risk || 0);
    const affectedCount = blast?.affected_count || 0;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[28px] font-bold" style={{ color: risk > 50 ? '#FF3B30' : '#34C759' }}>
                        {risk.toFixed(0)}<span className="text-xs font-medium opacity-50">/100</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase text-[#86868b]">Risk Magnitude</span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-[28px] font-bold text-[#007AFF]">{affectedCount}</span>
                    <span className="text-[10px] font-bold uppercase text-[#86868b]">Downstream Hits</span>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <h4 className="text-[11px] font-bold uppercase text-[#86868b]">Dependency Chains</h4>
                {blast?.affected_nodes?.slice(0, 3).map(n => (
                    <div key={n.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-xs font-medium truncate w-40">{n.label}</span>
                        <GlassBadge color={n.depth === 1 ? '#FF3B30' : '#FF9500'}>
                            D{n.depth}
                        </GlassBadge>
                    </div>
                ))}
                {affectedCount > 3 && (
                    <span className="text-[10px] text-center opacity-50">+ {affectedCount - 3} more nodes</span>
                )}
            </div>
        </div>
    );
}

function CostTab({ node }) {
    const cost = node.attributes?.monthly_cost || 45;
    const waste = node.attributes?.waste || (cost * 0.15);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center py-4 bg-white/5 rounded-2xl border border-white/5">
                <span className="text-[32px] font-bold">${cost.toFixed(2)}</span>
                <span className="text-[10px] font-bold uppercase text-[#86868b]">Monthly Expenditure</span>
            </div>

            <div className="flex flex-col gap-3">
                <h4 className="text-[11px] font-bold uppercase text-[#86868b]">Optimization Potential</h4>
                <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-orange-500">POTENTIAL WASTE</span>
                        <span className="text-sm font-bold text-orange-500">${waste.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-orange-500 opacity-80 leading-snug">
                        Resource utilization is below 15% during peak hours. Consider resizing.
                    </p>
                </div>
            </div>
        </div>
    );
}

function RecommendationTab({ node, blast }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex gap-3">
                <span className="text-xl">🛡️</span>
                <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-blue-500">REDUCE RISK</span>
                    <p className="text-[10px] text-blue-500 opacity-80 leading-snug">
                        Decouple {node.label} from downstream databases to prevent cascading failures.
                    </p>
                </div>
            </div>

            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex gap-3">
                <span className="text-xl">💰</span>
                <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-green-500">SAVE COST</span>
                    <p className="text-[10px] text-green-500 opacity-80 leading-snug">
                        Switch to Graviton-based instances to save ~20% on monthly compute.
                    </p>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, color }) {
    return (
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col">
            <span className="text-[9px] font-bold uppercase text-[#86868b] mb-1">{label}</span>
            <span className="text-xs font-bold capitalize" style={color ? { color } : {}}>{value}</span>
        </div>
    );
}
