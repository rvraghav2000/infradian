/**
 * layout.js — Visual metadata for Infradian infrastructure nodes.
 *
 * Contains node category definitions (icons, colors, labels) and
 * the draggable palette primitives for Draft Mode.
 *
 * Layout computation is handled natively by Cytoscape's dagre plugin.
 */

/* ── Node categories for visual styling ────────────────────────── */

export const NODE_CATEGORIES = {
    // ── Existing types ──────────────────────────────────────────────
    aws_vpc:             { category: 'region',        icon: '🌐', color: '#007AFF', label: 'VPC' },
    aws_subnet:          { category: 'region',        icon: '📦', color: '#5856D6', label: 'Subnet' },
    aws_route53:         { category: 'network',       icon: '🔀', color: '#007AFF', label: 'DNS' },
    aws_cloudfront:      { category: 'network',       icon: '⚡', color: '#007AFF', label: 'CDN' },
    aws_waf:             { category: 'security',      icon: '🛡️', color: '#FF9500', label: 'WAF' },
    aws_alb:             { category: 'network',       icon: '⚖️', color: '#007AFF', label: 'Load Balancer' },
    aws_instance:        { category: 'compute',       icon: '🖥️', color: '#34C759', label: 'EC2' },
    aws_lambda:          { category: 'compute',       icon: '⚡', color: '#AF52DE', label: 'Lambda' },
    aws_db_instance:     { category: 'data',          icon: '🗄️', color: '#FF3B30', label: 'RDS' },
    aws_elasticache:     { category: 'data',          icon: '⚡', color: '#FF9500', label: 'Cache' },
    aws_s3:              { category: 'data',          icon: '📁', color: '#34C759', label: 'S3' },
    cicd_github_actions: { category: 'cicd',          icon: '🔄', color: '#5856D6', label: 'CI/CD' },
    aws_cloudwatch:      { category: 'observability', icon: '📊', color: '#007AFF', label: 'Monitoring' },
    sre_pagerduty:       { category: 'observability', icon: '🔔', color: '#FF3B30', label: 'Alerting' },
    aws_secrets_manager: { category: 'security',      icon: '🔑', color: '#FF9500', label: 'Secrets' },
    // ── New planning primitives ──────────────────────────────────────
    cloud_provider:      { category: 'region',        icon: '☁️', color: '#007AFF', label: 'Cloud Provider' },
    k8s_cluster:         { category: 'region',        icon: '⎈',  color: '#326CE5', label: 'Kubernetes Cluster' },
    generic_container:   { category: 'compute',       icon: '📦', color: '#34C759', label: 'Container' },
    nosql_db:            { category: 'data',          icon: '🕸️', color: '#FF9500', label: 'NoSQL / Graph DB' },
    aws_api_gateway:     { category: 'network',       icon: '🚪', color: '#007AFF', label: 'API Gateway' },
};

export function getCategoryMeta(type) {
    return NODE_CATEGORIES[type] || { category: 'compute', icon: '⬡', color: '#86868b', label: type };
}

/* ── Planning Mode Palette — 14 draggable primitives ────────────── */

export const PALETTE_PRIMITIVES = [
    {
        category: 'Boundaries',
        items: [
            {
                type: 'cloud_provider',
                label: 'Cloud Provider',
                icon: '☁️',
                color: '#007AFF',
                defaultData: { type: 'cloud_provider', label: 'Cloud Provider', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'aws_vpc',
                label: 'VPC / Virtual Network',
                icon: '🌐',
                color: '#007AFF',
                defaultData: { type: 'aws_vpc', label: 'Virtual Network', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'aws_subnet',
                label: 'Subnet',
                icon: '📦',
                color: '#5856D6',
                defaultData: { type: 'aws_subnet', label: 'Subnet', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'k8s_cluster',
                label: 'Kubernetes / Container Cluster',
                icon: '⎈',
                color: '#326CE5',
                defaultData: { type: 'k8s_cluster', label: 'K8s Cluster', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
        ],
    },
    {
        category: 'Compute',
        items: [
            {
                type: 'aws_instance',
                label: 'Virtual Machine / EC2',
                icon: '🖥️',
                color: '#34C759',
                defaultData: { type: 'aws_instance', label: 'VM / EC2', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'generic_container',
                label: 'Generic Container',
                icon: '📦',
                color: '#34C759',
                defaultData: { type: 'generic_container', label: 'Container', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'aws_lambda',
                label: 'Serverless Function',
                icon: '⚡',
                color: '#AF52DE',
                defaultData: { type: 'aws_lambda', label: 'Function', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
        ],
    },
    {
        category: 'Data & State',
        items: [
            {
                type: 'aws_db_instance',
                label: 'Relational Database',
                icon: '🗄️',
                color: '#FF3B30',
                defaultData: { type: 'aws_db_instance', label: 'Relational DB', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'nosql_db',
                label: 'NoSQL / Graph Database',
                icon: '🕸️',
                color: '#FF9500',
                defaultData: { type: 'nosql_db', label: 'NoSQL DB', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'aws_elasticache',
                label: 'Cache / Message Queue',
                icon: '⚡',
                color: '#FF9500',
                defaultData: { type: 'aws_elasticache', label: 'Cache / Queue', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'aws_s3',
                label: 'Object Storage (S3)',
                icon: '📁',
                color: '#34C759',
                defaultData: { type: 'aws_s3', label: 'Object Store', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
        ],
    },
    {
        category: 'Traffic & Networking',
        items: [
            {
                type: 'aws_alb',
                label: 'Load Balancer / Ingress',
                icon: '⚖️',
                color: '#007AFF',
                defaultData: { type: 'aws_alb', label: 'Load Balancer', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'aws_api_gateway',
                label: 'API Gateway',
                icon: '🚪',
                color: '#007AFF',
                defaultData: { type: 'aws_api_gateway', label: 'API Gateway', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
            {
                type: 'aws_cloudfront',
                label: 'CDN / DNS',
                icon: '⚡',
                color: '#007AFF',
                defaultData: { type: 'aws_cloudfront', label: 'CDN / DNS', status: 'planned', metrics: { current_load: 0 }, history: [], parentId: null },
            },
        ],
    },
];

