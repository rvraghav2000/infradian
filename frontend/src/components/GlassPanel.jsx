import { motion } from 'framer-motion';

export default function GlassPanel({ 
    children, 
    className = "", 
    intensity = "medium", 
    hover = false,
    ...props 
}) {
    const blurAmount = {
        low: '10px',
        medium: '20px',
        high: '40px'
    }[intensity];

    const shadow = {
        low: '0 4px 12px rgba(0,0,0,0.05)',
        medium: '0 8px 32px rgba(0,0,0,0.1)',
        high: '0 12px 48px rgba(0,0,0,0.2)'
    }[intensity];

    return (
        <motion.div
            className={`rounded-2xl border border-white/20 overflow-hidden ${className}`}
            whileHover={hover ? { scale: 1.01, borderColor: 'rgba(255,255,255,0.3)' } : {}}
            style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: `blur(${blurAmount}) saturate(1.8)`,
                WebkitBackdropFilter: `blur(${blurAmount}) saturate(1.8)`,
                boxShadow: shadow,
                ...props.style
            }}
            {...props}
        >
            {children}
        </motion.div>
    );
}

export function GlassBadge({ children, color = "#007AFF", className = "" }) {
    return (
        <div 
            className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${className}`}
            style={{
                background: `${color}15`,
                color: color,
                border: `1px solid ${color}30`,
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
            }}
        >
            {children}
        </div>
    );
}
