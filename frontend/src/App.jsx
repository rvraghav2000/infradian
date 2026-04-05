import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CytoscapeCanvas from './components/CytoscapeCanvas';
import CommandPalette from './components/CommandPalette';
import HistoryStack from './components/HistoryStack';
import InfraNode from './components/InfraNode';
import PlanningPanel from './components/PlanningPanel';
import { NODE_CATEGORIES } from './layout';


const PALETTE_ITEMS = [
  'aws_instance', 'aws_rds', 'aws_s3', 'aws_elasticache', 'aws_lambda', 'aws_alb', 'aws_vpc', 'aws_subnet'
];


import { AnalysisProvider, useAnalysis } from './context/AnalysisContext';
import AnalysisPanel from './components/AnalysisPanel';
import SimulationSummary from './components/SimulationSummary';
import TopActionsDrawer from './components/TopActionsDrawer';
import AWSSyncModal from './components/AWSSyncModal';

export default function App() {
  const [rawData, setRawData] = useState({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [layoutTrigger, setLayoutTrigger] = useState(0);

  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [expandedNodeId, setExpandedNodeId] = useState(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [theme, setTheme] = useState('light');
  const { isSimulationMode, setIsSimulationMode, blastRadius, clearAnalysis } = useAnalysis();
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isAWSModalOpen, setIsAWSModalOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const initialLayoutPerformed = useRef(false);


  /* ── Layout Logic (Dagre Integration) ────────────────────────── */
  /* ── Layout Logic (Native Cytoscape Trigger) ─────────────────── */
  const applyAutoLayout = useCallback(() => {
    setLayoutTrigger(prev => prev + 1);
  }, []);

  /* ── Fetch ────────────────────────────────────────────────────── */
  useEffect(() => {
    const loadData = async () => {
      try {
        const [accRes, nodesRes] = await Promise.all([
            fetch('/api/v1/accounts'),
            fetch(`/api/v1/nodes?account_id=${selectedAccount}`)
        ]);
        
        if (!accRes.ok || !nodesRes.ok) throw new Error(`HTTP fetch failed`);
        
        const accountsData = await accRes.json();
        const data = await nodesRes.json();
        
        setAccounts(accountsData);
        setRawData(data);
        setIsLoading(false);
        
        if (!initialLayoutPerformed.current && data.nodes?.length > 0) {
            applyAutoLayout();
            initialLayoutPerformed.current = true;
        }
      } catch (e) {
          setError(e.message);
          setIsLoading(false);
      }
    };

    loadData();
    const timer = setInterval(loadData, 5000); // Poll every 5s
    return () => clearInterval(timer);
  }, [selectedAccount, applyAutoLayout]);

  // Removed automatic layout useEffect to prevent constant reorganization.
  // Layout is now triggered manually via applyAutoLayout() or on initial paint.

  /* ── Node Handling ────────────────────────────────────────────── */
  const handleNodeClick = useCallback((nodeId, e) => {
    // Single click now handles both focus and opens analysis sidebar
    setFocusedNodeId(nodeId);
    setExpandedNodeId(null); // Close any expanded pipeline cards
    setIsAnalysisOpen(true); // Open analysis sidebar immediately
  }, []);

  /* ── God mode select → pan + focus ───────────────────────────── */
  const handleGodModeSelect = useCallback((nodeId) => {
    setFocusedNodeId(nodeId);
    setExpandedNodeId(null);
    setCmdKOpen(false);
    setIsAnalysisOpen(true); // "Config" implies analysis view
    // Note: To pan precisely, we would need to ask Cytoscape for the node's position.
    // For now, selecting it simply focuses the node details without panning the canvas natively.
  }, []);

  /* ── Clear focus ─────────────────────────────────────────────── */
  const clearFocus = useCallback(() => {
    setFocusedNodeId(null);
    setExpandedNodeId(null);
    setIsAnalysisOpen(false);
    setPanOffset({ x: 0, y: 0 });
    clearAnalysis();
  }, [clearAnalysis]);

  /* ── Backend v2 analysis is now loaded by AnalysisPanel via context ── */

  /* ── Node Drop from PlanningPanel (graph-space coords) ───────── */
  const handleNodeDrop = useCallback(async (primitiveData, graphX, graphY) => {
    const newId = `planned-${primitiveData.type.replace(/_/g, '-')}-${Math.floor(Math.random() * 10000)}`;
    const newNode = {
      ...primitiveData,
      id: newId,
      label: primitiveData.label || primitiveData.type,
      parentId: null, // Default for now — in a future iteration this could be set by the drop target
      parent_id: null,
      attributes: {
        spawnX: graphX,
        spawnY: graphY,
      },
    };

    setRawData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));

    try {
      await fetch('/api/v1/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNode)
      });
    } catch(e) { console.error('Could not persist dropped node', e); }
  }, []);

  /* ── Drop Node (legacy — type-only drop from outer onDrop) ──── */
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
      attributes: {
        spawnX: Math.random() * 200 + 400,
        spawnY: Math.random() * 200 + 100
      }
    };

    setRawData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
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

  // Removed sortedLayoutIds processing as Cytoscape strictly governs rendering now

  return (
    <div
      className="relative w-screen h-screen overflow-hidden transition-colors duration-500"
      style={{
        background: theme === 'dark' ? '#1c1c1e' : '#f5f5f7',
        color: theme === 'dark' ? 'rgba(255,255,255,0.85)' : '#1d1d1f'
      }}
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
        className="fixed top-7 right-44 flex items-center gap-1.5 px-2 py-1.5 rounded-xl"
        style={{
          zIndex: 60,
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
            onClick={(e) => { e.stopPropagation(); setIsSimulationMode(p => !p); }}
            className="flex items-center gap-2 px-3 h-8 rounded-md cursor-pointer border-0 text-xs font-semibold uppercase tracking-wide"
            style={{
              background: isSimulationMode 
                ? (theme === 'dark' ? 'rgba(10,132,255,0.15)' : 'rgba(0,122,255,0.1)') 
                : 'transparent',
              color: isSimulationMode 
                ? (theme === 'dark' ? '#0a84ff' : '#007AFF') 
                : (theme === 'dark' ? '#aeaeb2' : '#86868b'),
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              if(!isSimulationMode) {
                e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
                e.currentTarget.style.color = theme === 'dark' ? '#fff' : '#1d1d1f';
              }
            }}
            onMouseLeave={e => {
              if(!isSimulationMode) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = theme === 'dark' ? '#aeaeb2' : '#86868b';
              }
            }}
          >
            <span>Draft</span>
            <span style={{ fontSize: 9 }}>{isSimulationMode ? 'ON' : 'OFF'}</span>
          </button>

          <div className="w-px h-4 mx-1" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

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
          
          <div className="w-px h-4 mx-1" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
          
          {accounts.length > 0 && (
              <>
                  <select
                      value={selectedAccount}
                      onChange={(e) => setSelectedAccount(e.target.value)}
                      className="bg-transparent border-0 outline-none text-[11px] font-medium px-2 py-1 appearance-none cursor-pointer text-center tracking-wide"
                      style={{
                          color: theme === 'dark' ? '#aeaeb2' : '#86868b'
                      }}
                  >
                      <option value="all">ALL ENVIRONMENTS</option>
                      {accounts.map(acc => (
                          <option key={acc} value={acc}>ACC: {acc}</option>
                      ))}
                  </select>
                  <div className="w-px h-4 mx-1 break-hidden border-0" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
              </>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setIsAWSModalOpen(true); }}
            className="flex items-center gap-2 px-3 h-8 rounded-md cursor-pointer border-0 text-xs font-semibold"
            style={{
              background: 'linear-gradient(to right, rgba(249, 115, 22, 0.1), rgba(245, 158, 11, 0.1))',
              color: '#f97316',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'linear-gradient(to right, rgba(249, 115, 22, 0.2), rgba(245, 158, 11, 0.2))';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'linear-gradient(to right, rgba(249, 115, 22, 0.1), rgba(245, 158, 11, 0.1))';
            }}
          >
            <span>Connect AWS</span>
          </button>
      </div>

      {/* HUD & Legend overlays restored from IsometricCanvas */}
      <div className="fixed top-7 left-9 select-none pointer-events-none" style={{ zIndex: 60 }}>
          <h1 className="text-[22px] font-semibold" style={{ color: theme === 'dark' ? '#fff' : '#1d1d1f', letterSpacing: '-0.02em' }}>
              Infradian
          </h1>
          <p className="text-[11px] mt-0.5" style={{ color: theme === 'dark' ? '#aeaeb2' : '#86868b', fontWeight: 500 }}>
              Infrastructure Map
          </p>
          <p className="text-[10px] mt-1" style={{ color: theme === 'dark' ? '#636366' : '#aeaeb2' }}>
              ⌘K Search · Click to select · Drag to organize · Scroll to zoom
          </p>
      </div>

      <div className="fixed bottom-7 right-9 z-50 select-none flex gap-5 text-[10px]" style={{ color: '#86868b', fontWeight: 500 }}>
          <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: '#34C759' }} /> Live
          </span>
          <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: '#FF9500' }} /> Pending
          </span>
          <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: '#FF3B30' }} /> Offline
          </span>
      </div>

      {/* Dynamic Grid Background */}
      <div 
          style={{
              position: 'fixed',
              inset: 0,
              backgroundImage: `
                  linear-gradient(${theme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'} 1px, transparent 1px),
                  linear-gradient(90deg, ${theme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'} 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
              pointerEvents: 'none',
              zIndex: 0,
              transition: 'background-image 0.5s ease',
          }} 
      />

      {/* ── Top Chrome Mesh ─────────────────────────────────────────────
          Frosted glass gradient that feathers from the top down.
          Sits ABOVE the planning sidebar (z-45) so sidebar items scroll
          behind it, but BELOW the logo + toolbar (z-60) so they remain
          fully readable. The mask-image gradient creates the diffused
          'fading outward' effect — solid blur at top, fading to transparent.
      ─────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 110,
          zIndex: 55,
          pointerEvents: 'none',
          background: theme === 'dark'
            ? 'linear-gradient(to bottom, rgba(28,28,30,0.88) 0%, rgba(28,28,30,0.6) 55%, rgba(28,28,30,0) 100%)'
            : 'linear-gradient(to bottom, rgba(245,245,247,0.9) 0%, rgba(245,245,247,0.6) 55%, rgba(245,245,247,0) 100%)',
          backdropFilter: 'blur(18px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.6)',
          // Mask fades the blur effect itself — solid blur at top, dissolves to nothing
          maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
          transition: 'background 0.5s ease',
        }}
      />

      <div className="w-full h-full relative">
        <CytoscapeCanvas 
          graphData={rawData}
          layoutTrigger={layoutTrigger}
          onNodeClick={(id) => handleNodeClick(id)}
          onCanvasClick={() => clearFocus()}
          onNodeHover={setHoveredNodeId}
          onNodeDrop={handleNodeDrop}
          theme={theme}
        />

        
          {/* DOM Overlays managed by Cytoscape WebGL physics */}
        <div className="absolute inset-0 pointer-events-none z-10" style={{ transformOrigin: '0 0' }}>
           {rawData.nodes.map(node => {
             const isRegion = ['aws_vpc', 'aws_subnet'].includes(node.type);
             return (
               <div 
                 id={`infranode-${node.id}`} 
                 key={node.id} 
                 className="absolute top-0 left-0 transition-opacity duration-500"
                 style={{ 
                   willChange: 'transform',
                   opacity: blastRadius?.impactedNodes 
                            && !blastRadius.impactedNodes.some(n => String(n.id) === String(node.id)) 
                            && String(node.id) !== String(blastRadius.nodeId) ? 0.25 : 1,
                   // Region nodes need explicit dimensions so their children can use width: 100%
                   ...(isRegion ? {
                     width: 'var(--region-w, 200px)',
                     height: 'var(--region-h, 100px)',
                   } : {})
                 }}
               >
                 <InfraNode 
                   nodeLayout={{ 
                     node, 
                     x: 0, y: 0, w: 220, h: 60,
                     isRegion
                   }}
                   focused={focusedNodeId === node.id}
                   expandedNodeId={expandedNodeId}
                   theme={theme}
                   onNodeClick={handleNodeClick}
                   onGodModeSelect={handleGodModeSelect}
                   physicsHovered={hoveredNodeId === node.id}
                 />
               </div>
             );
           })}
        </div>
      </div>

      {/* Top Actions Drawer */}
      {!focusedNodeId && (
        <TopActionsDrawer 
          theme={theme} 
          onNodeSelect={(nodeId) => {
            setFocusedNodeId(nodeId);
            setIsAnalysisOpen(true);
          }}
        />
      )}

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
        theme={theme}
      />

      {/* Analysis Panel */}
      <AnimatePresence>
        {focusedNodeId && isAnalysisOpen && !focusedNodeId.startsWith('planned-') && (
            <AnalysisPanel 
                node={rawData.nodes.find(n => String(n.id) === String(focusedNodeId))}
                theme={theme}
                onClose={() => clearFocus()}
            />
        )}
      </AnimatePresence>

      {/* Simulation Summary (Draft Mode) */}
      <AnimatePresence>
        {isSimulationMode && (
            <SimulationSummary theme={theme} />
        )}
      </AnimatePresence>

      {/* Planning Mode Sidebar */}
      {isSimulationMode && (
        <PlanningPanel theme={theme} />
      )}
      
      <AWSSyncModal 
        isOpen={isAWSModalOpen} 
        onClose={() => setIsAWSModalOpen(false)} 
        onSuccess={() => window.location.reload()} 
        theme={theme}
      />
    </div>
  );
}
