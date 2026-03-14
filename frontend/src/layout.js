/**
 * layout.js — Auto-Layout Engine for Infradian
 *
 * Takes a flat list of nodes + edges and computes { x, y } positions
 * using a tiered horizontal flow layout.
 *
 * Layout strategy:
 *   1. Assign each node to a "tier" (column) based on its role in the flow
 *   2. Within each tier, stack nodes vertically with spacing
 *   3. Parent regions (VPC, Subnet) are computed as bounding boxes around children
 */

/* ── Tier assignment by node type ──────────────────────────────── */

const TIER_MAP = {
    // Tier 0 — Entry / External
    aws_route53: 0,
    aws_cloudfront: 1,
    aws_waf: 2,
    cicd_github_actions: 0,
    sre_pagerduty: 0,

    // Tier 1 — Edge / Load Balancing
    aws_alb: 3,

    // Tier 2 — Compute (Web)
    aws_instance: 4,

    // Tier 3 — Compute (App) + Serverless
    aws_lambda: 5,

    // Tier 4 — Data
    aws_db_instance: 6,
    aws_elasticache: 6,
    aws_s3: 7,

    // Observability / Security
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

const NODE_W = 160;
const NODE_H = 72;
const TIER_GAP_X = 220;     // horizontal gap between tiers
const NODE_GAP_Y = 32;      // vertical gap between nodes in same tier
const REGION_PAD = 32;       // padding inside region boundaries
const CANVAS_PAD = 80;       // padding around entire canvas

/* ── Container types ───────────────────────────────────────────── */

const REGION_TYPES = new Set(['aws_vpc', 'aws_subnet']);

/* ── Main layout function ──────────────────────────────────────── */

/**
 * Computes positions for all nodes.
 *
 * Returns:
 *   layoutNodes: Map<nodeId, { x, y, w, h, node, isRegion }>
 *   canvasSize:  { width, height }
 */
export function computeLayout(nodes, edges) {
    const nodeMap = {};
    for (const n of nodes) nodeMap[n.id] = n;

    // Separate regions from leaf nodes
    const regions = nodes.filter(n => REGION_TYPES.has(n.type));
    const leaves = nodes.filter(n => !REGION_TYPES.has(n.type));

    // 1. Assign tiers
    const tierAssign = {};
    for (const n of leaves) {
        tierAssign[n.id] = resolveTier(n, leaves, edges, nodeMap);
    }

    // 2. Group by tier
    const tierGroups = {};
    for (const n of leaves) {
        const t = tierAssign[n.id];
        if (!tierGroups[t]) tierGroups[t] = [];
        tierGroups[t].push(n);
    }

    // Sort tiers numerically
    const sortedTiers = Object.keys(tierGroups).map(Number).sort((a, b) => a - b);

    // 3. Position nodes
    const layoutNodes = {};
    let curX = CANVAS_PAD;

    // Separate "external" nodes (tier 0 nodes that aren't in a VPC)
    // into top/bottom lanes
    for (const tier of sortedTiers) {
        const group = tierGroups[tier];

        // Sort within tier for visual consistency
        group.sort((a, b) => a.label.localeCompare(b.label));

        const totalH = group.length * (NODE_H + NODE_GAP_Y) - NODE_GAP_Y;
        let curY = CANVAS_PAD + Math.max(0, (600 - totalH) / 2); // center vertically

        for (const n of group) {
            layoutNodes[n.id] = {
                x: curX,
                y: curY,
                w: NODE_W,
                h: NODE_H,
                node: n,
                isRegion: false,
            };
            curY += NODE_H + NODE_GAP_Y;
        }

        curX += NODE_W + TIER_GAP_X;
    }

    // 4. Compute region boundaries around children
    for (const region of regions) {
        const childIds = nodes
            .filter(n => n.parent_id === region.id)
            .map(n => n.id);

        const childLayouts = childIds
            .map(id => layoutNodes[id])
            .filter(Boolean);

        if (childLayouts.length === 0) {
            // Region with no positioned children — place near center
            layoutNodes[region.id] = {
                x: CANVAS_PAD,
                y: CANVAS_PAD,
                w: 200,
                h: 100,
                node: region,
                isRegion: true,
            };
            continue;
        }

        const minX = Math.min(...childLayouts.map(c => c.x)) - REGION_PAD;
        const minY = Math.min(...childLayouts.map(c => c.y)) - REGION_PAD - 32; // extra for header
        const maxX = Math.max(...childLayouts.map(c => c.x + c.w)) + REGION_PAD;
        const maxY = Math.max(...childLayouts.map(c => c.y + c.h)) + REGION_PAD;

        layoutNodes[region.id] = {
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY,
            node: region,
            isRegion: true,
        };
    }

    // 5. Compute canvas size
    const allLayouts = Object.values(layoutNodes);
    const canvasW = Math.max(...allLayouts.map(l => l.x + l.w)) + CANVAS_PAD;
    const canvasH = Math.max(...allLayouts.map(l => l.y + l.h)) + CANVAS_PAD;

    return {
        layoutNodes,
        canvasSize: { width: Math.max(canvasW, 1200), height: Math.max(canvasH, 800) },
    };
}

/**
 * Resolve tier for a node, considering its type and parent placement.
 */
function resolveTier(node, allLeaves, edges, nodeMap) {
    const baseTier = TIER_MAP[node.type];
    if (baseTier !== undefined) return baseTier;

    // Fallback: put unknown types in tier 4
    return 4;
}

/* ── Edge path computation (curved connectors) ─────────────────── */

/**
 * Compute an SVG path string for a curved horizontal→vertical connector.
 *
 * Strategy: exit right from source center-right → horizontal → curve → vertical → curve → enter target center-left
 */
export function computeEdgePath(srcLayout, tgtLayout) {
    const RADIUS = 20; // curve radius

    // Source exit point (right edge, vertically centered)
    const sx = srcLayout.x + srcLayout.w;
    const sy = srcLayout.y + srcLayout.h / 2;

    // Target entry point (left edge, vertically centered)
    const tx = tgtLayout.x;
    const ty = tgtLayout.y + tgtLayout.h / 2;

    const dx = tx - sx;
    const dy = ty - sy;

    // If target is directly right with small vertical offset — simple curve
    if (Math.abs(dy) < 4) {
        return `M ${sx} ${sy} L ${tx} ${ty}`;
    }

    // Midpoint for the horizontal→vertical transition
    const midX = sx + dx / 2;
    const dirY = dy > 0 ? 1 : -1;
    const absR = Math.min(RADIUS, Math.abs(dy) / 2, Math.abs(dx) / 4);

    // Path: horizontal → curve → vertical → curve → horizontal
    return [
        `M ${sx} ${sy}`,
        `L ${midX - absR} ${sy}`,
        `Q ${midX} ${sy} ${midX} ${sy + dirY * absR}`,
        `L ${midX} ${ty - dirY * absR}`,
        `Q ${midX} ${ty} ${midX + absR} ${ty}`,
        `L ${tx} ${ty}`,
    ].join(' ');
}

/* ── Edge label position ───────────────────────────────────────── */

export function computeEdgeLabelPos(srcLayout, tgtLayout) {
    const sx = srcLayout.x + srcLayout.w;
    const sy = srcLayout.y + srcLayout.h / 2;
    const tx = tgtLayout.x;
    const ty = tgtLayout.y + tgtLayout.h / 2;

    return {
        x: (sx + tx) / 2,
        y: (sy + ty) / 2 - 10,
    };
}

export { NODE_W, NODE_H };
