import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const AnalysisContext = createContext({
    activeOverlays: new Set(),
    toggleOverlay: () => {},
    isSimulationMode: false,
    setIsSimulationMode: () => {},
    simulationData: null,
    setSimulationData: () => {},
    hoveredNodeAnalysis: null,
    setHoveredNodeAnalysis: () => {}
});

export const OVERLAY_TYPES = {
    RISK: 'risk',
    COST: 'cost',
    TRAFFIC: 'traffic',
    CONFIDENCE: 'confidence'
};

export function AnalysisProvider({ children }) {
    const [activeOverlays, setActiveOverlays] = useState(new Set());
    const [isSimulationMode, setIsSimulationMode] = useState(false);
    const [simulationData, setSimulationData] = useState(null);
    const [hoveredNodeAnalysis, setHoveredNodeAnalysis] = useState(null);

    const toggleOverlay = useCallback((type) => {
        setActiveOverlays(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }, []);

    const value = useMemo(() => ({
        activeOverlays,
        toggleOverlay,
        isSimulationMode,
        setIsSimulationMode,
        simulationData,
        setSimulationData,
        hoveredNodeAnalysis,
        setHoveredNodeAnalysis
    }), [activeOverlays, toggleOverlay, isSimulationMode, simulationData, hoveredNodeAnalysis]);

    return (
        <AnalysisContext.Provider value={value}>
            {children}
        </AnalysisContext.Provider>
    );
}

export function useAnalysis() {
    return useContext(AnalysisContext);
}
