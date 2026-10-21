import { motion } from 'framer-motion';
import GlassPanel, { GlassBadge } from './GlassPanel';

export default function NodeHoverPreview({ node, theme = 'light' }) {
    const isDark = theme === 'dark';
    const risk = node.attributes?.risk || 0;
    const cost = node.attributes?.monthly_cost || 0;
    const load = (node.metrics?.current_load || 0) * 100;

    const getRiskColor = (r) => {
        if (r > 70) return '#FF3B30';
        if (r > 30) return '#FF9500';
        return '#34C759';
    };

    return (
        <GlassPanel 
            intensity="medium"
            className="p-3 w-56 flex flex-col gap-2.5 z-[1000]"
            style={{ pointerEvents: 'none' }}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.15 }}
        >
            <div className="flex flex-col">
                <span className="text-[12px] font-bold truncate leading-tight" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
                    {node.label}
                </span>
                <span className="text-[9px] font-medium" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>
                    {node.id}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col">
                    <span className="text-[8px] uppercase tracking-wider font-bold mb-0.5" style={{ color: '#86868b' }}>Blast Radius</span>
                    <span className="text-[14px] font-bold" style={{ color: getRiskColor(risk) }}>{risk.toFixed(0)}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] uppercase tracking-wider font-bold mb-0.5" style={{ color: '#86868b' }}>Monthly Cost</span>
                    <span className="text-[14px] font-bold" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>${cost.toFixed(0)}</span>
                </div>
            </div>

            <div className="h-px bg-white/10" />

            <div className="flex items-center justify-between">
                <GlassBadge color="#007AFF" className="opacity-80">
                    LOAD {load.toFixed(0)}%
                </GlassBadge>
                {risk > 50 && (
                    <GlassBadge color="#FF3B30" className="animate-pulse">
                        HIGH RISK
                    </GlassBadge>
                )}
            </div>

            <p className="text-[9px] leading-snug italic" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>
                {risk > 50 
                    ? "Critical point: impact spans multiple regions." 
                    : "Low structural impact on dependency chain."}
            </p>
        </GlassPanel>
    );
}
