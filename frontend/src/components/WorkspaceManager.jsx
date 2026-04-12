import { useState, useEffect } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { workspaceApi } from '../api/workspaceApi';
import { cn } from "@/lib/utils";
import { 
  X, 
  Save, 
  FolderOpen, 
  Trash2, 
  Plus, 
  Info,
  ChevronRight,
  Database,
  Calendar,
  Layers,
  Search
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

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
            } else {
                setName('');
                setDescription('');
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

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-xl gap-0 shadow-2xl">
                <DialogHeader className="p-6 pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "p-1.5 rounded-lg",
                                    view === 'list' ? "bg-primary/10 text-primary" : "bg-orange-500/10 text-orange-500"
                                )}>
                                    {view === 'list' ? <Database className="size-4" /> : <Save className="size-4" />}
                                </span>
                                <DialogTitle className="text-xl font-bold tracking-tight">
                                    {view === 'list' ? 'Workspaces' : 'Save Changes'}
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-xs">
                                {view === 'list' 
                                    ? 'Load, manage, and delete infrastructure snapshots.' 
                                    : 'Save your current infrastructure map to a workspace.'}
                            </DialogDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setView(view === 'list' ? 'save' : 'list')}
                            className="text-[10px] font-bold uppercase tracking-widest h-8 px-3"
                        >
                            {view === 'list' ? (
                                <><Plus className="size-3 mr-1.5" /> New Snapshot</>
                            ) : (
                                <><FolderOpen className="size-3 mr-1.5" /> View All</>
                            )}
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0">
                    <ScrollArea className="max-h-[400px]">
                        <div className="p-6">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-50">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Synchronizing...</span>
                                </div>
                            ) : view === 'list' ? (
                                <div className="space-y-3">
                                    {workspaces.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 opacity-50">
                                            <Layers className="size-12 stroke-[1]" />
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-foreground">No environments yet</p>
                                                <p className="text-xs">Save your current view to create a snapshot.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        workspaces.map(ws => (
                                            <div 
                                                key={ws.id} 
                                                className={cn(
                                                    "group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden",
                                                    activeWorkspace?.id === ws.id 
                                                        ? "bg-primary/5 border-primary shadow-sm" 
                                                        : "hover:bg-muted/50 hover:border-muted-foreground/30"
                                                )}
                                                onClick={() => handleLoad(ws.id)}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="space-y-1 min-w-0">
                                                        <div className="flex items-center gap-2 text-sm font-bold truncate pr-8">
                                                            {ws.name}
                                                            {activeWorkspace?.id === ws.id && (
                                                                <Badge variant="default" className="text-[8px] h-3.5 px-1 font-black bg-primary text-primary-foreground uppercase tracking-widest leading-none">
                                                                    Active
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {ws.description && (
                                                            <p className="text-[11px] text-muted-foreground line-clamp-1 italic font-medium">
                                                                {ws.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon-xs" 
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(ws.id); }}
                                                        className="opacity-0 group-hover:opacity-100 absolute top-3 right-3 h-7 w-7 text-destructive hover:bg-destructive/10 transition-all rounded-full"
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </div>
                                                <div className="flex items-center gap-3 mt-3 opacity-40 group-hover:opacity-100 transition-opacity">
                                                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-tighter text-muted-foreground">
                                                        <Calendar className="size-2.5" />
                                                        {new Date().toLocaleDateString()}
                                                    </div>
                                                    <Separator orientation="vertical" className="h-2.5" />
                                                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-tighter text-muted-foreground">
                                                        <Search className="size-2.5" />
                                                        Snapshot ID: {ws.id.slice(0, 8)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Workspace Name</Label>
                                            <Input 
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="e.g. Production Cluster v2"
                                                className="h-10 text-xs font-medium"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description (Optional)</Label>
                                            <Textarea 
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Document current topological changes or architectural decisions..."
                                                className="min-h-[120px] text-xs font-medium resize-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10 flex gap-3 items-start">
                                        <Info className="size-4 text-red-500 shrink-0 mt-0.5" />
                                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                                            Saving will capture the <strong>current layout</strong>, active account filters, and all planned/draft nodes.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <DialogFooter className="p-6 border-t bg-muted/20 sm:justify-end">
                    {view === 'list' ? (
                        <div className="flex items-center justify-between w-full">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">
                                Snapshot count: {workspaces.length}
                            </span>
                            <Button variant="ghost" size="sm" onClick={onClose} className="text-[10px] font-black uppercase">
                                Dismiss
                            </Button>
                        </div>
                    ) : (
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setView('list')}
                                className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest h-9"
                            >
                                Cancel
                            </Button>
                            {activeWorkspace && (
                                <Button 
                                    size="sm" 
                                    onClick={() => handleSave(false)}
                                    disabled={!name.trim() || loading}
                                    className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest h-9"
                                >
                                    Overwrite Active
                                </Button>
                            )}
                            <Button 
                                variant={activeWorkspace ? "outline" : "default"}
                                size="sm" 
                                onClick={() => handleSave(true)}
                                disabled={!name.trim() || loading}
                                className={cn(
                                    "flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest h-9",
                                    !activeWorkspace && "shadow-lg shadow-primary/20"
                                )}
                            >
                                {activeWorkspace ? 'Save As New' : 'Create Snapshot'}
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

