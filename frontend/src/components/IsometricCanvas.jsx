import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * InfraCanvas — Top-Down Canvas with Apple-smooth scrolling + pinch zoom
 *
 * Uses requestAnimationFrame + CSS transform for 60fps panning.
 * Apple-style: gentle deceleration, subtle momentum, pinch-to-zoom.
 */

/* ── Physics constants (tuned to match apple.com feel) ─────────── */
const FRICTION = 0.88;      // higher drag = stops faster (apple.com style)
const SCROLL_GAIN = 0.6;       // gentle scroll (was 1.4 — way too aggressive)
const MIN_VELOCITY = 0.2;
const MOMENTUM_CAP = 18;        // lower cap = no wild flinging
const ARROW_IMPULSE = 60;        // subtle nudge from arrow keys

/* ── Zoom constants ────────────────────────────────────────────── */
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.04;      // per scroll tick when Cmd held
const ZOOM_FRICTION = 0.85;

export default function InfraCanvas({ children, canvasSize, panOffset, onPan }) {
    const viewportRef = useRef(null);
    const surfaceRef = useRef(null);

    // Position + velocity (rAF-driven, not React state)
    const pos = useRef({ x: 0, y: 0 });
    const vel = useRef({ x: 0, y: 0 });
    const rafId = useRef(null);
    const isActive = useRef(false);
    const frameCount = useRef(0);

    // Zoom (React state for re-render, but also ref for rAF)
    const [zoom, setZoom] = useState(1);
    const zoomRef = useRef(1);
    const zoomVel = useRef(0);
    const targetZoom = useRef(1);

    // Dragging
    const [isDragging, setIsDragging] = useState(false);
    const dragState = useRef({ sx: 0, sy: 0, px: 0, py: 0, lastX: 0, lastY: 0, lastT: 0 });

    // External pan (Cmd+K focus)
    const isExternalPan = useRef(false);

    /* ── Sync external pan (from God Mode) ───────────────────────── */
    useEffect(() => {
        const dx = Math.abs(panOffset.x - pos.current.x);
        const dy = Math.abs(panOffset.y - pos.current.y);
        if (dx > 5 || dy > 5) {
            isExternalPan.current = true;
            vel.current = {
                x: (panOffset.x - pos.current.x) * 0.12,
                y: (panOffset.y - pos.current.y) * 0.12,
            };
            startLoop();
        }
    }, [panOffset]);

    /* ── Core animation loop (only for kb/fling/zoom) ────────────── */
    const tick = useCallback(() => {
        const v = vel.current;
        const p = pos.current;
        let needsUpdate = false;

        if (isExternalPan.current) {
            const dx = panOffset.x - p.x;
            const dy = panOffset.y - p.y;
            v.x = dx * 0.12;
            v.y = dy * 0.12;
            p.x += v.x;
            p.y += v.y;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
                p.x = panOffset.x;
                p.y = panOffset.y;
                isExternalPan.current = false;
                v.x = 0; v.y = 0;
            }
            needsUpdate = true;
        } else if (Math.abs(v.x) > 0.01 || Math.abs(v.y) > 0.01) {
            v.x *= FRICTION;
            v.y *= FRICTION;
            p.x += v.x;
            p.y += v.y;
            needsUpdate = true;
        }

        // Smooth zoom interpolation
        const zDiff = targetZoom.current - zoomRef.current;
        if (Math.abs(zDiff) > 0.001) {
            zoomRef.current += zDiff * 0.15;
            needsUpdate = true;
        } else {
            zoomRef.current = targetZoom.current;
        }

        if (needsUpdate && surfaceRef.current) {
            surfaceRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${zoomRef.current})`;

            frameCount.current++;
            if (frameCount.current % 3 === 0) {
                onPan(() => ({ x: p.x, y: p.y }));
                setZoom(zoomRef.current);
            }
        }

        const speed = Math.abs(v.x) + Math.abs(v.y);
        const zoomMoving = Math.abs(targetZoom.current - zoomRef.current) > 0.001;

        if (speed > MIN_VELOCITY || isExternalPan.current || zoomMoving) {
            rafId.current = requestAnimationFrame(tick);
        } else {
            v.x = 0; v.y = 0;
            isActive.current = false;
            if (needsUpdate) {
                onPan(() => ({ x: p.x, y: p.y }));
                setZoom(zoomRef.current);
            }
        }
    }, [onPan, panOffset]);

    function startLoop() {
        if (!isActive.current) {
            isActive.current = true;
            rafId.current = requestAnimationFrame(tick);
        }
    }

    // Force direct DOM update + React state (used by native wheel)
    function applyDirectUpdate(newX, newY) {
        pos.current.x = newX;
        pos.current.y = newY;
        if (surfaceRef.current) {
            surfaceRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0) scale(${zoomRef.current})`;
        }
        frameCount.current++;
        if (frameCount.current % 3 === 0) {
            onPan(() => ({ x: newX, y: newY }));
        }
    }

    useEffect(() => {
        return () => { if (rafId.current) cancelAnimationFrame(rafId.current); };
    }, []);

    /* ── Arrow key impulse ───────────────────────────────────────── */
    useEffect(() => {
        function handleKeyDown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.metaKey || e.ctrlKey) return;

            switch (e.key) {
                case 'ArrowLeft': e.preventDefault(); vel.current.x += ARROW_IMPULSE; startLoop(); break;
                case 'ArrowRight': e.preventDefault(); vel.current.x -= ARROW_IMPULSE; startLoop(); break;
                case 'ArrowUp': e.preventDefault(); vel.current.y += ARROW_IMPULSE; startLoop(); break;
                case 'ArrowDown': e.preventDefault(); vel.current.y -= ARROW_IMPULSE; startLoop(); break;
                // Zoom with +/- keys
                case '=': case '+': e.preventDefault(); targetZoom.current = clamp(targetZoom.current + 0.15, ZOOM_MIN, ZOOM_MAX); startLoop(); break;
                case '-': e.preventDefault(); targetZoom.current = clamp(targetZoom.current - 0.15, ZOOM_MIN, ZOOM_MAX); startLoop(); break;
                case '0': e.preventDefault(); targetZoom.current = 1; startLoop(); break;
                default: break;
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    /* ── Continuous Axis Lock tracking ───────────────────────────── */
    const scrollLock = useRef(null);
    const lockTimeout = useRef(null);

    /* ── Native Wheel Events (1:1 with hardware momentum) ────────── */
    const handleWheel = useCallback((e) => {
        e.preventDefault();
        isExternalPan.current = false;

        // Zoom (Pinch or Cmd+Scroll)
        if (e.ctrlKey || e.metaKey) {
            vel.current = { x: 0, y: 0 }; // kill pan momentum when zooming
            const delta = -e.deltaY * Math.max(0.01, ZOOM_STEP);
            targetZoom.current = clamp(targetZoom.current * Math.exp(delta), ZOOM_MIN, ZOOM_MAX);
            startLoop();
            return;
        }

        // Kill any physics fling when native scrolling starts
        vel.current = { x: 0, y: 0 };
        if (isActive.current) {
            cancelAnimationFrame(rafId.current);
            isActive.current = false;
        }

        // Determine Axis Lock (so it doesn't wobble diagonally)
        if (!scrollLock.current) {
            scrollLock.current = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'x' : 'y';
        }
        clearTimeout(lockTimeout.current);
        lockTimeout.current = setTimeout(() => { scrollLock.current = null; }, 150);

        // Apply native 1:1 hardware scroll
        let nx = pos.current.x;
        let ny = pos.current.y;

        if (scrollLock.current === 'x') {
            nx -= e.deltaX;
        } else {
            ny -= e.deltaY;
        }

        applyDirectUpdate(nx, ny);
    }, []);

    useEffect(() => {
        const el = viewportRef.current;
        if (el) {
            el.addEventListener('wheel', handleWheel, { passive: false });
            return () => el.removeEventListener('wheel', handleWheel);
        }
    }, [handleWheel]);

    /* ── Drag to pan (with fling) ────────────────────────────────── */
    const handleMouseDown = useCallback((e) => {
        if (e.target.closest('.node-card, .node-region, button, input')) return;
        setIsDragging(true);
        isExternalPan.current = false;
        vel.current = { x: 0, y: 0 };
        if (isActive.current) {
            cancelAnimationFrame(rafId.current);
            isActive.current = false;
        }
        dragState.current = {
            sx: e.clientX, sy: e.clientY,
            px: pos.current.x, py: pos.current.y,
            lastX: e.clientX, lastY: e.clientY,
            lastT: performance.now(),
        };
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;
        const ds = dragState.current;

        let nx = ds.px + (e.clientX - ds.sx);
        let ny = ds.py + (e.clientY - ds.sy);

        // Track fling velocity
        const now = performance.now();
        const dt = Math.max(1, now - ds.lastT);
        vel.current.x = (e.clientX - ds.lastX) / dt * 16;
        vel.current.y = (e.clientY - ds.lastY) / dt * 16;

        ds.lastX = e.clientX;
        ds.lastY = e.clientY;
        ds.lastT = now;

        applyDirectUpdate(nx, ny);
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);
        // Release → coast with physics
        vel.current.x = clamp(vel.current.x, -MOMENTUM_CAP, MOMENTUM_CAP);
        vel.current.y = clamp(vel.current.y, -MOMENTUM_CAP, MOMENTUM_CAP);
        startLoop();
    }, [isDragging]);

    /* ── Minimap ─────────────────────────────────────────────────── */
    const minimapScale = 0.08;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 720;
    const zoomPct = Math.round(zoomRef.current * 100);

    return (
        <>
            {/* HUD */}
            <div className="fixed top-7 left-9 z-50 select-none">
                <h1 className="text-[22px] font-semibold" style={{ color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                    Infradian
                </h1>
                <p className="text-[11px] mt-0.5" style={{ color: '#86868b', fontWeight: 500 }}>
                    Infrastructure Map
                </p>
                <p className="text-[10px] mt-1" style={{ color: '#aeaeb2' }}>
                    ⌘K Search · Scroll to pan · Pinch or ⌘+scroll to zoom · +/−/0 keys
                </p>
            </div>

            {/* Zoom indicator */}
            <div className="fixed top-7 right-9 z-50 select-none">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                    style={{
                        background: 'rgba(255,255,255,0.85)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        backdropFilter: 'blur(12px)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    }}
                >
                    <button
                        onClick={() => { targetZoom.current = clamp(targetZoom.current - 0.2, ZOOM_MIN, ZOOM_MAX); startLoop(); }}
                        className="text-[13px] w-6 h-6 rounded flex items-center justify-center cursor-pointer bg-transparent border-0"
                        style={{ color: '#86868b' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >−</button>
                    <span className="text-[11px] font-medium w-10 text-center" style={{ color: '#1d1d1f' }}>
                        {zoomPct}%
                    </span>
                    <button
                        onClick={() => { targetZoom.current = clamp(targetZoom.current + 0.2, ZOOM_MIN, ZOOM_MAX); startLoop(); }}
                        className="text-[13px] w-6 h-6 rounded flex items-center justify-center cursor-pointer bg-transparent border-0"
                        style={{ color: '#86868b' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >+</button>
                </div>
            </div>

            {/* Legend */}
            <div className="fixed bottom-7 right-9 z-50 select-none flex gap-5 text-[10px]" style={{ color: '#86868b', fontWeight: 500 }}>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: '#34C759' }} /> Low
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: '#FF9500' }} /> Mid
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: '#FF3B30' }} /> High
                </span>
            </div>

            {/* Minimap */}
            <div
                className="fixed bottom-16 right-9 z-50 select-none overflow-hidden"
                style={{
                    width: canvasSize.width * minimapScale,
                    height: canvasSize.height * minimapScale,
                    background: 'rgba(255,255,255,0.85)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        left: Math.max(0, -panOffset.x * minimapScale),
                        top: Math.max(0, -panOffset.y * minimapScale),
                        width: viewportW * minimapScale,
                        height: viewportH * minimapScale,
                        border: '1.5px solid #007AFF',
                        borderRadius: 2,
                        background: 'rgba(0,122,255,0.06)',
                    }}
                />
            </div>

            {/* Canvas viewport */}
            <div
                ref={viewportRef}
                className="w-screen h-screen overflow-hidden"
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div className="canvas-grid" />

                {/* Pannable + zoomable surface */}
                <div
                    ref={surfaceRef}
                    style={{
                        width: canvasSize.width,
                        height: canvasSize.height,
                        position: 'relative',
                        willChange: 'transform',
                        transformOrigin: '0 0',
                        transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoom})`,
                    }}
                >
                    {children}
                </div>
            </div>
        </>
    );
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
