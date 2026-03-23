import { useAnalysis, OVERLAY_TYPES } from '../context/AnalysisContext';
import { motion } from 'framer-motion';

export default function OverlayToggles({ theme = 'light' }) {
    const { activeOverlays, toggleOverlay } = useAnalysis();
    const isDark = theme === 'dark';

    const TOGGLES = [
        { id: OVERLAY_TYPES.RISK, label: 'Risk', icon: '🔥', color: '#FF3B30' },
        { id: OVERLAY_TYPES.COST, label: 'Cost', icon: '💰', color: '#34C759' },
        { id: OVERLAY_TYPES.TRAFFIC, label: 'Traffic', icon: '⚡', color: '#007AFF' },
        { id: OVERLAY_TYPES.CONFIDENCE, label: 'Accuracy', icon: '🎯', color: '#AF52DE' },
    ];

    return (
        <div 
            className="flex items-center gap-1 p-1 rounded-xl"
            style={{
                background: isDark ? 'rgba(30,30,32,0.4)' : 'rgba(255,255,255,0.4)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
            }}
        >
            {TOGGLES.map((t) => {
                const isActive = activeOverlays.has(t.id);
                return (
                    <motion.button
                        key={t.id}
                        onClick={() => toggleOverlay(t.id)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-2 px-3 h-8 rounded-lg cursor-pointer border-0 text-[10px] font-semibold transition-all"
                        style={{
                            background: isActive ? `${t.color}20` : 'transparent',
                            color: isActive ? t.color : (isDark ? '#aeaeb2' : '#86868b'),
                            boxShadow: isActive ? `0 0 12px ${t.color}20` : 'none',
                        }}
                    >
                        <span>{t.icon}</span>
                        <span className="hidden sm:inline">{t.label}</span>
                    </motion.button>
                );
            })}
        </div>
    );
}
