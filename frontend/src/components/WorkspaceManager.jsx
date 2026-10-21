import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysis } from '../context/AnalysisContext';
import { workspaceApi } from '../api/workspaceApi';

export default function WorkspaceManager({ isOpen, onClose, theme = 'light' }) {
    const isDark = theme === 'dark';
    const { 
        activeWorkspace, setActiveWorkspace,
        getWorkspacePayload, loadWorkspaceState,
        setHasUnsavedChanges
    } = useAnalysis();

    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('list'); // 'list', 'save'
    
    // Form state
    const [name, setName] = useState(activeWorkspace?.name || '');
    const [description, setDescription] = useState(activeWorkspace?.description || '');

    useEffect(() => {
        if (isOpen) {
            loadWorkspaces();
            if (activeWorkspace) {
                setName(activeWorkspace.name);
                setDescription(activeWorkspace.description);
            }
        }
    }, [isOpen, activeWorkspace]);

    const loadWorkspaces = async () => {
        setLoading(true);
        try {
            const data = await workspaceApi.list();
            setWorkspaces(data);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleSave = async (isNew = false) => {
        setLoading(true);
        try {
            const payload = {
                ...getWorkspacePayload(),
                name,
                description
            };
            
            let updated;
            if (!isNew && activeWorkspace?.id) {
                updated = await workspaceApi.update(activeWorkspace.id, payload);
            } else {
                updated = await workspaceApi.create(payload);
            }
            
            setActiveWorkspace({ id: updated.id, name: updated.name, description: updated.description });
            setHasUnsavedChanges(false);
            onClose();
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleLoad = async (id) => {
        setLoading(true);
        try {
            const data = await workspaceApi.get(id);
            loadWorkspaceState(data);
            onClose();
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleDelete = async (id) => {
        try {
            await workspaceApi.delete(id);
            await loadWorkspaces();
            if (activeWorkspace?.id === id) {
                setActiveWorkspace(null);
                setHasUnsavedChanges(true);
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                style={{
                    background: isDark ? 'rgba(30,30,32,0.85)' : 'rgba(255,255,255,0.9)',
                    backdropFilter: 'blur(30px) saturate(2)',
                    WebkitBackdropFilter: 'blur(30px) saturate(2)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
                    maxHeight: '80vh',
                }}
            >
                {/* Header */}
                <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setView(view === 'list' ? 'save' : 'list')}
                            className="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded"
                            style={{ 
                                color: '#007AFF',
                                background: 'rgba(0,122,255,0.1)',
                                border: 'none', cursor: 'pointer'
                            }}
                        >
                            {view === 'list' ? 'Save Current' : 'View All'}
                        </button>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full cursor-pointer bg-transparent border-0" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto w-full custom-scrollbar flex-1">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-6 h-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : view === 'list' ? (
                        <div className="flex flex-col gap-3">
                            <h3 className="text-sm font-bold mb-2" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>Workspaces</h3>
                            {workspaces.length === 0 ? (
                                <p className="text-xs py-4 text-center" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>
                                    No saved workspaces yet.
                                </p>
                            ) : (
                                workspaces.map(ws => (
                                    <div key={ws.id} className="group relative p-3 rounded-xl border flex items-center justify-between transition-all"
                                         style={{ 
                                             borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                             background: activeWorkspace?.id === ws.id ? (isDark ? 'rgba(0,122,255,0.1)' : 'rgba(0,122,255,0.05)') : 'transparent'
                                         }}>
                                        <div className="flex-1 cursor-pointer" onClick={() => handleLoad(ws.id)}>
                                            <div className="text-xs font-bold flex items-center gap-2" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
                                                {ws.name}
                                                {activeWorkspace?.id === ws.id && <span className="text-[9px] uppercase tracking-wider text-[#007AFF] bg-[#007AFF]/10 px-1.5 rounded">Active</span>}
                                            </div>
                                            {ws.description && <div className="text-[10px] mt-1" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>{ws.description}</div>}
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(ws.id); }}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/10 text-red-500 cursor-pointer border-0 bg-transparent transition-all"
                                        >
                                            🗑
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold" style={{ color: isDark ? '#fff' : '#1d1d1f' }}>
                                {activeWorkspace ? 'Update Workspace' : 'Save New Workspace'}
                            </h3>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>Name</label>
                                <input 
                                    className="px-3 py-2 border rounded-lg text-xs"
                                    style={{
                                        background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                        color: isDark ? '#fff' : '#1d1d1f'
                                    }}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Production Overhaul v2"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDark ? '#aeaeb2' : '#86868b' }}>Description (optional)</label>
                                <textarea 
                                    className="px-3 py-2 border rounded-lg text-xs resize-none h-20"
                                    style={{
                                        background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                        color: isDark ? '#fff' : '#1d1d1f'
                                    }}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Adding read replicas and migrating to Graviton instances..."
                                />
                            </div>
                            <div className="flex gap-2 mt-2">
                                {activeWorkspace && (
                                    <button 
                                        onClick={() => handleSave(false)}
                                        disabled={!name.trim()}
                                        className="flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer border-none bg-[#007AFF] text-white disabled:opacity-50"
                                    >
                                        Update Active
                                    </button>
                                )}
                                <button 
                                    onClick={() => handleSave(true)}
                                    disabled={!name.trim()}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer border-none disabled:opacity-50 ${!activeWorkspace ? 'bg-[#007AFF] text-white' : 'bg-transparent border border-[#007AFF] text-[#007AFF]'}`}
                                    style={activeWorkspace ? { border: '1px solid rgba(0,122,255,0.3)' } : {}}
                                >
                                    Save as New
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
