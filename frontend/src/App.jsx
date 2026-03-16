import { useEffect, useState, useCallback, useMemo } from 'react';
import InfraCanvas from './components/IsometricCanvas';
import InfraNode from './components/InfraNode';
import FlowConnectors from './components/EdgeLines';
import CommandPalette from './components/CommandPalette';
import HistoryStack from './components/HistoryStack';
import NodeDetailsModal from './components/NodeDetailsModal';
import { computeLayout, NODE_CATEGORIES } from './layout';

const PALETTE_ITEMS = [
  'aws_instance', 'aws_rds', 'aws_s3', 'aws_elasticache', 'aws_lambda', 'aws_alb', 'aws_vpc', 'aws_subnet'
];

/* ── Blast radius ──────────────────────────────────────────────── */

function computeBlastRadius(focusedId, nodes, edges, hoveredEdgeId) {
  if (!focusedId && !hoveredEdgeId) return null;

  const connected = new Set();
  
  if (focusedId) {
    connected.add(focusedId);
    for (const e of edges) {
      if (e.source_id === focusedId) connected.add(e.target_id);
      if (e.target_id === focusedId) connected.add(e.source_id);
    }
  }

  if (hoveredEdgeId) {
    const [src, tgt] = hoveredEdgeId.split('->');
    connected.add(src);
    connected.add(tgt);
  }

  // Walk parent chain
  const nodeMap = {};
  for (const n of nodes) nodeMap[n.id] = n;
  
  const initialConnected = [...connected];
  for (const id of initialConnected) {
    let cur = nodeMap[id];
    while (cur && cur.parent_id) {
      connected.add(cur.parent_id);
      cur = nodeMap[cur.parent_id];
    }
  }

  return connected;
}

