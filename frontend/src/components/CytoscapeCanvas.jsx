import React, { useMemo, useRef, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { useAnalysis } from '../context/AnalysisContext';
import { cn } from "@/lib/utils";
import { Plus, Layout } from "lucide-react";

cytoscape.use(dagre);

/**
 * CytoscapeCanvas — Functional component to visualize infrastructure
 * strictly controlled by props passed from App.jsx.
 */
const CytoscapeCanvas = ({ graphData, layoutTrigger, onNodeClick, onCanvasClick, onNodeHover, onNodeDrop, theme = 'light' }) => {
  const cyRef = useRef(null);

  // Flatten Neo4j payload into Cytoscape's required flat array
  const cyElements = useMemo(() => {
    if (!graphData || (!graphData.nodes?.length && !graphData.edges?.length)) return [];

    const formattedNodes = (graphData.nodes || []).map(n => {
      return { 
        data: { 
          ...n, 
          id: String(n.id), 
          original_id: n.id,
          parent: (n.parentId || n.parent_id) ? String(n.parentId || n.parent_id) : undefined
        } 
      };
    });

    const formattedEdges = (graphData.edges || []).map(e => ({
      data: {
        ...e,
        id: e.id ? String(e.id) : `${e.source_id}-${e.target_id}`,
        source: String(e.source_id),
        target: String(e.target_id)
      }
    }));

    return [...formattedNodes, ...formattedEdges];
  }, [graphData]);

  // Strictly memoize stylesheet
  const stylesheet = useMemo(() => [
    {
      selector: '*',
      style: {
        'overlay-opacity': 0 
      }
    },
    {
      selector: 'core',
      style: {
        'active-bg-opacity': 0,
        'selection-box-opacity': 0,
        'selection-box-border-width': 0
      }
    },
    {
      selector: 'node',
      style: {
        'background-opacity': 0.001,
        'border-width': 0,
        'label': '',
        'width': '220px',
        'height': '60px',
        'shape': 'round-rectangle',
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': '#94a3b8', 
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier', 
        'line-style': 'solid',
        'label': 'data(label)',
        'font-family': 'Inter, -apple-system, sans-serif',
        'font-size': '9px',
        'color': '#64748b',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.95,
        'text-background-padding': '4px',
        'text-background-shape': 'roundrectangle',
        'text-border-color': '#e2e8f0',
        'text-border-width': 1,
      }
    },
    {
      selector: ':parent',
      style: {
        'background-opacity': 0,
        'border-width': 0,
        'label': '',
        'padding': '48px'
      }
    }
  ], []);

  const layoutConfig = useMemo(() => ({
    name: 'dagre',
    rankDir: 'TB',
    spacingFactor: 2.0,
    animate: true,
    fit: false
  }), []);

  const { blastRadius, activePath, activePathStep } = useAnalysis();

  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    cy.batch(() => {
      cy.edges().style({
        'width': 1.5,
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        'line-style': 'solid',
        'opacity': 1,
      });

      if (activePath?.path?.length > 1) {
        cy.edges().style({ 'opacity': 0.1 });
        for (let i = 0; i < activePath.path.length - 1; i++) {
          const src = String(activePath.path[i]);
          const tgt = String(activePath.path[i + 1]);
          const pathEdges = cy.edges().filter(e =>
            e.data('source') === src && e.data('target') === tgt
          );
          const isCurrentHop = i === activePathStep;
          pathEdges.style({
            'width': isCurrentHop ? 3 : 1.5,
            'line-color': isCurrentHop ? '#2563eb' : '#60a5fa',
            'target-arrow-color': isCurrentHop ? '#2563eb' : '#60a5fa',
            'line-style': 'solid',
            'opacity': 1,
          });
        }
        return; 
      }

      if (blastRadius?.impactedNodes?.length > 0) {
        const impactedIds = new Set(blastRadius.impactedNodes.map(n => String(n.id)));
        const sourceId = String(blastRadius.nodeId);
        impactedIds.add(sourceId);
        cy.edges().forEach(edge => {
          const src = edge.data('source');
          const tgt = edge.data('target');
          if (impactedIds.has(src) && impactedIds.has(tgt)) {
            edge.style({
              'width': 2,
              'line-color': '#dc2626',
              'target-arrow-color': '#dc2626',
              'line-style': 'solid',
              'opacity': 1,
            });
          } else {
            edge.style({ 'opacity': 0.2 });
          }
        });
      }
    });
  }, [blastRadius, activePath, activePathStep, theme, graphData]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/infradian-node-data');
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }

    if (cyRef.current) {
      const cy = cyRef.current;
      const pan = cy.pan();
      const zoom = cy.zoom();
      const rect = e.currentTarget.getBoundingClientRect();
      const graphX = (e.clientX - rect.left - pan.x) / zoom;
      const graphY = (e.clientY - rect.top - pan.y) / zoom;

      if (onNodeDrop) onNodeDrop(payload, graphX, graphY);
    }
  };

  const isEmpty = cyElements.length === 0;

  return (
    <div 
      className="w-full h-full relative flex items-center justify-center bg-transparent"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >



      <CytoscapeComponent
        elements={cyElements}
        style={{ width: '100%', height: '100%', outline: 'none' }}
        stylesheet={stylesheet}
        cy={(cy) => {
          cyRef.current = cy;
          if (!cy.scratch('_eventsBound')) {
            cy.scratch('_eventsBound', true);
            cy.scratch('last_layout_trigger', layoutTrigger);

            cy.on('add', 'node', (e) => {
              const node = e.target;
              const attrs = node.data('attributes');
              if (node.id().startsWith('planned-') && attrs && attrs.spawnX !== undefined) {
                node.position({
                  x: attrs.spawnX,
                  y: attrs.spawnY
                });
              }
            });

            cy.on('tap', 'node', (e) => {
              const originalId = e.target.data('original_id') !== undefined ? e.target.data('original_id') : e.target.id();
              if (onNodeClick) onNodeClick(originalId, e.originalEvent);
            });

            cy.on('tap', (e) => {
              if (e.target === cy && onCanvasClick) {
                onCanvasClick();
              }
            });

            cy.on('mouseover', 'node', (e) => {
              const originalId = e.target.data('original_id') !== undefined ? e.target.data('original_id') : e.target.id();
              if (onNodeHover) onNodeHover(originalId);
              cy.container().style.cursor = 'pointer'; 
            });
            cy.on('mouseout', 'node', (e) => {
              if (onNodeHover) onNodeHover(null);
              cy.container().style.cursor = 'default';
            });

            // Global zoom/fit event listeners dispatched from the StatusBar
            const handleZoomIn = () => cy.zoom({ level: cy.zoom() + 0.2, renderedPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 } });
            const handleZoomOut = () => cy.zoom({ level: Math.max(0.1, cy.zoom() - 0.2), renderedPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 } });
            const handleFitView = () => { cy.fit(); cy.zoom(cy.zoom() * 0.85); };
            
            window.addEventListener('canvas-zoom-in', handleZoomIn);
            window.addEventListener('canvas-zoom-out', handleZoomOut);
            window.addEventListener('canvas-fit-view', handleFitView);
            
            // Cleanup on unmount (note: cy.scratch is not perfectly clean for event listeners but suffices here)
            window.addEventListener('beforeunload', () => {
              window.removeEventListener('canvas-zoom-in', handleZoomIn);
              window.removeEventListener('canvas-zoom-out', handleZoomOut);
              window.removeEventListener('canvas-fit-view', handleFitView);
            });

            const CARD_W = 220;
            const CARD_H = 60;

            cy.on('render pan zoom drag', () => {
              const zoom = cy.zoom();
              const nodeModelW = CARD_W / zoom;
              const nodeModelH = CARD_H / zoom;

              cy.nodes().forEach(node => {
                if (!node.isParent()) {
                  node.style({ width: `${nodeModelW}px`, height: `${nodeModelH}px` });
                }

                const el = document.getElementById(`infranode-${node.id()}`);
                if (el) {
                  const pos = node.renderedPosition();
                  // Apply translation relative to the parent container
                  el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
                  
                  if (node.isParent()) {
                    const bb = node.renderedBoundingBox({ includeNodes: true, includeEdges: false, includeLabels: false });
                    el.style.width = `${bb.w}px`;
                    el.style.height = `${bb.h}px`;
                  }
                }
              });
            });

          } 

          cy.scratch('onNodeHover', onNodeHover);

          if (cy.scratch('last_layout_trigger') !== layoutTrigger) {
            cy.scratch('last_layout_trigger', layoutTrigger);
            cy.layout({
              name: 'dagre',
              rankDir: 'TB',
              spacingFactor: 2.0,
              nodeSep: 60,
              rankSep: 80,
              animate: true,
              animationDuration: 600,
              animationEasing: 'ease-in-out-cubic',
              fit: false,
              stop: () => {
                // Center the graph after first layout
                cy.fit(undefined, 60);
              }
            }).run();
          }

        }}
        layout={layoutConfig}
        zoomingEnabled={true}
        userZoomingEnabled={true} 
        boxSelectionEnabled={false}
      />
    </div>
  );
};

export default CytoscapeCanvas;

