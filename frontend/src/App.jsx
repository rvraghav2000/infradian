import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
    while (cur && cur.parentId) {
      connected.add(cur.parentId);
      cur = nodeMap[cur.parentId];
    }
  }

  return connected;
}

/* ── App ───────────────────────────────────────────────────────── */

export default function App() {
  const [rawData, setRawData] = useState({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [layoutedNodes, setLayoutedNodes] = useState({});
  const [layoutedEdges, setLayoutedEdges] = useState([]);
  const [layoutedCanvasSize, setLayoutedCanvasSize] = useState({ width: 1440, height: 720 });
  const [zoom, setZoom] = useState(1);
  
  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [expandedNodeId, setExpandedNodeId] = useState(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [theme, setTheme] = useState('light');
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const initialLayoutPerformed = useRef(false);

  // Drag state
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartCoords = useRef({ x: 0, y: 0 });
  const wasDragging = useRef(false);

  /* ── Layout Logic (Dagre Integration) ────────────────────────── */
  const applyAutoLayout = useCallback((nodes = rawData.nodes, edges = rawData.edges, planningMode = isPlanningMode) => {
    if (!nodes || nodes.length === 0) return;

    const displayNodes = planningMode 
        ? nodes 
        : nodes.filter(n => n.status !== 'planned');

    const regionTypes = new Set(['aws_vpc', 'aws_subnet']);
    const nodeMap = new Map(displayNodes.map(n => [n.id, n]));
    
    const visualEdges = (edges || []).filter(e => {
        const src = nodeMap.get(e.source_id);
        const tgt = nodeMap.get(e.target_id);
        if (!src || !tgt) return false;
        if (regionTypes.has(src.type) || regionTypes.has(tgt.type)) return false;
        return true;
    });

    const layoutObj = computeLayout(displayNodes, visualEdges);
    
    setLayoutedNodes(layoutObj.layoutNodes);
    setLayoutedEdges(visualEdges);
    setLayoutedCanvasSize(layoutObj.canvasSize);
  }, [rawData.nodes, rawData.edges, isPlanningMode]);

  /* ── Fetch ────────────────────────────────────────────────────── */
  useEffect(() => {
    const loadData = () => {
      fetch('/api/v1/nodes')
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
            setRawData(data);
            setIsLoading(false);
            
            // Initial Paint: Auto-organize only once on first successful load
            if (!initialLayoutPerformed.current && data.nodes?.length > 0) {
              applyAutoLayout(data.nodes, data.edges);
              initialLayoutPerformed.current = true;
            }
        })
        .catch(e => {
            setError(e.message);
            setIsLoading(false);
        });
    };

    loadData();
    const timer = setInterval(loadData, 5000); // Poll every 5s
    return () => clearInterval(timer);
  }, []);

  // Removed automatic layout useEffect to prevent constant reorganization.
  // Layout is now triggered manually via applyAutoLayout() or on initial paint.

  /* ── Node Handling ────────────────────────────────────────────── */
  const handleNodeClick = useCallback((nodeId, e) => {
    // Suppress if the last action was a significant drag
    if (wasDragging.current) return;
    setFocusedNodeId(nodeId);
  }, []);

  const handleNodeDoubleClick = useCallback((nodeId, e) => {
    if (wasDragging.current) return;
    setExpandedNodeId(prev => prev === nodeId ? null : nodeId);
  }, []);

  const handleNodeMouseDown = useCallback((nodeId, e) => {
    e.stopPropagation();
    const node = layoutedNodes[nodeId];
    if (!node) return;

    // Calculate canvas-space mouse position
    const canvasX = (e.clientX - panOffset.x) / zoom;
    const canvasY = (e.clientY - panOffset.y) / zoom;

    setDraggedNodeId(nodeId);
    dragStartCoords.current = { x: e.clientX, y: e.clientY };
    wasDragging.current = false; // Reset on every start
    setDragOffset({
      x: canvasX - node.x,
      y: canvasY - node.y
    });
    setFocusedNodeId(nodeId);
  }, [layoutedNodes, panOffset, zoom]);

  // Global mouse listeners for dragging
  useEffect(() => {
    if (!draggedNodeId) return;

    const handleMouseMove = (e) => {
      const canvasX = (e.clientX - panOffset.x) / zoom;
      const canvasY = (e.clientY - panOffset.y) / zoom;

      const absoluteX = canvasX - dragOffset.x;
      const absoluteY = canvasY - dragOffset.y;

      // Determine if this movement counts as a drag
      const dist = Math.sqrt(
        Math.pow(e.clientX - dragStartCoords.current.x, 2) + 
        Math.pow(e.clientY - dragStartCoords.current.y, 2)
      );
      if (dist > 5) wasDragging.current = true;

      // Free Drag: No snapping during move
      setLayoutedNodes(prev => ({
        ...prev,
        [draggedNodeId]: {
          ...prev[draggedNodeId],
          x: absoluteX,
          y: absoluteY
        }
      }));
    };

    const handleMouseUp = () => {
      // Snap-on-Drop: Apply grid snapping only when released
      setLayoutedNodes(prev => {
        if (!draggedNodeId || !prev[draggedNodeId]) return prev;
        const node = prev[draggedNodeId];
        return {
          ...prev,
          [draggedNodeId]: {
            ...node,
            x: Math.round(node.x / 20) * 20,
            y: Math.round(node.y / 20) * 20
          }
        };
      });
      setDraggedNodeId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedNodeId, dragOffset, panOffset, zoom]);

  /* ── God mode select → pan + focus ───────────────────────────── */
  const handleGodModeSelect = useCallback((nodeId) => {
    setFocusedNodeId(nodeId);
    setExpandedNodeId(null);

    const layout = layoutedNodes[nodeId];
    if (!layout) return;

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const centerX = -(layout.x * zoom + (layout.w * zoom) / 2) + viewW / 2;
    const centerY = -(layout.y * zoom + (layout.h * zoom) / 2) + viewH / 2;

    setPanOffset({ x: centerX, y: centerY });
  }, [layoutedNodes, zoom]);

  /* ── Clear focus ─────────────────────────────────────────────── */
  const clearFocus = useCallback(() => {
    setFocusedNodeId(null);
    setExpandedNodeId(null);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  /* ── Blast radius ────────────────────────────────────────────── */
  const blastRadius = useMemo(() => {
    if (!rawData) return null;
    return computeBlastRadius(focusedNodeId, rawData.nodes, rawData.edges, hoveredEdgeId);
  }, [focusedNodeId, rawData, hoveredEdgeId]);

  /* ── Drag & Drop ─────────────────────────────────────────────── */
  const handleDropToCanvas = useCallback(async (type) => {
    // Determine target parent if any. For simplicity, drop as top-level orphan for now
    const newId = `planned-${type.replace(/_/g, '-')}-${Math.floor(Math.random()*1000)}`;
    const newNode = {
      id: newId,
      type: type,
      label: `Draft ${NODE_CATEGORIES[type]?.label || type.replace('aws_', '')}`,
      parentId: null,
      status: 'live',
      metrics: { current_load: 0 },
      history: [],
      attributes: {}
    };

    setRawData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));

    setLayoutedNodes(prev => ({
      ...prev,
      [newId]: {
        x: 800, 
        y: 100, 
        w: 120,
        h: 60,
        node: newNode,
        isRegion: false
      }
    }));

    try {
      await fetch('/api/v1/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNode)
      });
    } catch(e) { console.error("Could not persist node", e); }
  }, []);

  /* ── Delete Node ──────────────────────────────────────────────── */
  const handleDeleteNode = useCallback(async (nodeId) => {
    // Optimistic update
    setRawData(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source_id !== nodeId && e.target_id !== nodeId)
    }));
    
    setFocusedNodeId(null);
    setExpandedNodeId(null);

    console.log("handleDeleteNode calling for:", nodeId);
    try {
      const res = await fetch(`/api/v1/nodes/${nodeId}`, {
        method: 'DELETE'
      });
      if (!res.ok) console.error("Backend delete failed", res.status);
    } catch(e) { console.error("Could not delete node", e); }
  }, []);

  /* ── Shortcuts ────────────────────────────────────────────────── */
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
      // Node Deletion Shortcut
      if (focusedNodeId && (e.key === 'Delete' || e.key === 'Backspace')) {
        console.log("Delete key pressed for:", focusedNodeId);
        // Only allow deletion of user-added nodes (prefixed with 'planned-')
        if (focusedNodeId.startsWith('planned-')) {
          e.preventDefault();
          handleDeleteNode(focusedNodeId);
        } else {
          console.info("System-managed nodes are protected from deletion.");
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cmdKOpen, focusedNodeId, expandedNodeId, rawData, handleDeleteNode, clearFocus]);

  /* ── Render ──────────────────────────────────────────────────── */

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-sm" style={{ color: '#FF3B30' }}>
        Failed to load graph: {error}
      </div>
    );
  }

  if (isLoading && (!rawData || rawData.nodes.length === 0)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-sm animate-pulse" style={{ color: '#007AFF' }}>
          Loading infrastructure graph…
        </div>
      </div>
    );
  }

  // Sort nodes: regions first (as background), then cards on top
  const sortedLayoutIds = Object.keys(layoutedNodes).sort((a, b) => {
    const la = layoutedNodes[a];
    const lb = layoutedNodes[b];
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

          <div className="w-px h-4 mx-1" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

          {/* Organize Button */}
          <button
            onClick={(e) => { e.stopPropagation(); applyAutoLayout(); }}
            className="flex items-center gap-2 px-3 h-8 rounded-md cursor-pointer border-0 text-xs font-semibold"
            style={{
              background: theme === 'dark' ? 'rgba(52,199,89,0.15)' : 'rgba(52,199,89,0.1)',
              color: '#34C759',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = theme === 'dark' ? 'rgba(52,199,89,0.25)' : 'rgba(52,199,89,0.15)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = theme === 'dark' ? 'rgba(52,199,89,0.15)' : 'rgba(52,199,89,0.1)';
            }}
          >
            <span>Organize Graph</span>
          </button>
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────── */}
      <InfraCanvas
        canvasSize={layoutedCanvasSize}
        panOffset={panOffset}
        onPan={setPanOffset}
        zoom={zoom}
        onZoomChange={setZoom}
        theme={theme}
      >
        {/* Flow connectors (curved paths) */}
        <FlowConnectors 
          edges={layoutedEdges} 
          layoutNodes={layoutedNodes} 
          blastRadius={blastRadius}
          hoveredEdgeId={hoveredEdgeId}
          onEdgeHover={setHoveredEdgeId}
        />

        {/* Nodes */}
        {sortedLayoutIds.map(id => {
          const nl = layoutedNodes[id];
          const isDimmed = blastRadius !== null && !blastRadius.has(id);
          const isFocused = focusedNodeId === id;

          return (
            <InfraNode
              key={id}
              nodeLayout={nl}
              dimmed={isDimmed}
              focused={isFocused}
              theme={theme}
              isDragging={draggedNodeId === id}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeMouseDown={handleNodeMouseDown}
              onGodModeSelect={handleGodModeSelect}
              expandedNodeId={expandedNodeId}
            />
          );
        })}
      </InfraCanvas>

      {/* Node Details Modal */}
      <NodeDetailsModal 
        nodeLayout={focusedNodeId ? layoutedNodes[focusedNodeId] : null} 
        onClose={clearFocus}
        onDelete={handleDeleteNode}
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
        nodes={rawData.nodes}
        edges={rawData.edges}
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
