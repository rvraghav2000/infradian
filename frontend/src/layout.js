/**
 * layout.js — Auto-Layout Engine for Infradian
 *
 * Swimlane Architecture Setup:
 *   1. Assign Column (Tier) dynamically using Topo-Sort on edges to guarantee strictly left-to-right flows.
 *   2. Group into Rows (Lanes) based on parent_id (Subnet).
 *   3. Position nodes compactly within this grid.
 *   4. Compute Region bounds bottom-up (Subnets → VPCs).
 */

/* ── Tier assignment by node type ──────────────────────────────── */

const TIER_MAP = {
    aws_route53: 0,
    aws_cloudfront: 1,
    aws_waf: 2,
    cicd_github_actions: 0,
    sre_pagerduty: 0,
    aws_alb: 3,
    aws_instance: 4,
    aws_lambda: 5,
    aws_db_instance: 6,
    aws_elasticache: 6,
    aws_s3: 7,
    aws_cloudwatch: 0,
    aws_secrets_manager: 7,
};

/* ── Node categories for visual styling ────────────────────────── */

export const NODE_CATEGORIES = {
    aws_vpc: { category: 'region', icon: '🌐', color: '#007AFF', label: 'VPC' },
    aws_subnet: { category: 'region', icon: '📦', color: '#5856D6', label: 'Subnet' },
    aws_route53: { category: 'network', icon: '🔀', color: '#007AFF', label: 'DNS' },
    aws_cloudfront: { category: 'network', icon: '⚡', color: '#007AFF', label: 'CDN' },
    aws_waf: { category: 'security', icon: '🛡️', color: '#FF9500', label: 'WAF' },
    aws_alb: { category: 'network', icon: '⚖️', color: '#007AFF', label: 'Load Balancer' },
    aws_instance: { category: 'compute', icon: '🖥️', color: '#34C759', label: 'EC2' },
    aws_lambda: { category: 'compute', icon: '⚡', color: '#AF52DE', label: 'Lambda' },
    aws_db_instance: { category: 'data', icon: '🗄️', color: '#FF3B30', label: 'RDS' },
    aws_elasticache: { category: 'data', icon: '⚡', color: '#FF9500', label: 'Cache' },
    aws_s3: { category: 'data', icon: '📁', color: '#34C759', label: 'S3' },
    cicd_github_actions: { category: 'cicd', icon: '🔄', color: '#5856D6', label: 'CI/CD' },
    aws_cloudwatch: { category: 'observability', icon: '📊', color: '#007AFF', label: 'Monitoring' },
    sre_pagerduty: { category: 'observability', icon: '🔔', color: '#FF3B30', label: 'Alerting' },
    aws_secrets_manager: { category: 'security', icon: '🔑', color: '#FF9500', label: 'Secrets' },
};

export function getCategoryMeta(type) {
    return NODE_CATEGORIES[type] || { category: 'compute', icon: '⬡', color: '#86868b', label: type };
}

/* ── Layout constants ──────────────────────────────────────────── */

const NODE_W = 180;
const NODE_H = 56;
const TIER_GAP_X = 220;      // horizontal gap between columns
const NODE_GAP_Y = 24;       // vertical gap between nodes in same cell
const GROUP_GAP_Y = 64;      // vertical padding between swimlanes
const REGION_PAD_X = 28;
const REGION_PAD_Y = 28;
const REGION_HEADER = 36;
const CANVAS_PAD = 100;

const REGION_TYPES = new Set(['aws_vpc', 'aws_subnet']);

import dagre from 'dagre';

/* ── Main layout function ──────────────────────────────────────── */

