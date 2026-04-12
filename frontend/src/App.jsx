import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CytoscapeCanvas from './components/CytoscapeCanvas';
import CommandPalette from './components/CommandPalette';
import InfraNode from './components/InfraNode';
import PlanningPanel from './components/PlanningPanel';


import { AnalysisProvider, useAnalysis } from './context/AnalysisContext';
import AnalysisPanel from './components/AnalysisPanel';
import CloudSettings from './components/CloudSettings';
import WorkspaceManager from './components/WorkspaceManager';
import StatusBar from './components/StatusBar';

import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Search, 
  Home, 
  Moon, 
  Sun, 
  DraftingCompass, 
  LayoutDashboard, 
  Cloud, 
  Save, 
  MousePointer2, 
  ArrowRightLeft,
  X 
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function App() {
  const [rawData, setRawData] = useState({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState(null);
  
  const [layoutTrigger, setLayoutTrigger] = useState(0);

  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [expandedNodeId, setExpandedNodeId] = useState(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [theme, setTheme] = useState('light');
  const { 
    isSimulationMode, setIsSimulationMode, 
    blastRadius, clearAnalysis,
    draftData, handleNodeDrop, handleDeleteDraftNode,
    cloudFilter, setCloudFilter,
    activeAccounts,
    interactionMode, setInteractionMode, connectSource, setConnectSource,
    ghostNodeIds, toggleGhostNode,
    hasUnsavedChanges,
    handleAddDraftEdge,
  } = useAnalysis();

  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isCloudSettingsOpen, setIsCloudSettingsOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const initialLayoutPerformed = useRef(false);

  // Derive provider from node type prefix
  const getNodeProvider = (type) => {
    if (!type) return 'aws';
    if (type.startsWith('azure_')) return 'azure';
    if (type.startsWith('gcp_')) return 'gcp';
    return 'aws';
  };

  /* ── Filter Logic ──────────────────────────────────────────────── */
  const filteredNodes = useMemo(() => {
    let result = rawData.nodes || [];
    
    // Filter by cloud provider from Context
    result = result.filter(n => {
      const p = getNodeProvider(n.type);
      return cloudFilter[p];
    });

    // Filter by explicit Account selection
    if (activeAccounts !== null) {
      result = result.filter(n => !n.account_id || activeAccounts.has(String(n.account_id)));
    }

    return result;
  }, [rawData.nodes, cloudFilter, activeAccounts]);

  const filteredEdges = useMemo(() => {
    const visibleIds = new Set(filteredNodes.map(n => n.id));
    return rawData.edges.filter(e => visibleIds.has(e.source_id) && visibleIds.has(e.target_id));
  }, [rawData.edges, filteredNodes]);

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
            fetch(`/api/v1/nodes?account_id=all`)
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
  }, [applyAutoLayout]);

  // Removed automatic layout useEffect to prevent constant reorganization.
  // Layout is now triggered manually via applyAutoLayout() or on initial paint.

  /* ── Node Handling ────────────────────────────────────────────── */
  const handleNodeClick = useCallback((nodeId, e) => {
    if (interactionMode === 'connect') {
      if (!connectSource) {
        setConnectSource(nodeId);
      } else {
        if (connectSource !== nodeId) {
          handleAddDraftEdge(connectSource, nodeId);
        }
        setConnectSource(null);
        setInteractionMode('select');
      }
      return;
    }

    // Single click now handles both focus and opens analysis sidebar
    setFocusedNodeId(nodeId);
    setExpandedNodeId(null); // Close any expanded pipeline cards
    setIsAnalysisOpen(true); // Open analysis sidebar immediately
  }, [interactionMode, connectSource, setConnectSource, handleAddDraftEdge, setInteractionMode]);

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


  /* ── Delete Node ──────────────────────────────────────────────── */
  const handleDeleteNode = useCallback(async (nodeId) => {
    // If it's a draft node, solely remove it from local draft state
    if (String(nodeId).startsWith('planned-')) {
        handleDeleteDraftNode(nodeId);
        setFocusedNodeId(null);
        setExpandedNodeId(null);
        return;
    }


    // Otherwise, perform optimistic update and standard backend DELETE for live nodes
    setRawData(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source_id !== nodeId && e.target_id !== nodeId)
    }));
    
    setFocusedNodeId(null);
    setExpandedNodeId(null);

    try {
      const res = await fetch(`/api/v1/nodes/${nodeId}`, { method: 'DELETE' });
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
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) {
          return; // Allow native typing deletion
        }

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

  const handleZoomIn = useCallback(() => {
    const event = new CustomEvent('canvas-zoom-in');
    window.dispatchEvent(event);
  }, []);

  const handleZoomOut = useCallback(() => {
    const event = new CustomEvent('canvas-zoom-out');
    window.dispatchEvent(event);
  }, []);

  const handleFitView = useCallback(() => {
    const event = new CustomEvent('canvas-fit-view');
    window.dispatchEvent(event);
  }, []);

  if (isLoading && (!rawData || rawData.nodes.length === 0)) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <div className="text-sm font-medium opacity-60">
          Loading architecture…
        </div>
      </div>
    );
  }



  return (
    <TooltipProvider>
      <div className={cn(
        "relative w-screen h-screen overflow-hidden transition-colors duration-500 font-sans",
        theme === 'dark' ? "bg-background text-foreground" : "bg-[#f5f5f7] text-[#1d1d1f]"
      )}>
        {/* ── Top Header / Toolbar ─────────────────────────────────────── */}
        <div className="absolute top-0 left-0 right-0 h-14 bg-background/80 backdrop-blur-md border-b border-border z-40 flex items-center justify-between px-6">
          <div className="flex items-center gap-3 select-none">
            <h1 className="text-base font-bold tracking-tight text-foreground">
              Infradian
            </h1>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); clearFocus(); setPanOffset({ x: 0, y: 0 }); }}>
                  <Home className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset View</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-4 mx-1" />

            <Button variant="secondary" size="sm" onClick={(e) => setCmdKOpen(true)} className="gap-2 text-xs font-medium h-8">
              <Search className="size-3" />
              <span>Search</span>
              <kbd className="hidden sm:flex pointer-events-none h-4 items-center gap-1 rounded bg-muted px-1.5 font-mono text-[10px]"><span className="text-[9px]">⌘</span>K</kbd>
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => setTheme(p => p === 'light' ? 'dark' : 'light')}>
                  {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-4 mx-1" />

            <Button
              variant={isSimulationMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsSimulationMode(p => !p)}
              className={cn("h-8 gap-2 text-xs font-semibold", isSimulationMode && "bg-primary text-primary-foreground")}
            >
              <DraftingCompass className="size-3" />
              <span>Draft</span>
            </Button>

            <Separator orientation="vertical" className="h-4 mx-1" />

            {isSimulationMode && (
              <>
                <div className="flex items-center bg-muted/50 rounded-md p-0.5 border">
                  <Button variant={interactionMode === 'select' ? 'secondary' : 'ghost'} size="icon-xs" className="h-6 w-6" onClick={() => setInteractionMode('select')}>
                    <MousePointer2 className="size-3" />
                  </Button>
                  <Button variant={interactionMode === 'connect' ? 'secondary' : 'ghost'} size="icon-xs" className="h-6 w-6" onClick={() => setInteractionMode('connect')}>
                    <ArrowRightLeft className="size-3" />
                  </Button>
                </div>
                <Separator orientation="vertical" className="h-4 mx-1" />
              </>
            )}

            <Button variant="ghost" size="icon-sm" onClick={() => setIsWorkspaceOpen(true)} className={cn(hasUnsavedChanges ? "text-orange-500" : "")}>
              <div className="relative">
                <Save className="size-4" />
                {hasUnsavedChanges && <span className="absolute -top-1 -right-1 size-1.5 rounded-full bg-orange-500" />}
              </div>
            </Button>

            <Button variant="ghost" size="icon-sm" onClick={() => setIsCloudSettingsOpen(true)}>
              <Cloud className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative mt-14">
          {/* Planning Mode Sidebar - Fixed spacing logic */}
          <AnimatePresence>
            {isSimulationMode && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="shrink-0 z-[45]"
              >
                <PlanningPanel theme={theme} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 relative min-w-0">
            <CytoscapeCanvas 
              graphData={{
                nodes: [...filteredNodes, ...draftData.nodes],
                edges: [...filteredEdges, ...draftData.edges]
              }}
              layoutTrigger={layoutTrigger}
              onNodeClick={(id) => handleNodeClick(id)}
              onNodeRightClick={(id) => {
                if (isSimulationMode) toggleGhostNode(id);
              }}
              onCanvasClick={() => clearFocus()}
              onNodeHover={setHoveredNodeId}
              onNodeDrop={handleNodeDrop}
              theme={theme}
              ghostNodeIds={ghostNodeIds}
            />

            {/* DOM Overlays managed by Cytoscape JS renderedPosition() */}
            <div className="absolute inset-0 pointer-events-none z-10">
              {[...filteredNodes, ...draftData.nodes].map(node => {
                const isRegion = ['aws_vpc', 'aws_subnet'].includes(node.type);
                const isGhost = ghostNodeIds.has(node.id);
                return (
                  <div 
                    id={`infranode-${node.id}`} 
                    key={node.id} 
                    className="absolute top-0 left-0"
                    style={{ 
                      willChange: 'transform',
                      opacity: blastRadius?.impactedNodes 
                               && !blastRadius.impactedNodes.some(n => String(n.id) === String(node.id)) 
                               && String(node.id) !== String(blastRadius.nodeId) ? 0.25 : 1,
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
                    isGhost={isGhost}
                    onToggleGhost={() => toggleGhostNode(node.id)}
                    interactionMode={interactionMode}
                  />
                </div>
              );
            })}
            </div>
          </div>
          {/* Analysis Panel (Right Sidebar) */}
          <AnimatePresence>
            {focusedNodeId && isAnalysisOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 380, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="shrink-0 z-[45] border-l"
              >
                <div className="w-[380px] h-full flex flex-col bg-background/95">
                  <AnalysisPanel 
                    node={[...filteredNodes, ...draftData.nodes].find(n => String(n.id) === String(focusedNodeId))}
                    theme={theme}
                    onClose={() => clearFocus()}
                    onDeleteNode={handleDeleteNode}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <StatusBar 
          theme={theme}
          nodes={filteredNodes}
          edges={filteredEdges}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          onOrganize={applyAutoLayout}
          focusedNodeId={focusedNodeId}
          clearFocus={clearFocus}
        />
        
        <CloudSettings
          isOpen={isCloudSettingsOpen}
          onClose={() => setIsCloudSettingsOpen(false)}
          theme={theme}
        />

        <AnimatePresence>
          {isWorkspaceOpen && (
            <WorkspaceManager
              isOpen={isWorkspaceOpen}
              onClose={() => setIsWorkspaceOpen(false)}
              theme={theme}
            />
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
