import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysis } from '../context/AnalysisContext';
import { cn } from "@/lib/utils";
import { 
  Minus, 
  Plus, 
  Maximize2, 
  LayoutDashboard,
  Box,
  Share2,
  AlertTriangle,
  Beaker
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

export default function StatusBar({ 
  theme = 'light',
  nodes = [],
  edges = [],
  zoomRef,
  onZoomIn,
  onZoomOut,
  onFitView,
  onOrganize,
  focusedNodeId,
  clearFocus
}) {
  const { isSimulationMode, draftData, ghostNodeIds, simulationResult } = useAnalysis();
  
  // Calculate Diff Stats
  const hasDraftChanges = draftData.nodes.length > 0 || draftData.edges.length > 0 || ghostNodeIds.size > 0;
  const nodesAdded = draftData.nodes.length;
  const edgesAdded = draftData.edges.length;
  const nodesRemoved = ghostNodeIds.size;

  return (
    <div className="h-10 w-full bg-background/95 backdrop-blur-xl border-t border-border/50 flex items-center justify-between px-4 z-50 shrink-0 select-none">
      
      {/* ── Left Region: Graph Stats & Focus ── */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <Box className="size-3" />
            <span>{nodes.length} Nodes</span>
          </div>
          <Separator orientation="vertical" className="h-3" />
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <Share2 className="size-3" />
            <span>{edges.length} Edges</span>
          </div>
        </div>

        <AnimatePresence>
          {focusedNodeId && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-2 pl-4 border-l border-border/50"
            >
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
              </span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Focused: <span className="text-foreground ml-1 font-mono tracking-normal">{focusedNodeId}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={clearFocus}
                className="h-4 w-4 ml-1 rounded-full text-muted-foreground hover:text-foreground"
              >
                <span className="sr-only">Clear focus</span>
                <svg width="10" height="10" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-2.5"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Center Region: Contextual Mode Info ── */}
      <div className="flex items-center justify-center flex-1">
        <AnimatePresence mode="wait">
          {isSimulationMode && hasDraftChanges && !simulationResult && (
            <motion.div
              key="draft-stats"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-3 px-3 py-1 rounded-full border bg-muted/30"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Draft Delta</span>
              {nodesAdded > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="size-1.5 rounded-sm bg-green-500" />
                  <span className="text-[10px] font-bold text-green-500">+{nodesAdded}</span>
                </div>
              )}
              {nodesRemoved > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="size-1.5 rounded-sm bg-destructive" />
                  <span className="text-[10px] font-bold text-destructive">-{nodesRemoved}</span>
                </div>
              )}
              {edgesAdded > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="size-1.5 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-bold text-blue-500">+{edgesAdded}</span>
                </div>
              )}
              {nodesAdded === 0 && nodesRemoved === 0 && edgesAdded === 0 && (
                <span className="text-[10px] font-medium text-muted-foreground">No changes</span>
              )}
            </motion.div>
          )}
          
          {simulationResult && (
            <motion.div
              key="sim-stats"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-3 px-3 py-1 rounded-full border border-orange-500/20 bg-orange-500/5 text-orange-500"
            >
              <Beaker className="size-3" />
              <span className="text-[10px] font-black uppercase tracking-widest">Chaos Result</span>
              <Separator orientation="vertical" className="h-3 bg-orange-500/20" />
              <div className="flex items-center gap-4 text-[10px] font-bold">
                <span>{simulationResult.brokenNodes?.length || 0} Broken</span>
                <span>{simulationResult.degradedNodes?.length || 0} Degraded</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Right Region: Zoom & Layout ── */}
      <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
        <TooltipProvider>
          <div className="flex items-center gap-0.5 mr-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-muted-foreground hover:bg-muted" onClick={onZoomOut}>
                  <Minus className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-[10px]">Zoom Out</TooltipContent>
            </Tooltip>
            
            <div className="w-10 text-center">
              <span ref={zoomRef} className="text-[10px] font-bold tabular-nums text-foreground">
                100%
              </span>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-muted-foreground hover:bg-muted" onClick={onZoomIn}>
                  <Plus className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-[10px]">Zoom In</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-4 mr-2" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-muted-foreground hover:bg-muted mr-1" onClick={onFitView}>
                <Maximize2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">Fit to View</TooltipContent>
          </Tooltip>

          <Button
            variant="outline"
            size="sm"
            onClick={onOrganize}
            className="h-6 px-2 text-[10px] font-semibold text-primary border-primary/20 bg-primary/5 hover:bg-primary/10"
          >
            <LayoutDashboard className="size-3 mr-1.5" />
            Organize
          </Button>
        </TooltipProvider>
      </div>

    </div>
  );
}
