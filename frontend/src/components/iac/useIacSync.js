import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { iacApi, toGraph } from '../../services/iacApi';

const rand = () => Math.floor(Math.random() * 100000);
const edgeOf = (id, source, target) => ({
    id, source, target, source_id: source, target_id: target, label: 'DEPENDS_ON',
    dependency_mode: 'sync', interaction_type: 'runtime_call', primary: true, inferred: false,
    confidence: 1.0, traffic_share: 1.0,
});

let catalogCache = null;
export function useCatalog() {
    const [catalog, setCatalog] = useState(catalogCache);
    useEffect(() => {
        if (catalogCache) return;
        iacApi.catalog().then(c => { catalogCache = c; setCatalog(c); }).catch(() => {});
    }, []);
    return catalog;
}

/**
 * Bidirectional sync between the canvas draft graph and the generated Terraform/OpenTofu code.
 *   canvas → code: debounced /generate whenever the draft graph (or variables/outputs) changes
 *   code → canvas: debounced /parse after the user stops typing; nodes keep their identity/position
 * Nodes without a Terraform generator (cloud_provider, k8s_cluster…) are left untouched.
 */
export function useIacSync({ draftData, setDraftData, iac, setIac, enabled }) {
    const catalog = useCatalog();
    const [files, setFiles] = useState({});
    const [warnings, setWarnings] = useState([]);
    const [parseError, setParseError] = useState(null);
    const [syncState, setSyncState] = useState('idle'); // idle | generating | parsing | error
    const [analysis, setAnalysis] = useState(null);
    const [analysisError, setAnalysisError] = useState(null);

    const addressMap = useRef({});
    const dirty = useRef(false);        // user has typed code that hasn't been parsed yet
    const skipGen = useRef(false);      // just applied code → keep the user's text as-is
    const parseTimer = useRef(null);
    const filesRef = useRef({});
    const draftRef = useRef(draftData);
    draftRef.current = draftData;

    const catalogTypes = useMemo(() => new Map((catalog?.resources || []).map(r => [r.type, r])), [catalog]);

    // ── canvas → code ───────────────────────────────────────────
    useEffect(() => {
        if (!enabled) return undefined;
        const t = setTimeout(async () => {
            if (dirty.current) return;
            if (skipGen.current) { skipGen.current = false; return; }
            try {
                setSyncState('generating');
                const r = await iacApi.generate(toGraph(draftData.nodes, draftData.edges, iac), iac.tool);
                addressMap.current = r.address_map || {};
                filesRef.current = r.files;
                setFiles(r.files);
                setWarnings(r.warnings || []);
                setParseError(null);
                setSyncState('idle');
                // keep the stored variable list aware of auto-created ones (read-only in the UI)
                const merged = r.variables || [];
                const same = JSON.stringify(merged) === JSON.stringify(iac.variables);
                if (!same) setIac(prev => ({ ...prev, variables: merged }));
            } catch (e) {
                setParseError(e.message);
                setSyncState('error');
            }
        }, 350);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, draftData, iac.tool, iac.outputs, iac.locals, JSON.stringify((iac.variables || []).filter(v => !v.auto))]);

    // ── governance analysis (security + policy + cost) ──────────
    useEffect(() => {
        if (!enabled || !Object.keys(files).length) return undefined;
        const t = setTimeout(() => {
            iacApi.analyze(files).then(a => { setAnalysis(a); setAnalysisError(null); })
                .catch(e => setAnalysisError(e.message));
        }, 600);
        return () => clearTimeout(t);
    }, [enabled, files]);

    // ── code → canvas ───────────────────────────────────────────
    const applyParsed = useCallback((parsed, { replaceUnknown = false } = {}) => {
        const prev = draftRef.current;
        const inverse = Object.fromEntries(Object.entries(addressMap.current).map(([id, addr]) => [addr, id]));
        const existing = new Map(prev.nodes.map(n => [n.id, n]));
        const idMap = {};
        const nodes = [];
        for (const p of parsed.nodes) {
            const oldId = inverse[p.id];
            const old = oldId ? existing.get(oldId) : null;
            const id = old ? old.id : `planned-${p.type.replace(/_/g, '-')}-${rand()}`;
            idMap[p.id] = id;
            nodes.push({ p, id, old });
        }
        const built = nodes.map(({ p, id, old }) => {
            const spawn = old ? { spawnX: old.attributes?.spawnX, spawnY: old.attributes?.spawnY } : {};
            const parent = p.parentId ? idMap[p.parentId] || null : null;
            return {
                ...(old || { metrics: { current_load: 0.0 }, history: [] }),
                id, type: p.type, label: p.label, tfName: p.tf_name, status: 'planned',
                parentId: parent, parent_id: parent,
                attributes: { ...spawn, ...p.attributes },
            };
        });
        // keep nodes the code can't express (boundaries, containers, …)
        const keep = replaceUnknown ? [] : prev.nodes.filter(n => !catalogTypes.has(n.type));
        const keepIds = new Set(keep.map(n => n.id));
        const edges = parsed.edges.map(e => edgeOf(`planned-edge-${idMap[e.source]}-${idMap[e.target]}`, idMap[e.source], idMap[e.target]));
        const edgeKey = new Set(edges.map(e => `${e.source}|${e.target}`));
        // keep hand-drawn edges that have no Terraform meaning
        for (const e of prev.edges) {
            const s = e.source ?? e.source_id; const t = e.target ?? e.target_id;
            const sType = existing.get(s)?.type; const tType = existing.get(t)?.type;
            const representable = catalogTypes.get(sType)?.links && tType in catalogTypes.get(sType).links;
            const alive = (keepIds.has(s) || built.some(n => n.id === s)) && (keepIds.has(t) || built.some(n => n.id === t));
            if (alive && !representable && !edgeKey.has(`${s}|${t}`)) edges.push(e);
        }
        skipGen.current = true;
        setDraftData({ nodes: [...keep, ...built], edges });
        const autoNames = new Set((iac.variables || []).filter(v => v.auto).map(v => v.name));
        setIac(p => ({
            ...p,
            variables: parsed.variables.map(v => ({ ...v, auto: false })).filter(v => !autoNames.has(v.name) || v.default !== ''),
            outputs: parsed.outputs, locals: parsed.locals,
        }));
    }, [catalogTypes, iac.variables, setDraftData, setIac]);

    const editFile = useCallback((name, text) => {
        dirty.current = true;
        filesRef.current = { ...filesRef.current, [name]: text };
        setFiles(filesRef.current);
        clearTimeout(parseTimer.current);
        parseTimer.current = setTimeout(async () => {
            try {
                setSyncState('parsing');
                const parsed = await iacApi.parse(filesRef.current);
                dirty.current = false;
                setParseError(null);
                setWarnings(parsed.warnings || []);
                applyParsed(parsed);
                setSyncState('idle');
            } catch (e) {
                setParseError(e.message);   // keep the canvas; the user is mid-edit
                setSyncState('error');
            }
        }, 900);
    }, [applyParsed]);

    /** Replace everything from a parsed code bundle (git/paste import). */
    const importFiles = useCallback(async (newFiles) => {
        const parsed = await iacApi.parse(newFiles);
        addressMap.current = {};
        dirty.current = false;
        skipGen.current = false;
        applyParsed(parsed, { replaceUnknown: false });
        filesRef.current = newFiles;
        setFiles(newFiles);
        setWarnings(parsed.warnings || []);
        return parsed;
    }, [applyParsed]);

    /** Copy discovered/live resources into the draft so code can be generated for them. */
    const importLive = useCallback((liveNodes, liveEdges) => {
        const usable = liveNodes.filter(n => catalogTypes.has(n.type));
        const idMap = Object.fromEntries(usable.map(n => [n.id, `planned-${String(n.id).replace(/[^a-zA-Z0-9-]/g, '-')}`]));
        const nodes = usable.map(n => {
            const pid = n.parentId || n.parent_id;
            return { ...n, id: idMap[n.id], status: 'planned', parentId: pid ? idMap[pid] || null : null, parent_id: pid ? idMap[pid] || null : null,
                attributes: { ...(n.attributes || {}) } };
        });
        const edges = liveEdges
            .filter(e => idMap[e.source_id ?? e.source] && idMap[e.target_id ?? e.target])
            .map(e => edgeOf(`planned-edge-${idMap[e.source_id ?? e.source]}-${idMap[e.target_id ?? e.target]}`,
                idMap[e.source_id ?? e.source], idMap[e.target_id ?? e.target]));
        setDraftData(prev => ({ nodes: [...prev.nodes, ...nodes.filter(n => !prev.nodes.some(p => p.id === n.id))], edges: [...prev.edges, ...edges] }));
        return nodes.length;
    }, [catalogTypes, setDraftData]);

    return { files, warnings, parseError, syncState, analysis, analysisError, catalog, editFile, importFiles, importLive, setAnalysis };
}
