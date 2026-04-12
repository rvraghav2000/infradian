import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PALETTE_PRIMITIVES } from '../layout';
import { cn } from "@/lib/utils";
import { 
  DraftingCompass, 
  ChevronLeft, 
  ChevronRight, 
  Search,
  Box,
  Cpu,
  Database,
  Globe,
  Plus,
  Info,
  Layers,
  Zap,
  GripVertical
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function PlanningPanel({ theme = 'light' }) {
    const [collapsed, setCollapsed] = useState(false);
    const isDark = theme === 'dark';

    return (
        <AnimatePresence>
            <motion.aside
                key="planning-panel"
                initial={{ x: -280, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -280, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                    "h-full flex flex-col transition-all duration-300 ease-in-out border-r bg-background/80 backdrop-blur-xl",
                    collapsed ? "w-[64px]" : "w-[280px]"
                )}
            >
                {/* ── Content Container ── */}
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    
                    {/* ── Header ── */}
                    <div className={cn(
                        "flex items-center justify-between px-4 py-3 border-b border-border/40",
                        collapsed && "flex-col gap-4 px-2"
                    )}>
                        {!collapsed && (
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-primary/5 text-primary border-primary/20 h-4 px-1.5 leading-none">
                                        Draft Mode
                                    </Badge>
                                </div>
                                <h3 className="text-sm font-bold tracking-tight text-foreground">Infrastructure Palette</h3>
                            </div>
                        )}
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setCollapsed(!collapsed)}
                            className={cn(
                                "h-8 w-8 rounded-full hover:bg-muted font-bold transition-all",
                                collapsed ? "rotate-180" : ""
                            )}
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                    </div>

                    {!collapsed && (
                        <div className="px-4 py-2 bg-muted/30 border-b border-border/40 flex items-center gap-2">
                            <Info className="size-3 text-muted-foreground" />
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                                Drag components to plan layout
                            </span>
                        </div>
                    )}

                    {/* ── Scrollable Content ── */}
                    <ScrollArea className="flex-1">
                        <div className={cn(
                            "p-2 space-y-4 pb-12",
                            collapsed ? "items-center" : ""
                        )}>
                            {collapsed ? (
                                <div className="flex flex-col gap-3 items-center pt-2">
                                    {PALETTE_PRIMITIVES.map((group) => (
                                        <div key={group.category} className="flex flex-col gap-2 p-1 border rounded-xl bg-muted/20">
                                            {group.items.map(item => (
                                                <Tooltip key={item.type}>
                                                    <TooltipTrigger asChild>
                                                        <div
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('application/infradian-node-data', JSON.stringify(item.defaultData));
                                                                e.dataTransfer.setData('application/infradian-node', item.type);
                                                                e.dataTransfer.effectAllowed = 'copy';
                                                            }}
                                                            className="h-10 w-10 flex items-center justify-center rounded-lg bg-background border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-grab active:cursor-grabbing text-lg"
                                                        >
                                                            {item.icon}
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="right" className="font-bold text-[11px] uppercase tracking-widest bg-background border-primary/20 text-foreground">
                                                        {item.label}
                                                    </TooltipContent>
                                                </Tooltip>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Accordion type="multiple" defaultValue={PALETTE_PRIMITIVES.map(p => p.category)} className="w-full">
                                    {PALETTE_PRIMITIVES.map((group) => (
                                        <AccordionItem key={group.category} value={group.category} className="border-none">
                                            <AccordionTrigger className="py-2 px-3 hover:no-underline hover:bg-muted/50 rounded-lg transition-all mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">
                                                        {group.category}
                                                    </span>
                                                    <Badge variant="ghost" className="h-4 p-0 px-1 text-[9px] font-bold bg-muted text-muted-foreground/70">
                                                        {group.items.length}
                                                    </Badge>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pt-1 pb-4 flex flex-col gap-1.5 px-2">
                                                {group.items.map(item => (
                                                    <DraggableItem key={item.type} item={item} />
                                                ))}
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            )}
                        </div>
                    </ScrollArea>
                </div>
                
                {/* ── Footer / Status ── */}
                {!collapsed && (
                    <div className="p-4 bg-muted/20 border-t border-border/40">
                        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                            <span>Primitives v1.2</span>
                            <div className="flex items-center gap-1">
                                <Search className="size-2.5" />
                                <span>CMD + F</span>
                            </div>
                        </div>
                    </div>
                )}
            </motion.aside>
        </AnimatePresence>
    );
}

function DraggableItem({ item }) {
    const [isDragging, setIsDragging] = useState(false);

    return (
        <div
            draggable
            onDragStart={(e) => {
                setIsDragging(true);
                e.dataTransfer.setData('application/infradian-node-data', JSON.stringify(item.defaultData));
                e.dataTransfer.setData('application/infradian-node', item.type);
                e.dataTransfer.effectAllowed = 'copy';
            }}
            onDragEnd={() => setIsDragging(false)}
            className={cn(
                "group flex items-center gap-3 p-2 rounded-xl transition-all duration-200 cursor-grab active:cursor-grabbing border border-transparent",
                isDragging ? "opacity-40 scale-95 border-primary/20 bg-primary/5" : "hover:bg-muted hover:border-border/50"
            )}
        >
            <div className={cn(
                "h-9 w-9 flex items-center justify-center rounded-lg text-lg transition-transform",
                "bg-background border shadow-sm group-hover:scale-105"
            )} style={{ borderColor: `${item.color}30`, backgroundColor: `${item.color}08` }}>
                {item.icon}
            </div>
            
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-foreground truncate">{item.label}</p>
                <p className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.type.replace('aws_', '').replace('_', ' ')}
                </p>
            </div>

            <div className="opacity-0 group-hover:opacity-40 transition-opacity">
                <GripVertical className="size-3.5" />
            </div>
        </div>
    );
}

