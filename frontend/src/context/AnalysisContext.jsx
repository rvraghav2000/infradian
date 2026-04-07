import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import {
  fetchBlastRadius,
  fetchSafeDelete,
  fetchSimulateRemoval,
  fetchTopActions,
} from '../services/analysisApi';

const AnalysisContext = createContext({});

export function AnalysisProvider({ children }) {
  const dropLockRef = useRef(false);

  // ── Core mode state ─────────────────────────────────────────
  const [isSimulationMode, setIsSimulationMode] = useState(false);

  // ── Simulation / Drafting state ──────────────────────────────
  const [draftData, setDraftData] = useState({ nodes: [], edges: [] });


  // ── Analysis results ────────────────────────────────────────

  const [blastRadius, setBlastRadius] = useState(null);
  const [safeDeleteResult, setSafeDeleteResult] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [topActions, setTopActions] = useState(null);

  // ── Loading / error ─────────────────────────────────────────
  const [blastLoading, setBlastLoading] = useState(false);
  const [safeDeleteLoading, setSafeDeleteLoading] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [topActionsLoading, setTopActionsLoading] = useState(false);

  // ── Path explorer state ─────────────────────────────────────
  const [activePath, setActivePath] = useState(null);       // selected critical path object
  const [activePathStep, setActivePathStep] = useState(0);  // current hop index

  // ── Overlay mode ────────────────────────────────────────────
  const [overlayMode, setOverlayMode] = useState(null); // null | 'impact' | 'confidence'

  // ── API Actions ─────────────────────────────────────────────

  const loadBlastRadius = useCallback(async (nodeId) => {
    if (!nodeId) {
      setBlastRadius(null);
      return;
    }
    setBlastLoading(true);
    try {
      // Send draftData if we're in simulation mode to allow "What-if" analysis on planned nodes
      const data = await fetchBlastRadius(nodeId, isSimulationMode ? draftData : null);
      setBlastRadius(data);
    } catch (e) {
      console.error('Blast radius fetch failed:', e);
      setBlastRadius(null);
    } finally {
      setBlastLoading(false);
    }
  }, [isSimulationMode, draftData]);


  const loadSafeDelete = useCallback(async (nodeId) => {
    if (!nodeId) return;
    setSafeDeleteLoading(true);
    try {
      const data = await fetchSafeDelete(nodeId, isSimulationMode ? draftData : null);
      setSafeDeleteResult(data);
    } catch (e) {
      console.error('Safe delete fetch failed:', e);
      setSafeDeleteResult(null);
    } finally {
      setSafeDeleteLoading(false);
    }
  }, [isSimulationMode, draftData]);


  const loadSimulation = useCallback(async (nodeId) => {
    if (!nodeId) return;
    setSimulationLoading(true);
    try {
      const data = await fetchSimulateRemoval(nodeId, isSimulationMode ? draftData : null);
      setSimulationResult(data);
    } catch (e) {
      console.error('Simulation fetch failed:', e);
      setSimulationResult(null);
    } finally {
      setSimulationLoading(false);
    }
  }, [isSimulationMode, draftData]);


  const loadTopActions = useCallback(async (limit = 5) => {
    setTopActionsLoading(true);
    try {
      const data = await fetchTopActions(limit, isSimulationMode ? draftData : null);
      setTopActions(data);
    } catch (e) {
      console.error('Top actions fetch failed:', e);
      setTopActions(null);
    } finally {
      setTopActionsLoading(false);
    }
  }, [isSimulationMode, draftData]);


  const clearAnalysis = useCallback(() => {
    setBlastRadius(null);
    setSafeDeleteResult(null);
    setSimulationResult(null);
    setActivePath(null);
    setActivePathStep(0);
  }, []);

  // ── Drafting Operations ────────────────────────────────────

  const handleNodeDrop = useCallback(async (primitiveData, graphX, graphY) => {
    if (dropLockRef.current) return;
    dropLockRef.current = true;
    setTimeout(() => { dropLockRef.current = false; }, 100);

    const newId = `planned-${primitiveData.type.replace(/_/g, '-')}-${Math.floor(Math.random() * 10000)}`;

    const newNode = {
      ...primitiveData,
      id: newId,
      label: `Draft ${primitiveData.label || primitiveData.type}`,
      parentId: null,
      parent_id: null,
      status: 'planned', // Use 'planned' status to match backend NodeStatus enum
      metrics: { current_load: 0.0 },
      history: [],
      attributes: {
        spawnX: graphX,
        spawnY: graphY,
        ...primitiveData.attributes
      },
    };

    setDraftData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
    return newNode;
  }, []);


  const handleDeleteDraftNode = useCallback((nodeId) => {
    setDraftData(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
    }));
  }, []);


  const selectPath = useCallback((path) => {
    setActivePath(path);
    setActivePathStep(0);
  }, []);

  const stepPath = useCallback((direction) => {
    if (!activePath) return;
    const maxStep = (activePath.path?.length || 1) - 1;
    setActivePathStep(prev => {
      if (direction === 'next') return Math.min(prev + 1, maxStep);
      if (direction === 'prev') return Math.max(prev - 1, 0);
      return prev;
    });
  }, [activePath]);

  const value = useMemo(() => ({
    // Mode
    isSimulationMode, setIsSimulationMode,
    // Simulation / Drafting
    draftData, setDraftData, 
    handleNodeDrop, handleDeleteDraftNode,
    // Results
    blastRadius, safeDeleteResult, simulationResult, topActions,
    // Loading
    blastLoading, safeDeleteLoading, simulationLoading, topActionsLoading,
    // Path explorer
    activePath, activePathStep, selectPath, stepPath,
    // Overlay
    overlayMode, setOverlayMode,
    // Actions
    loadBlastRadius, loadSafeDelete, loadSimulation, loadTopActions, clearAnalysis,
  }), [
    isSimulationMode, draftData, blastRadius, safeDeleteResult, simulationResult, topActions,
    blastLoading, safeDeleteLoading, simulationLoading, topActionsLoading,
    activePath, activePathStep, overlayMode,
    loadBlastRadius, loadSafeDelete, loadSimulation, loadTopActions, clearAnalysis,
    handleNodeDrop, handleDeleteDraftNode, selectPath, stepPath,
  ]);



  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  return useContext(AnalysisContext);
}
