import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  fetchBlastRadius,
  fetchSafeDelete,
  fetchSimulateRemoval,
  fetchTopActions,
} from '../services/analysisApi';
import {
  fetchValidation,
  fetchReadiness,
} from '../services/uimApi';

const AnalysisContext = createContext({});

export function AnalysisProvider({ children }) {
  const dropLockRef = useRef(false);

  // ── Core mode state ─────────────────────────────────────────
  const [isSimulationMode, setIsSimulationMode] = useState(false);

  // ── Cloud provider filter ────────────────────────────────────
  const [cloudFilter, setCloudFilter] = useState({ aws: true, azure: true, gcp: true });

  // ── Account filter ───────────────────────────────────────────
  const [activeAccounts, setActiveAccounts] = useState(null);

  // ── Interaction mode ─────────────────────────────────────────
  const [interactionMode, setInteractionMode] = useState('select'); // 'select' | 'connect' | 'annotate'
  const [connectSource, setConnectSource] = useState(null); // node ID when drawing edge

  // ── Multi-select ─────────────────────────────────────────────
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());

  // ── Ghost (simulated deletion) ───────────────────────────────
  const [ghostNodeIds, setGhostNodeIds] = useState(new Set());

  // ── Annotations ──────────────────────────────────────────────
  const [annotations, setAnnotations] = useState([]);

  // ── Workspace metadata ───────────────────────────────────────
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // ── UIM state (validation, readiness) ───────────────────────
  const [validationResult, setValidationResult] = useState(null);
  const [readinessResult, setReadinessResult] = useState(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [readinessLoading, setReadinessLoading] = useState(false);

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

  // ── UIM Loaders ─────────────────────────────────────────────

  const loadValidation = useCallback(async () => {
    setValidationLoading(true);
    try {
      const data = await fetchValidation(draftData.nodes, draftData.edges);
      setValidationResult(data);
    } catch (e) {
      console.error('Validation fetch failed:', e);
      setValidationResult(null);
    } finally {
      setValidationLoading(false);
    }
  }, [draftData]);

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const data = await fetchReadiness(draftData.nodes, draftData.edges);
      setReadinessResult(data);
    } catch (e) {
      console.error('Readiness fetch failed:', e);
      setReadinessResult(null);
    } finally {
      setReadinessLoading(false);
    }
  }, [draftData]);

  // Auto-trigger validation + readiness when entering simulation mode or when draft changes
  useEffect(() => {
    if (isSimulationMode) {
      loadValidation();
      loadReadiness();
    } else {
      setValidationResult(null);
      setReadinessResult(null);
    }
  }, [isSimulationMode, draftData, loadValidation, loadReadiness]);

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
    setHasUnsavedChanges(true);
  }, []);

  // ── Ghost toggle ────────────────────────────────────────────
  const toggleGhostNode = useCallback((nodeId) => {
    setGhostNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
    setHasUnsavedChanges(true);
  }, []);

  // ── Edge drawing ────────────────────────────────────────────
  const handleAddDraftEdge = useCallback((sourceId, targetId, metadata = {}) => {
    const edgeId = `planned-edge-${sourceId}-${targetId}-${Date.now()}`;
    const newEdge = {
      id: edgeId,
      source_id: sourceId,
      target_id: targetId,
      label: metadata.label || 'DEPENDS_ON',
      dependency_mode: metadata.dependency_mode || 'sync',
      interaction_type: metadata.interaction_type || 'runtime_call',
      primary: metadata.primary !== false,
      inferred: false,
      confidence: 1.0,
      traffic_share: 1.0,
    };
    setDraftData(prev => ({ ...prev, edges: [...prev.edges, newEdge] }));
    setHasUnsavedChanges(true);
    return newEdge;
  }, []);

  const handleDeleteDraftEdge = useCallback((edgeId) => {
    setDraftData(prev => ({ ...prev, edges: prev.edges.filter(e => e.id !== edgeId) }));
    setHasUnsavedChanges(true);
  }, []);

  // ── Annotation ops ──────────────────────────────────────────
  const addAnnotation = useCallback((text, x, y) => {
    const id = `annotation-${Date.now()}`;
    setAnnotations(prev => [...prev, { id, text, x, y }]);
    setHasUnsavedChanges(true);
    return id;
  }, []);

  const updateAnnotation = useCallback((id, updates) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    setHasUnsavedChanges(true);
  }, []);

  const deleteAnnotation = useCallback((id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    setHasUnsavedChanges(true);
  }, []);

  // ── Draft node editing ──────────────────────────────────────
  const updateDraftNode = useCallback((nodeId, updates) => {
    setDraftData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n)
    }));
    setHasUnsavedChanges(true);
  }, []);

  // ── Workspace load/restore ──────────────────────────────────
  const loadWorkspaceState = useCallback((ws) => {
    if (ws.draftNodes) setDraftData({ nodes: ws.draftNodes, edges: ws.draftEdges || [] });
    if (ws.ghostNodeIds) setGhostNodeIds(new Set(ws.ghostNodeIds));
    if (ws.annotations) setAnnotations(ws.annotations);
    if (ws.cloudFilter) setCloudFilter(ws.cloudFilter);
    setActiveWorkspace({ id: ws.id, name: ws.name, description: ws.description });
    setHasUnsavedChanges(false);
  }, []);

  const getWorkspacePayload = useCallback(() => ({
    draftNodes: draftData.nodes,
    draftEdges: draftData.edges,
    ghostNodeIds: [...ghostNodeIds],
    annotations,
    cloudFilter,
  }), [draftData, ghostNodeIds, annotations, cloudFilter]);


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
    // Cloud filter
    cloudFilter, setCloudFilter,
    // Interaction mode
    interactionMode, setInteractionMode, connectSource, setConnectSource,
    // Multi-select
    selectedNodeIds, setSelectedNodeIds,
    // Ghost nodes
    ghostNodeIds, toggleGhostNode,
    // Annotations
    annotations, addAnnotation, updateAnnotation, deleteAnnotation,
    // Workspace
    activeWorkspace, setActiveWorkspace, hasUnsavedChanges, setHasUnsavedChanges,
    loadWorkspaceState, getWorkspacePayload,
    // Simulation / Drafting
    draftData, setDraftData,
    handleNodeDrop, handleDeleteDraftNode, updateDraftNode,
    handleAddDraftEdge, handleDeleteDraftEdge,
    // Results
    blastRadius, safeDeleteResult, simulationResult, topActions,
    // Loading
    blastLoading, safeDeleteLoading, simulationLoading, topActionsLoading,
    // Path explorer
    activePath, activePathStep, selectPath, stepPath,
    // Overlay
    overlayMode, setOverlayMode,
    // UIM results
    validationResult, readinessResult,
    validationLoading, readinessLoading,
    // Actions
    loadBlastRadius, loadSafeDelete, loadSimulation, loadTopActions, clearAnalysis,
    loadValidation, loadReadiness,
    // Accounts
    activeAccounts, setActiveAccounts,
  }), [
    isSimulationMode, cloudFilter, interactionMode, connectSource,
    selectedNodeIds, ghostNodeIds, annotations,
    activeWorkspace, hasUnsavedChanges,
    draftData, blastRadius, safeDeleteResult, simulationResult, topActions,
    blastLoading, safeDeleteLoading, simulationLoading, topActionsLoading,
    activePath, activePathStep, overlayMode,
    validationResult, readinessResult, validationLoading, readinessLoading,
    loadBlastRadius, loadSafeDelete, loadSimulation, loadTopActions, clearAnalysis,
    loadValidation, loadReadiness,
    handleNodeDrop, handleDeleteDraftNode, updateDraftNode,
    handleAddDraftEdge, handleDeleteDraftEdge,
    toggleGhostNode, addAnnotation, updateAnnotation, deleteAnnotation,
    loadWorkspaceState, getWorkspacePayload,
    selectPath, stepPath, activeAccounts,
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
