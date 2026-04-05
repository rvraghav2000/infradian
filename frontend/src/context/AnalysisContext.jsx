import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const AnalysisContext = createContext({
    isSimulationMode: false,
    setIsSimulationMode: () => { },
    simulationData: null,
    setSimulationData: () => { },
    hoveredNodeAnalysis: null,
    setHoveredNodeAnalysis: () => {},
    runSimulation: () => {},
    runSafetyCheck: () => {},
});

export function AnalysisProvider({ children }) {
    const [isSimulationMode, setIsSimulationMode] = useState(false);
    const [simulationData, setSimulationData] = useState(null);
    const [hoveredNodeAnalysis, setHoveredNodeAnalysis] = useState(null);

    const runSimulation = useCallback((node, blastRadius) => {
        if (!node) return;
        setIsSimulationMode(true);
        
        // Refined simulation logic based on node type and impact
        const baseCost = node.attributes?.monthly_cost || 50;
        const affectedCount = blastRadius?.affected_count || 0;
        
        let riskReduction = 5.0;
        if (node.type.includes('rds')) riskReduction = 15.0;
        else if (node.type.includes('vpc')) riskReduction = 25.0;
        
        // Confidence drops as dependency chain grows
        const confidence = Math.max(0.6, 0.95 - (affectedCount * 0.05));
        
        setSimulationData({
            node_id: node.id,
            riskReduction: riskReduction + (affectedCount * 0.5),
            costDelta: -baseCost,
            criticalImpact: affectedCount > 3,
            confidence: confidence * 100
        });
    }, []);

    const runSafetyCheck = useCallback((node) => {
        if (!node) return;
        // Placeholder for the "Algorithm"
        const isSafe = !node.type.includes('rds') && !node.type.includes('vpc');
        const score = isSafe ? 85 : 42;
        
        return {
            isSafe,
            score,
            recommendation: isSafe ? "Safe to proceed with caution." : "High risk detected. Review dependencies."
        };
    }, []);

    const value = useMemo(() => ({
        isSimulationMode,
        setIsSimulationMode,
        simulationData,
        setSimulationData,
        hoveredNodeAnalysis,
        setHoveredNodeAnalysis,
        runSimulation,
        runSafetyCheck
    }), [isSimulationMode, simulationData, hoveredNodeAnalysis, runSimulation, runSafetyCheck]);

    return (
        <AnalysisContext.Provider value={value}>
            {children}
        </AnalysisContext.Provider>
    );
}

export function useAnalysis() {
    return useContext(AnalysisContext);
}
