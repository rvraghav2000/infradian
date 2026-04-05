import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  fetchBlastRadius,
  fetchSafeDelete,
  fetchSimulateRemoval,
  fetchTopActions,
} from '../services/analysisApi';

const AnalysisContext = createContext({});

export function AnalysisProvider({ children }) {
  // ── Core mode state ─────────────────────────────────────────
  const [isSimulationMode, setIsSimulationMode] = useState(false);

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
    if (!nodeId || nodeId.startsWith('planned-')) {
      setBlastRadius(null);
      return;
    }
    setBlastLoading(true);
    try {
      const data = await fetchBlastRadius(nodeId);
      setBlastRadius(data);
    } catch (e) {
      console.error('Blast radius fetch failed:', e);
      setBlastRadius(null);
    } finally {
      setBlastLoading(false);
    }
  }, []);

  const loadSafeDelete = useCallback(async (nodeId) => {
    if (!nodeId) return;
    setSafeDeleteLoading(true);
    try {
      const data = await fetchSafeDelete(nodeId);
      setSafeDeleteResult(data);
    } catch (e) {
      console.error('Safe delete fetch failed:', e);
      setSafeDeleteResult(null);
    } finally {
      setSafeDeleteLoading(false);
    }
  }, []);

  const loadSimulation = useCallback(async (nodeId) => {
    if (!nodeId) return;
    setSimulationLoading(true);
    try {
      const data = await fetchSimulateRemoval(nodeId);
      setSimulationResult(data);
    } catch (e) {
      console.error('Simulation fetch failed:', e);
      setSimulationResult(null);
    } finally {
      setSimulationLoading(false);
    }
  }, []);

  const loadTopActions = useCallback(async (limit = 5) => {
    setTopActionsLoading(true);
    try {
      const data = await fetchTopActions(limit);
      setTopActions(data);
    } catch (e) {
      console.error('Top actions fetch failed:', e);
      setTopActions(null);
    } finally {
      setTopActionsLoading(false);
    }
  }, []);

  const clearAnalysis = useCallback(() => {
    setBlastRadius(null);
    setSafeDeleteResult(null);
    setSimulationResult(null);
    setActivePath(null);
    setActivePathStep(0);
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
    isSimulationMode, blastRadius, safeDeleteResult, simulationResult, topActions,
    blastLoading, safeDeleteLoading, simulationLoading, topActionsLoading,
    activePath, activePathStep, overlayMode,
    loadBlastRadius, loadSafeDelete, loadSimulation, loadTopActions, clearAnalysis,
    selectPath, stepPath,
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
