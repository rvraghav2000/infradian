import { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Activity, 
  Zap,
  Globe,
  Database,
  Cpu,
  Layers
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function CommandPalette({ nodes, edges, isOpen, onClose, onSelect, theme = 'light' }) {
    const isDark = theme === 'dark';

    function connectedCount(nodeId) {
        return edges.filter(e => e.source_id === nodeId || e.target_id === nodeId).length;
    }

    const TYPE_ICONS = {
        aws_vpc: <Globe className="size-4 text-blue-500" />,
        aws_subnet: <Layers className="size-4 text-orange-500" />,
        aws_ec2: <Cpu className="size-4 text-green-500" />,
        aws_rds: <Database className="size-4 text-red-500" />,
        aws_instance: <Cpu className="size-4 text-green-500" />,
        aws_db_instance: <Database className="size-4 text-red-500" />,
    };

    return (
        <CommandDialog open={isOpen} onOpenChange={onClose}>
            <CommandInput placeholder="Search infrastructure nodes..." />
            <CommandList className="max-h-[400px]">
                <CommandEmpty>No matching infrastructure components found.</CommandEmpty>
                <CommandGroup heading="Infrastructure Nodes">
                    {nodes.map((node) => (
                        <CommandItem
                            key={node.id}
                            onSelect={() => {
                                onSelect(node.id);
                                onClose();
                            }}
                            className="flex items-center gap-3 py-3 cursor-pointer"
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted border group-aria-[selected=true]:bg-background">
                                {TYPE_ICONS[node.type] || <MapPin className="size-4 text-muted-foreground" />}
                            </div>
                            
                            <div className="flex flex-1 flex-col truncate">
                                <span className="text-[13px] font-bold leading-none tracking-tight">
                                    {node.label}
                                </span>
                                <span className="mt-1 text-[10px] text-muted-foreground truncate uppercase font-black opacity-60">
                                    {node.id} · {node.type?.replace('aws_', '')}
                                </span>
                            </div>

                            <div className="flex items-center gap-4 text-right">
                                <div className="flex flex-col items-end">
                                    <div className={cn(
                                        "text-[10px] font-black tabular-nums flex items-center gap-1",
                                        node.metrics?.current_load > 0.8 ? 'text-red-500' :
                                        node.metrics?.current_load > 0.5 ? 'text-orange-500' : 'text-green-500'
                                    )}>
                                        <Activity className="size-2.5" />
                                        {((node.metrics?.current_load || 0) * 100).toFixed(0)}%
                                    </div>
                                    <div className="text-[9px] font-bold text-muted-foreground uppercase opacity-50">
                                        {connectedCount(node.id)} conn
                                    </div>
                                </div>
                                <CommandShortcut className="hidden md:inline-flex px-1.5 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-tighter shadow-sm">
                                    ↵ Select
                                </CommandShortcut>
                            </div>
                        </CommandItem>
                    ))}
                </CommandGroup>
                
                {nodes.some(n => String(n.id).startsWith('planned-')) && (
                    <>
                        <CommandSeparator />
                        <CommandGroup heading="Planned Components">
                            {nodes
                                .filter(n => String(n.id).startsWith('planned-'))
                                .map(node => (
                                    <CommandItem
                                        key={node.id}
                                        onSelect={() => {
                                            onSelect(node.id);
                                            onClose();
                                        }}
                                        className="flex items-center gap-3 py-3 opacity-80"
                                    >
                                        <Zap className="size-4 text-orange-500" />
                                        <div className="flex-1">
                                            <p className="text-xs font-bold">{node.label}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase font-black">Draft Component</p>
                                        </div>
                                        <Badge variant="outline" className="text-[8px] uppercase font-black bg-orange-500/10 text-orange-500 border-orange-500/20">
                                            Planned
                                        </Badge>
                                    </CommandItem>
                                ))}
                        </CommandGroup>
                    </>
                )}
            </CommandList>
            
            <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-t text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                <span className="flex items-center gap-1"><kbd className="px-1 border rounded bg-background">↑↓</kbd> navigate</span>
                <span className="flex items-center gap-1"><kbd className="px-1 border rounded bg-background">↵</kbd> select & focus</span>
                <span className="ml-auto flex items-center gap-1"><kbd className="px-1 border rounded bg-background">esc</kbd> close</span>
            </div>
        </CommandDialog>
    );
}

