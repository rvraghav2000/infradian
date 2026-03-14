import { useEffect, useState, useCallback, useMemo } from 'react';
import InfraCanvas from './components/IsometricCanvas';
import InfraNode from './components/InfraNode';
import FlowConnectors from './components/EdgeLines';
import CommandPalette from './components/CommandPalette';
import HistoryStack from './components/HistoryStack';
import { computeLayout } from './layout';

/* ── Blast radius ──────────────────────────────────────────────── */

function computeBlastRadius(focusedId, nodes, edges) {
  if (!focusedId) return null;

  const connected = new Set();
  connected.add(focusedId);

  for (const e of edges) {
    if (e.source_id === focusedId) connected.add(e.target_id);
    if (e.target_id === focusedId) connected.add(e.source_id);
  }

  // Walk parent chain
  const nodeMap = {};
  for (const n of nodes) nodeMap[n.id] = n;
  let cur = nodeMap[focusedId];
  while (cur && cur.parent_id) {
    connected.add(cur.parent_id);
    cur = nodeMap[cur.parent_id];
  }
  for (const id of [...connected]) {
    cur = nodeMap[id];
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

  /* ── Fetch ────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/sample_payload.json')
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
  const { layoutNodes, canvasSize } = useMemo(() => {
    if (!data) return { layoutNodes: {}, canvasSize: { width: 1440, height: 720 } };
    return computeLayout(data.nodes, data.edges);
  }, [data]);

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
    return computeBlastRadius(focusedNodeId, data.nodes, data.edges);
  }, [focusedNodeId, data]);

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
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: '#f5f5f7' }}
      onClick={() => { if (focusedNodeId) clearFocus(); }}
    >
      <InfraCanvas
        canvasSize={canvasSize}
        panOffset={panOffset}
        onPan={setPanOffset}
      >
        {/* Flow connectors (curved paths) */}
        <FlowConnectors edges={data.edges} layoutNodes={layoutNodes} />

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
              onNodeClick={handleNodeClick}
              expandedNodeId={expandedNodeId}
            />
          );
        })}
      </InfraCanvas>

      {/* Focus indicator */}
      {focusedNodeId && (
        <div className="fixed bottom-6 left-8 z-50 select-none">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(0,0,0,0.08)',
              backdropFilter: 'blur(20px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
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
    </div>
  );
}
