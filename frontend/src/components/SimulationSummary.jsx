import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from './GlassPanel';

export default function SimulationSummary({ deltaData, theme = 'light' }) {
    const isDark = theme === 'dark';
    if (!deltaData) return null;

    const { riskReduction, costDelta, criticalImpact } = deltaData;

    return (
        <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60]"
        >
            <GlassPanel intensity="medium" className="px-6 py-4 flex items-center gap-8 shadow-2xl border-white/10 min-w-max">
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase text-[#86868b] tracking-wider mb-1">Proposed Risk</span>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-bold ${riskReduction >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                            {riskReduction >= 0 ? '↓' : '↑'} {Math.abs(riskReduction).toFixed(1)}%
                        </span>
                        <span className="text-[10px] opacity-60 font-medium">System Impact</span>
                    </div>
                </div>

                <div className="w-px h-8 bg-white/10" />

                <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase text-[#86868b] tracking-wider mb-1">Cost Delta</span>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-bold ${costDelta <= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                            {costDelta <= 0 ? '-' : '+'} ${Math.abs(costDelta).toFixed(2)}
                        </span>
                        <span className="text-[10px] opacity-60 font-medium">Monthly Est.</span>
                    </div>
                </div>

                <div className="w-px h-8 bg-white/10" />

                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${criticalImpact ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                        {criticalImpact ? '⚠️' : '✅'}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[11px] font-bold leading-tight" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
                            {criticalImpact ? 'Drift Warning' : 'Safe Path'}
                        </span>
                        <span className="text-[9px] opacity-60">
                            {criticalImpact ? 'Breaks internal SLA' : 'Maintains compliance'}
                        </span>
                    </div>
                </div>

                <button className="ml-4 px-4 py-2 bg-white/10 hover:bg-white/20 transition-colors rounded-lg text-xs font-bold border border-white/10">
                    Apply Changes
                </button>
            </GlassPanel>
        </motion.div>
    );
}