export function computeLayout(nodes, edges) {
    const parentMap = {};
    for (const n of nodes) {
        if (n.parent_id) parentMap[n.id] = n.parent_id;
    }

    const g = new dagre.graphlib.Graph({ compound: true, directed: true });
    g.setGraph({
        rankdir: 'LR',
        align: 'UL',
        nodesep: 40,
        edgesep: 20,
        ranksep: 180,
        marginx: CANVAS_PAD,
        marginy: CANVAS_PAD,
    });
    g.setDefaultEdgeLabel(() => ({}));

    // 1. Add all nodes
    for (const n of nodes) {
        const isRegion = REGION_TYPES.has(n.type);
        if (isRegion) {
            g.setNode(n.id, { label: n.label, isRegion: true, clusterLabelPos: 'top' });
        } else {
            g.setNode(n.id, { label: n.label, width: NODE_W, height: NODE_H, isRegion: false });
        }
    }

    // 2. Set structural clusters
    for (const n of nodes) {
        if (n.parent_id && g.hasNode(n.parent_id)) {
            g.setParent(n.id, n.parent_id);
        }
    }

    // 3. Add visual edges
    for (const e of edges) {
        if (g.hasNode(e.source_id) && g.hasNode(e.target_id)) {
            g.setEdge(e.source_id, e.target_id);
        }
    }

    // Run layout
    dagre.layout(g);

    const layoutNodes = {};
    const nodeMap = {};
    for (const n of nodes) nodeMap[n.id] = n;

    g.nodes().forEach(id => {
        const dNode = g.node(id);
        const n = nodeMap[id];
        if (!dNode || !n) return;

        if (dNode.isRegion) {
            // Dagre computes the total bounding box center and size for clusters
            // We pad it slightly to look more like our region boxes
            const rx = dNode.x - dNode.width / 2 - REGION_PAD_X;
            const ry = dNode.y - dNode.height / 2 - REGION_HEADER;
            const rw = dNode.width + REGION_PAD_X * 2;
            const rh = dNode.height + REGION_HEADER + REGION_PAD_Y;
            
            layoutNodes[id] = {
                x: rx,
                y: ry,
                w: Math.max(rw, 200), // Enforce min width
                h: rh,
                node: n,
                isRegion: true
            };
        } else {
            // For standard nodes, dagre coordinates are the center
            layoutNodes[id] = {
                x: dNode.x - dNode.width / 2,
                y: dNode.y - dNode.height / 2,
                w: dNode.width,
                h: dNode.height,
                node: n,
                isRegion: false
            };
        }
    });

    const allLayouts = Object.values(layoutNodes);
    if (allLayouts.length === 0) {
        return { layoutNodes, canvasSize: { width: 1200, height: 800 } };
    }

    const canvasW = Math.max(...allLayouts.map(l => l.x + l.w)) + CANVAS_PAD;
    const canvasH = Math.max(...allLayouts.map(l => l.y + l.h)) + CANVAS_PAD;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

    return {
        layoutNodes,
        canvasSize: { width: Math.max(canvasW, vw), height: Math.max(canvasH, vh) },
    };
}

/* ── Edge path computation (Orthogonal Curved) ─────────────────── */

export function computeEdgePath(srcLayout, tgtLayout) {
    const sx = srcLayout.x + srcLayout.w;
    const sy = srcLayout.y + srcLayout.h / 2;
    const tx = tgtLayout.x;
    const ty = tgtLayout.y + tgtLayout.h / 2;

    const dx = tx - sx;
    // Cubic bezier: control points are horizontally offset from start and end.
    // This creates a smooth curve without sharp 90-degree orthogonal overlaps.
    const cpOffset = Math.max(Math.abs(dx) / 2, 40);

    return `M ${sx} ${sy} C ${sx + cpOffset} ${sy}, ${tx - cpOffset} ${ty}, ${tx} ${ty}`;
}

export function computeEdgeLabelPos(srcLayout, tgtLayout) {
    const sx = srcLayout.x + srcLayout.w;
    const sy = srcLayout.y + srcLayout.h / 2;
    const tx = tgtLayout.x;
    const ty = tgtLayout.y + tgtLayout.h / 2;
    return { x: (sx + tx) / 2, y: (sy + ty) / 2 - 10 };
}

export { NODE_W, NODE_H };
