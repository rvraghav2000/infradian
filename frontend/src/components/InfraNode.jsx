import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCategoryMeta } from '../layout';
import { useAnalysis } from '../context/AnalysisContext';
import { cn } from "@/lib/utils";
import { 
  Activity
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const loadProfile = (load) => {
    if (load > 0.8) return { color: 'text-destructive', label: 'CRITICAL', bg: 'bg-destructive/10' };
    if (load > 0.5) return { color: 'text-orange-500', label: 'HIGH', bg: 'bg-orange-500/10' };
    return { color: 'text-green-500', label: 'NORMAL', bg: 'bg-green-500/10' };
};



export default function InfraNode({
    nodeLayout,
    dimmed = false,
    focused = false,
    theme = 'light',
    onNodeClick,
    onNodeMouseDown,
    onGodModeSelect,
    expandedNodeId,
    isDragging = false,
    physicsHovered = false,
    isGhost = false,
    onToggleGhost,
    interactionMode = 'select',
}) {
    const [localHovered, setHovered] = useState(false);
    const { isSimulationMode } = useAnalysis();

    const hovered = physicsHovered || localHovered;
    const { node } = nodeLayout;
    const lp = loadProfile(node.metrics?.current_load || 0);
    const meta = getCategoryMeta(node.type);

    if (nodeLayout.isRegion) {
        return (
            <RegionNode 
                layout={nodeLayout} 
                meta={meta} 
                dimmed={dimmed} 
                focused={focused} 
                theme={theme} 
                onNodeMouseDown={onNodeMouseDown} 
                isDragging={isDragging} 
            />
        );
    }

    const isExpanded = expandedNodeId === node.id;
    const isPlanned = node.status === 'planned';
    const isRemovalCandidate = node.id.includes('remove');

    return (
        <CardNode
            layout={nodeLayout} 
            meta={meta} 
            lp={lp}
            hovered={hovered} 
            setHovered={setHovered}
            dimmed={dimmed} 
            focused={focused} 
            theme={theme}
            onNodeClick={onNodeClick}
            onNodeMouseDown={onNodeMouseDown}
            isExpanded={isExpanded}
            onGodModeSelect={onGodModeSelect} 
            isDragging={isDragging}
            isRemovalCandidate={isRemovalCandidate}
            isGhost={isGhost}
            interactionMode={interactionMode}
        />
    );
}

function RegionNode({ layout, meta, dimmed, focused, theme, onNodeMouseDown, isDragging }) {
    const { node } = layout;
    const isVPC = node.type === 'aws_vpc';
    const isDark = theme === 'dark';

    return (
        <motion.div
            className={cn(
                "node-region relative w-full h-full transition-all duration-300 pointer-events-none will-change-transform",
                isVPC ? "rounded-[32px]" : "rounded-[20px]"
            )}
            initial={{ opacity: 0 }}
            animate={{
                opacity: dimmed ? 0.15 : 1,
                filter: dimmed ? 'saturate(0.2)' : 'saturate(1)',
            }}
            style={{
                border: focused
                    ? `2px solid ${isVPC ? 'var(--primary)' : 'var(--muted-foreground)'}`
                    : `1.5px dashed ${isVPC ? 'rgba(0,122,255,0.2)' : 'rgba(142,142,147,0.15)'}`,
                background: isVPC ? 'rgba(0,122,255,0.01)' : 'rgba(142,142,147,0.01)',
            }}
        >
            <div className="absolute top-3 left-3.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background/80 backdrop-blur-md border shadow-sm max-w-[calc(100%-28px)] overflow-hidden">
                <span className="text-xs shrink-0">{meta.icon}</span>
                <span className={cn(
                    "text-[10px] font-bold tracking-tight truncate",
                    isVPC ? "text-primary" : "text-foreground"
                )}>
                    {node.label}
                </span>
                <span className="text-[8px] font-black uppercase text-muted-foreground/40 shrink-0">
                    {node.id.slice(0, 8)}
                </span>
            </div>
        </motion.div>
    );
}

function CardNode({
    layout, meta, lp, hovered, setHovered,
    dimmed, focused, theme, onNodeClick, onNodeMouseDown, onGodModeSelect, isExpanded, isDragging, isRemovalCandidate, isGhost, interactionMode,
}) {
    const { x, y, w, h, node } = layout;
    const events = node.history || [];
    const hasEvents = events.length > 0;
    const isDark = theme === 'dark';
    const isPlanned = node.status === 'planned';

    return (
        <motion.div
            className={cn(
                "node-card absolute cursor-grab active:cursor-grabbing",
                isPlanned && "animate-pulse"
            )}
            onMouseDown={(e) => onNodeMouseDown && onNodeMouseDown(node.id, e)}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
                opacity: isGhost ? 0.4 : (dimmed ? 0.12 : 1),
                scale: 1,
                filter: isGhost ? 'grayscale(100%) brightness(0.9)' : (dimmed ? 'saturate(0.2) brightness(0.8)' : 'brightness(1)'),
            }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                transform: `translate3d(${x}px, ${y}px, 0)`,
                width: w,
                zIndex: hovered ? 150 : 10,
                pointerEvents: 'none',
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.15)',
            }}
        >
            <Card
                className={cn(
                    "flex flex-col select-none cursor-pointer transition-all duration-300 overflow-hidden",
                    focused ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50",
                    "rounded-lg shadow-sm bg-background",
                    isPlanned ? "border-dashed border-primary/60 bg-primary/5 shadow-none" : "",
                    isRemovalCandidate && "border-destructive bg-destructive/5 ring-2 ring-destructive/20"
                )}
                style={{ height: h }}
            >
                <div className="flex flex-1 items-center gap-3 px-3 relative h-full">
                    {/* Indicators */}
                    <div className="absolute top-1 right-2 flex gap-1 pointer-events-none">
                        {(node.attributes?.risk || 0) > 50 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="size-2 rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                                </TooltipTrigger>
                                <TooltipContent className="text-[10px] font-bold py-1 px-2 uppercase tracking-widest bg-destructive text-destructive-foreground">High Risk</TooltipContent>
                            </Tooltip>
                        )}
                        {(node.attributes?.monthly_cost || 0) > 50 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="size-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                </TooltipTrigger>
                                <TooltipContent className="text-[10px] font-bold py-1 px-2 uppercase tracking-widest bg-green-500 text-white">Cost Outlier</TooltipContent>
                            </Tooltip>
                        )}
                    </div>

                    {/* Icon */}
                    <div className={cn(
                        "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl border shadow-sm transition-transform duration-300",
                        hovered && "scale-110",
                        isPlanned ? "bg-primary/10 border-primary/20" : "bg-muted/50 border-border/50"
                    )} style={{ borderColor: `${meta.color}40`, background: `${meta.color}10` }}>
                        {meta.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className={cn(
                                "text-[13px] font-bold tracking-tight truncate leading-tight",
                                isGhost && "line-through opacity-40"
                            )}>
                                {node.label}
                            </span>
                            {(isPlanned || isRemovalCandidate || isGhost) && (
                                <Badge variant={isGhost ? "secondary" : isRemovalCandidate ? "destructive" : "default"} className="text-[8px] h-3.5 px-1 font-black uppercase leading-none tracking-tighter">
                                    {isGhost ? 'RM' : isRemovalCandidate ? 'DEL' : 'PLAN'}
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground truncate opacity-70">
                                {meta.label}
                            </span>
                            {!isPlanned && !isRemovalCandidate && !isGhost && (
                                <>
                                    <Separator orientation="vertical" className="h-2 opacity-50" />
                                    <div className="flex items-center gap-1">
                                        <Activity className={cn("size-2.5", lp.color)} />
                                        <span className={cn("text-[10px] font-black tabular-nums", lp.color)}>
                                            {((node.metrics?.current_load || 0) * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
}


