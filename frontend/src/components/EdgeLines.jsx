import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { computeEdgePath, computeEdgeLabelPos } from '../layout';

/**
 * FlowConnectors — Curved horizontal/vertical SVG paths
 *
 * Uses quadratic Bézier curves to route edges:
 *   source →→ horizontal →→ curve →→ vertical →→ curve →→ target
 *
 * The ONLY element with rhythmic animation (glow + flowing dashes).
 */
export default function FlowConnectors({ edges, layoutNodes }) {
    const paths = useMemo(() => {
        if (!layoutNodes) return [];

        return edges
            .map((edge, i) => {
                const src = layoutNodes[edge.source_id];
                const tgt = layoutNodes[edge.target_id];
                if (!src || !tgt) return null;

                const d = computeEdgePath(src, tgt);
                const labelPos = computeEdgeLabelPos(src, tgt);

                return { key: `${edge.source_id}->${edge.target_id}`, d, label: edge.label, labelPos, index: i };
            })
            .filter(Boolean);
    }, [edges, layoutNodes]);

    if (paths.length === 0) return null;

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                overflow: 'visible',
                pointerEvents: 'none',
                zIndex: 5,
            }}
        >
            <defs>
                {/* Arrow marker */}
                <marker
                    id="flow-arrow"
                    viewBox="0 0 12 8"
                    refX="11"
                    refY="4"
                    markerWidth="8"
                    markerHeight="6"
                    orient="auto-start-reverse"
                >
                    <path d="M 0 0 L 12 4 L 0 8 Z" fill="#007AFF" opacity="0.5" />
                </marker>

                {/* Soft glow filter */}
                <filter id="connectorGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {paths.map((p) => (
                <motion.g
                    key={p.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 + p.index * 0.04 }}
                >
                    {/* Background path (subtle) */}
                    <path
                        d={p.d}
                        fill="none"
                        stroke="rgba(0,0,0,0.04)"
                        strokeWidth={2.5}
                    />

                    {/* Animated glowing path */}
                    <path
                        d={p.d}
                        fill="none"
                        stroke="#007AFF"
                        strokeWidth={1.5}
                        strokeDasharray="8 6"
                        markerEnd="url(#flow-arrow)"
                        className="edge-line-glow edge-line-flow"
                        filter="url(#connectorGlow)"
                    />

                    {/* Edge label */}
                    {p.label && (
                        <g>
                            {/* Label background pill */}
                            <rect
                                x={p.labelPos.x - (p.label.length * 3.5) - 6}
                                y={p.labelPos.y - 8}
                                width={p.label.length * 7 + 12}
                                height={16}
                                rx={8}
                                fill="rgba(255,255,255,0.92)"
                                stroke="rgba(0,0,0,0.06)"
                                strokeWidth={0.5}
                            />
                            <text
                                x={p.labelPos.x}
                                y={p.labelPos.y + 3}
                                fill="#86868b"
                                fontSize={9}
                                fontFamily="'Inter', -apple-system, sans-serif"
                                fontWeight="500"
                                textAnchor="middle"
                            >
                                {p.label}
                            </text>
                        </g>
                    )}
                </motion.g>
            ))}
        </svg>
    );
}
