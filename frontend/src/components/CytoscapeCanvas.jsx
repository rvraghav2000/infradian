import React, { useMemo, useRef, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { useAnalysis } from '../context/AnalysisContext';

cytoscape.use(dagre);

/**
 * CytoscapeCanvas — Functional component to visualize infrastructure
 * strictly controlled by props passed from App.jsx.
 */
const CytoscapeCanvas = ({ graphData, layoutTrigger, onNodeClick, onCanvasClick, onNodeHover, onNodeDrop, theme = 'light' }) => {
  const cyRef = useRef(null);
  const zoomTextRef = useRef(null);

  // Flatten Neo4j payload into Cytoscape's required flat array
  const cyElements = useMemo(() => {
    if (!graphData || (!graphData.nodes?.length && !graphData.edges?.length)) return [];

    // Explicitly add position coordinates for draft nodes if they don't have them
    // so they don't stack at 0,0
    const formattedNodes = (graphData.nodes || []).map(n => {
      // Smuggle the original integer ID so Cytoscape's string coercion doesn't sever React state
      // Ensure the WebGL id property strictly receives a String to avoid fatal .length runtime crashes
      return { 
        data: { 
          ...n, 
          id: String(n.id), 
          original_id: n.id,
          // Wire parent property → Cytoscape's compound 'parent' field.
          // Support both snake_case (backend) and camelCase (planned)
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

  // Strictly memoize stylesheet to prevent Cytoscape freezing on React ticks
  const stylesheet = useMemo(() => [
    {
      selector: '*',
      style: {
        'overlay-opacity': 0 // Banish the default tap circles/boxes natively
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
        'background-opacity': 0.001, // 0.001 epsilon MUST be maintained so WebGL hit-testing isn't mathematically bypassed
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
        'line-color': '#007AFF', // Vibrant Blue
        'target-arrow-color': '#007AFF',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier', // Smooth, direct curves that don't jump wildly during node drags
        'line-style': 'dashed',
        'line-dash-pattern': [8, 6],
        'label': 'data(label)',
        'font-family': 'Inter, -apple-system, sans-serif',
        'font-size': '9px',
        'color': '#86868b',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.92,
        'text-background-padding': '4px',
        'text-background-shape': 'roundrectangle',
        'text-border-color': 'rgba(0,0,0,0.06)',
        'text-border-width': 0.5,
      }
    },
    {
      selector: ':parent',
      style: {
        'background-opacity': 0,    // Fully transparent — HTML overlay draws the background
        'border-width': 0,           // No WebGL border — HTML RegionNode draws its own
        'label': '',                 // Suppress native label — HTML RegionNode renders its own
        'padding': '48px'            // Generous padding so child nodes breathe inside regions
      }
    }
  ], []);

  const layoutConfig = useMemo(() => ({
    name: 'dagre',
    rankDir: 'TB',
    spacingFactor: 2.0,   // More space between nodes to prevent overlap
    animate: true,
    fit: false
  }), []);

  // ── Analysis-driven graph highlighting ─────────────────────────────
  const { blastRadius, activePath, activePathStep } = useAnalysis();

  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    cy.batch(() => {
      // Reset all edges to default
      cy.edges().style({
        'width': 1.5,
        'line-color': '#007AFF',
        'target-arrow-color': '#007AFF',
        'line-style': 'dashed',
        'line-dash-pattern': [8, 6],
        'opacity': 1,
      });

      // ── Path highlighting (takes priority) ──────────────────────
      if (activePath?.path?.length > 1) {
        // Dim all edges first
        cy.edges().style({ 'opacity': 0.15 });
        // Highlight path edges
        for (let i = 0; i < activePath.path.length - 1; i++) {
          const src = String(activePath.path[i]);
          const tgt = String(activePath.path[i + 1]);
          const pathEdges = cy.edges().filter(e =>
            e.data('source') === src && e.data('target') === tgt
          );
          const isCurrentHop = i === activePathStep;
          pathEdges.style({
            'width': isCurrentHop ? 4 : 2.5,
            'line-color': isCurrentHop ? '#007AFF' : '#5AC8FA',
            'target-arrow-color': isCurrentHop ? '#007AFF' : '#5AC8FA',
            'line-style': 'solid',
            'opacity': 1,
          });
        }
        return; // Skip blast highlighting when path is active
      }

      // ── Blast radius edge highlighting ──────────────────────────
      if (blastRadius?.impactedNodes?.length > 0) {
        const impactedIds = new Set(blastRadius.impactedNodes.map(n => String(n.id)));
        const sourceId = String(blastRadius.nodeId);
        impactedIds.add(sourceId);
        cy.edges().forEach(edge => {
          const src = edge.data('source');
          const tgt = edge.data('target');
          if (impactedIds.has(src) && impactedIds.has(tgt)) {
            edge.style({
              'width': 2.5,
              'line-color': '#FF3B30',
              'target-arrow-color': '#FF3B30',
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
      style={{ 
        width: '100%', 
        height: '100vh', 
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isEmpty && (
        <div style={{ 
          textAlign: 'center', 
          color: theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
          zIndex: 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏗️</div>
          <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.02em' }}>
            Canvas is empty
          </div>
          <p style={{ fontSize: 11, marginTop: 6, opacity: 0.8 }}>
            Drag components from the sidebar to start drafting
          </p>
        </div>
      )}


      {/* Zoom indicator restored from IsometricCanvas */}
      <div className="absolute top-7 right-8 z-[999] select-none">
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl"
          style={{
            background: theme === 'dark' ? 'rgba(30,30,32,0.85)' : 'rgba(255,255,255,0.85)',
            border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
            backdropFilter: 'blur(12px)',
            boxShadow: theme === 'dark' ? '0 4px 12px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); if (cyRef.current) cyRef.current.zoom({ level: Math.max(0.01, cyRef.current.zoom() - 0.2), renderedPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 } }); }}
            className="text-[13px] w-6 h-6 rounded flex items-center justify-center cursor-pointer bg-transparent border-0"
            style={{ color: theme === 'dark' ? '#aeaeb2' : '#86868b' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >−</button>
          <span ref={zoomTextRef} className="text-[11px] font-medium w-10 text-center" style={{ color: theme === 'dark' ? '#fff' : '#1d1d1f' }}>
            100%
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); if (cyRef.current) cyRef.current.zoom({ level: cyRef.current.zoom() + 0.2, renderedPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 } }); }}
            className="text-[13px] w-6 h-6 rounded flex items-center justify-center cursor-pointer bg-transparent border-0"
            style={{ color: theme === 'dark' ? '#aeaeb2' : '#86868b' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >+</button>
        </div>
      </div>

      <CytoscapeComponent
        elements={cyElements}
        style={{ width: '100%', height: '100%', outline: 'none' }}
        stylesheet={stylesheet}
        cy={(cy) => {
          cyRef.current = cy;
          // Binding events only once
          if (!cy.scratch('_eventsBound')) {
            cy.scratch('_eventsBound', true);

            // Hook into layout trigger prop changes manually
            cy.scratch('last_layout_trigger', layoutTrigger);

            // Place newly added nodes to avoid (0,0) physics singularity stacking
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

            cy.on('cxttap', 'node', (e) => {
              const originalId = e.target.data('original_id') !== undefined ? e.target.data('original_id') : e.target.id();
              if (cy.scratch('onNodeRightClick')) {
                 cy.scratch('onNodeRightClick')(originalId, e.originalEvent);
              }
            });
            // Tap event for the canvas background
            cy.on('tap', (e) => {
              if (e.target === cy && onCanvasClick) {
                onCanvasClick();
              }
            });

            // Hover events delegated to React state to bypass pointer-events HTML blocking
            cy.on('mouseover', 'node', (e) => {
              const originalId = e.target.data('original_id') !== undefined ? e.target.data('original_id') : e.target.id();
              if (onNodeHover) onNodeHover(originalId);
              cy.container().style.cursor = 'pointer'; // Restore the native HTML hand cursor
            });
            cy.on('mouseout', 'node', (e) => {
              if (onNodeHover) onNodeHover(null);
              cy.container().style.cursor = 'default';
            });

            if (!cy.scratch('_wheelBound')) {
              cy.scratch('_wheelBound', true);
              cy.scratch('scrollLock', null);
              cy.scratch('lockTimeout', null);

              window.addEventListener('wheel', (e) => {
                // If the user's mouse is actively over a fixed sidebar or modal, let them natively scroll it
                if (e.target.closest('.fixed')) return;

                e.preventDefault(); // Block Chrome from zooming the browser UI or navigating history
                e.stopPropagation();

                // Recalculate pure screen-space coordinates since e.offsetX/Y breaks if hovered over an HTML card
                const rect = cy.container().getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                if (e.ctrlKey || e.metaKey) {
                  // Trackpad pinch-to-zoom / Apple.com CMD+Scroll Zoom
                  const zoomLvl = cy.zoom();
                  const targetZoom = zoomLvl * Math.exp(-e.deltaY * 0.015);
                  cy.zoom({ level: targetZoom, renderedPosition: { x, y } });
                } else {
                  // 1-Axis Continuous Scroll Lock (Prevents diagonal wobble)
                  if (!cy.scratch('scrollLock')) {
                    cy.scratch('scrollLock', Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'x' : 'y');
                  }
                  clearTimeout(cy.scratch('lockTimeout'));
                  cy.scratch('lockTimeout', setTimeout(() => { cy.scratch('scrollLock', null); }, 150));

                  // Apply 1:1 native hardware pan
                  const lockAxis = cy.scratch('scrollLock');
                  if (lockAxis === 'x') {
                    cy.panBy({ x: -e.deltaX, y: 0 });
                  } else {
                    cy.panBy({ x: 0, y: -e.deltaY });
                  }
                }
              }, { passive: false, capture: true }); // Capture phase guarantees we intercept before WebGL or React
            }



            // CARD_W / CARD_H are the fixed pixel dimensions of the React cards.
            // These never change — zoom only affects inter-node spacing.
            const CARD_W = 220;
            const CARD_H = 60;

            cy.on('render pan zoom drag', () => {
              const zoom = cy.zoom();

              // Fast DOM mutation for the zoom indicator (bypasses React loop)
              if (zoomTextRef.current) {
                const pct = Math.round(zoom * 100);
                const pctStr = `${pct}%`;
                if (zoomTextRef.current.innerText !== pctStr) {
                  zoomTextRef.current.innerText = pctStr;
                }
              }

              // Inverse-scale the WebGL hitboxes so their SCREEN size always equals
              // CARD_W × CARD_H pixels, regardless of zoom level.
              // Formula: screen_size = model_size × zoom  →  model_size = CARD_W / zoom
              // This ensures Cytoscape arrows always connect to the visual card boundary.
              const nodeModelW = CARD_W / zoom;
              const nodeModelH = CARD_H / zoom;

              cy.nodes().forEach(node => {
                if (!node.isParent()) {
                  node.style({ width: `${nodeModelW}px`, height: `${nodeModelH}px` });
                }

                const el = document.getElementById(`infranode-${node.id()}`);
                if (el) {
                  const pos = node.renderedPosition();
                  el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;

                  if (node.isParent()) {
                    el.style.setProperty('--region-w', `${node.outerWidth() * zoom}px`);
                    el.style.setProperty('--region-h', `${node.outerHeight() * zoom}px`);
                  }
                }
              });
            });

          } // End one-time binding

          // Ensure prop callbacks are always fresh without needing to rebind events
          cy.scratch('onNodeHover', onNodeHover);

          // Dynamic updates: if layoutTrigger increments, run layout
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
              fit: false
            }).run();
          }

        }}
        layout={layoutConfig}
        zoomingEnabled={true}
        userZoomingEnabled={false} // Disable Cytoscape default scroll wheel zoom
      />
    </div>
  );
};

export default CytoscapeCanvas;