/* ── App ───────────────────────────────────────────────────────── */

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [expandedNodeId, setExpandedNodeId] = useState(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [theme, setTheme] = useState('light');
  const [isPlanningMode, setIsPlanningMode] = useState(false);

  /* ── Fetch ────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/api/v1/graph')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  /* ── Cmd+K ────────────────────────────────────────────────────── */
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdKOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        if (cmdKOpen) setCmdKOpen(false);
        else if (focusedNodeId) clearFocus();
        else if (expandedNodeId) setExpandedNodeId(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cmdKOpen, focusedNodeId, expandedNodeId]);

  /* ── Layout ───────────────────────────────────────────────────── */
  const { layoutNodes, visualEdges, canvasSize } = useMemo(() => {
    if (!data) return { layoutNodes: {}, visualEdges: [], canvasSize: { width: 1440, height: 720 } };

    const displayNodes = isPlanningMode ? data.nodes : data.nodes.filter(n => n.status !== 'planned');

    const regionTypes = new Set(['aws_vpc', 'aws_subnet']);
    const nodeMap = new Map(displayNodes.map(n => [n.id, n]));
    
    const visualEdges = data.edges.filter(e => {
        const src = nodeMap.get(e.source_id);
        const tgt = nodeMap.get(e.target_id);
        if (!src || !tgt) return false;
        if (regionTypes.has(src.type) || regionTypes.has(tgt.type)) return false;
        return true;
    });

    const layoutObj = computeLayout(displayNodes, visualEdges);
    return { ...layoutObj, visualEdges };
  }, [data, isPlanningMode]);

  /* ── Node click (history toggle) ─────────────────────────────── */
  const handleNodeClick = useCallback((nodeId) => {
    setExpandedNodeId(prev => prev === nodeId ? null : nodeId);
  }, []);

  /* ── God mode select → pan + focus ───────────────────────────── */
  const handleGodModeSelect = useCallback((nodeId) => {
    setFocusedNodeId(nodeId);
    setExpandedNodeId(null);

    const layout = layoutNodes[nodeId];
    if (!layout) return;

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const centerX = -(layout.x + layout.w / 2) + viewW / 2;
    const centerY = -(layout.y + layout.h / 2) + viewH / 2;

    setPanOffset({ x: centerX, y: centerY });
  }, [layoutNodes]);

  /* ── Clear focus ─────────────────────────────────────────────── */
  const clearFocus = useCallback(() => {
    setFocusedNodeId(null);
    setExpandedNodeId(null);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  /* ── Blast radius ────────────────────────────────────────────── */
  const blastRadius = useMemo(() => {
    if (!data) return null;
    return computeBlastRadius(focusedNodeId, data.nodes, data.edges, hoveredEdgeId);
  }, [focusedNodeId, data, hoveredEdgeId]);

  /* ── Drag & Drop ─────────────────────────────────────────────── */
  const handleDropToCanvas = useCallback(async (type) => {
    // Determine target parent if any. For simplicity, drop as top-level orphan for now
    const newId = `planned-${type.replace(/_/g, '-')}-${Math.floor(Math.random()*1000)}`;
    const newNode = {
      id: newId,
      type: type,
      label: `Draft ${NODE_CATEGORIES[type]?.label || type.replace('aws_', '')}`,
      parent_id: null,
      status: 'planned',
      metrics: { current_load: 0 },
      history: [],
      attributes: {}
    };

    setData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));

    try {
      await fetch('/api/v1/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNode)
      });
    } catch(e) { console.error("Could not persist planned node", e); }
  }, []);

  /* ── Render ──────────────────────────────────────────────────── */

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-sm" style={{ color: '#FF3B30' }}>
        Failed to load graph: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-sm animate-pulse" style={{ color: '#007AFF' }}>
          Loading infrastructure graph…
        </div>
      </div>
    );
  }

  // Sort nodes: regions first (as background), then cards on top
  const sortedLayoutIds = Object.keys(layoutNodes).sort((a, b) => {
    const la = layoutNodes[a];
    const lb = layoutNodes[b];
    if (la.isRegion && !lb.isRegion) return -1;
    if (!la.isRegion && lb.isRegion) return 1;
    return 0;
  });

  return (
    <div
      className="relative w-screen h-screen overflow-hidden transition-colors duration-500"
      style={{
        background: theme === 'dark' ? '#1c1c1e' : '#f5f5f7',
        color: theme === 'dark' ? 'rgba(255,255,255,0.85)' : '#1d1d1f'
      }}
      onClick={() => { if (focusedNodeId) clearFocus(); }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/infradian-node')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const type = e.dataTransfer.getData('application/infradian-node');
        if (type) {
          e.preventDefault();
          handleDropToCanvas(type);
        }
      }}
    >
      {/* ── Global Actions (Top Right) ───────────────────────────────── */}
      <div 
        className="fixed top-7 right-44 z-50 flex items-center gap-1.5 px-2 py-1.5 rounded-xl"
        style={{
          background: theme === 'dark' ? 'rgba(30,30,32,0.85)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
          boxShadow: theme === 'dark' ? '0 4px 12px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.04)'
        }}
      >
          {/* Recent/Center Shortcut */}
          <button
            onClick={(e) => { e.stopPropagation(); clearFocus(); setPanOffset({ x: 0, y: 0 }); }}
            className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer border-0"
            title="Reset Pan & View"
            style={{
              background: 'transparent',
              color: theme === 'dark' ? '#aeaeb2' : '#86868b',
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
              e.currentTarget.style.color = theme === 'dark' ? '#fff' : '#1d1d1f';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = theme === 'dark' ? '#aeaeb2' : '#86868b';
            }}
          >
            ⌂
          </button>
          
          <div className="w-px h-4 mx-1" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

          {/* Search Shortcut */}
          <button
            onClick={(e) => { e.stopPropagation(); setCmdKOpen(true); }}
            className="flex items-center gap-2 px-3 h-8 rounded-md cursor-pointer border-0 text-xs font-medium"
            style={{
              background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
              color: theme === 'dark' ? '#aeaeb2' : '#86868b',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
          >
            <span>Search</span>
            <kbd className="font-sans px-1.5 py-0.5 rounded" style={{ background: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)' }}>⌘K</kbd>
          </button>
          
          {/* Theme Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setTheme(prev => prev === 'light' ? 'dark' : 'light'); }}
            className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer border-0"
            style={{
              background: 'transparent',
              color: theme === 'dark' ? '#aeaeb2' : '#86868b',
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
              e.currentTarget.style.color = theme === 'dark' ? '#fff' : '#1d1d1f';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = theme === 'dark' ? '#aeaeb2' : '#86868b';
            }}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          <div className="w-px h-4 mx-1" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

          {/* Planning Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setIsPlanningMode(p => !p); }}
            className="flex items-center gap-2 px-3 h-8 rounded-md cursor-pointer border-0 text-xs font-semibold uppercase tracking-wide"
            style={{
              background: isPlanningMode 
                ? (theme === 'dark' ? 'rgba(10,132,255,0.15)' : 'rgba(0,122,255,0.1)') 
                : 'transparent',
              color: isPlanningMode 
                ? (theme === 'dark' ? '#0a84ff' : '#007AFF') 
                : (theme === 'dark' ? '#aeaeb2' : '#86868b'),
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              if(!isPlanningMode) {
                e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
                e.currentTarget.style.color = theme === 'dark' ? '#fff' : '#1d1d1f';
              }
            }}
            onMouseLeave={e => {
              if(!isPlanningMode) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = theme === 'dark' ? '#aeaeb2' : '#86868b';
              }
            }}
          >
            <span>Draft</span>
            <span style={{ fontSize: 9 }}>{isPlanningMode ? 'ON' : 'OFF'}</span>
          </button>
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────── */}
      <InfraCanvas
        canvasSize={canvasSize}
        panOffset={panOffset}
        onPan={setPanOffset}
        theme={theme}
      >
        {/* Flow connectors (curved paths) */}
        <FlowConnectors 
          edges={visualEdges} 
          layoutNodes={layoutNodes} 
          blastRadius={blastRadius}
          hoveredEdgeId={hoveredEdgeId}
          onEdgeHover={setHoveredEdgeId}
        />

        {/* Nodes */}
        {sortedLayoutIds.map(id => {
          const nl = layoutNodes[id];
          const isDimmed = blastRadius !== null && !blastRadius.has(id);
          const isFocused = focusedNodeId === id;

          return (
            <InfraNode
              key={id}
              nodeLayout={nl}
              dimmed={isDimmed}
              focused={isFocused}
              theme={theme}
              onNodeClick={handleNodeClick}
              onGodModeSelect={handleGodModeSelect}
              expandedNodeId={expandedNodeId}
            />
          );
        })}
      </InfraCanvas>

      {/* Node Details Modal */}
      <NodeDetailsModal 
        nodeLayout={focusedNodeId ? layoutNodes[focusedNodeId] : null} 
        onClose={clearFocus}
        theme={theme}
      />

      {/* Focus indicator */}
      {focusedNodeId && (
        <div className="fixed bottom-6 left-8 z-50 select-none">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl"
            style={{
              background: theme === 'dark' ? 'rgba(44,44,46,0.9)' : 'rgba(255,255,255,0.9)',
              border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              backdropFilter: 'blur(20px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
              boxShadow: theme === 'dark' ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 10px rgba(0,0,0,0.06)',
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: '#007AFF' }} />
            <span className="text-xs font-medium" style={{ color: '#86868b' }}>
              Focused: <span style={{ color: '#007AFF', fontWeight: 600 }}>{focusedNodeId}</span>
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); clearFocus(); }}
              className="text-[10px] font-medium ml-2 cursor-pointer bg-transparent border-0"
              style={{ color: '#aeaeb2' }}
            >
              [ESC to clear]
            </button>
          </div>
        </div>
      )}

      {/* Command Palette */}
      <CommandPalette
        nodes={data.nodes}
        edges={data.edges}
        isOpen={cmdKOpen}
        onClose={() => setCmdKOpen(false)}
        onSelect={handleGodModeSelect}
      />

      {/* Tech Palette Toolbar */}
      {isPlanningMode && (
        <div 
          className="fixed left-8 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3 p-3 rounded-2xl"
          style={{
            background: theme === 'dark' ? 'rgba(30,30,32,0.85)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
            boxShadow: theme === 'dark' ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.08)'
          }}
        >
          {PALETTE_ITEMS.map(type => {
            const meta = NODE_CATEGORIES[type] || { icon: '?', color: '#ccc' };
            return (
              <div
                key={type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/infradian-node', type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="w-12 h-12 flex items-center justify-center rounded-xl cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
                title={`Drag to add ${meta.label}`}
                style={{ 
                  background: `${meta.color}15`, 
                  border: `1px solid ${meta.color}30`,
                  fontSize: 20
                }}
              >
                {meta.icon}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
