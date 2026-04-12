import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysis } from '../context/AnalysisContext';
import { cn } from "@/lib/utils";
import { 
  X, 
  Settings2, 
  Flame, 
  GitFork, 
  ShieldCheck, 
  Beaker,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ChevronRight,
  ChevronLeft
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

export default function AnalysisPanel({ node, theme = 'light', onClose, onDeleteNode }) {
  const [activeTab, setActiveTab] = useState('impact');
  const isDark = theme === 'dark';

  const {
    blastRadius, blastLoading,
    safeDeleteResult, safeDeleteLoading,
    simulationResult, simulationLoading,
    activePath, activePathStep,
    loadBlastRadius, loadSafeDelete, loadSimulation,
    selectPath, stepPath,
    updateDraftNode,
  } = useAnalysis();

  const isDraft = String(node?.id || '').startsWith('planned-');

  useEffect(() => {
    if (node?.id) {
      loadBlastRadius(node.id);
      loadSafeDelete(node.id);
    }
  }, [node?.id, loadBlastRadius, loadSafeDelete]);

  if (!node) return null;

  const TABS = [
    { id: 'impact', label: 'Impact', icon: <Flame className="size-3.5" /> },
    { id: 'paths', label: 'Paths', icon: <GitFork className="size-3.5" /> },
    { id: 'decision', label: 'Decision', icon: <ShieldCheck className="size-3.5" /> },
    { id: 'simulation', label: 'Simulate', icon: <Beaker className="size-3.5" /> },
  ];

  if (isDraft) {
    TABS.unshift({ id: 'config', label: 'Config', icon: <Settings2 className="size-3.5" /> });
  }

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      className="w-full h-full flex flex-col"
    >
      <Card className="flex-1 flex flex-col shadow-2xl border-border/50 bg-background/95 backdrop-blur-xl">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold truncate max-w-[240px]">
                  {node.label}
                </CardTitle>
                {isDraft && (
                  <Badge variant="outline" className="text-[10px] uppercase font-black bg-orange-500/10 text-orange-500 border-orange-500/20 px-1.5 h-4">
                    Draft
                  </Badge>
                )}
              </div>
              <CardDescription className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                {node.type?.replace('aws_', '').replace(/_/g, ' ')}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="rounded-full hover:bg-muted"
            >
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>

        <Separator className="opacity-50" />

        <Tabs 
          defaultValue={isDraft ? 'config' : activeTab} 
          onValueChange={setActiveTab} 
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-4">
            <TabsList className="grid w-full grid-cols-5 h-9 p-1">
              {TABS.map(t => (
                <TabsTrigger 
                  key={t.id} 
                  value={t.id} 
                  className="text-[10px] font-bold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  {t.icon}
                  <span className="hidden lg:inline">{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <ScrollArea className="flex-1 overflow-y-auto px-5 mt-4 min-h-0">
            <div className="pb-8">
              <TabsContent value="config" className="m-0 focus-visible:ring-0">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resource Label</label>
                    <Input 
                      className="h-9 text-xs"
                      value={node.label || ''}
                      onChange={(e) => updateDraftNode(node.id, { label: e.target.value })}
                      placeholder="e.g. backend-api"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resource Type</label>
                    <Select
                      value={node.type || 'aws_ec2'}
                      onValueChange={(val) => updateDraftNode(node.id, { type: val })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aws_ec2">AWS EC2</SelectItem>
                        <SelectItem value="aws_rds">AWS RDS</SelectItem>
                        <SelectItem value="aws_lambda">AWS Lambda</SelectItem>
                        <SelectItem value="aws_s3">AWS S3</SelectItem>
                        <SelectItem value="azure_vm">Azure VM</SelectItem>
                        <SelectItem value="gcp_ce">GCP Compute</SelectItem>
                        <SelectItem value="aws_vpc">AWS VPC</SelectItem>
                        <SelectItem value="aws_subnet">AWS Subnet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="impact" className="m-0 focus-visible:ring-0">
                <ImpactTab data={blastRadius} loading={blastLoading} />
              </TabsContent>

              <TabsContent value="paths" className="m-0 focus-visible:ring-0">
                <PathsTab
                  data={blastRadius}
                  loading={blastLoading}
                  activePath={activePath}
                  activePathStep={activePathStep}
                  onSelectPath={selectPath}
                  onStepPath={stepPath}
                />
              </TabsContent>

              <TabsContent value="decision" className="m-0 focus-visible:ring-0">
                <DecisionTab data={safeDeleteResult} loading={safeDeleteLoading} />
              </TabsContent>

              <TabsContent value="simulation" className="m-0 focus-visible:ring-0">
                <SimulationTab
                  nodeId={node.id}
                  data={simulationResult}
                  loading={simulationLoading}
                  onRun={() => loadSimulation(node.id)}
                />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <CardFooter className="p-4 bg-muted/30 border-t flex flex-col gap-2">
          {isDraft ? (
            <Button
              variant="destructive"
              className="w-full font-bold text-xs h-10"
              onClick={() => onDeleteNode && onDeleteNode(node.id)}
            >
              Discard Planned Node
            </Button>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <Button
                className="w-full font-bold text-xs h-10 shadow-lg shadow-primary/20"
                onClick={() => { loadSimulation(node.id); setActiveTab('simulation'); }}
                disabled={simulationLoading}
              >
                {simulationLoading ? 'Simulating…' : 'Simulate Removal'}
              </Button>
              <Button
                variant="outline"
                className="w-full font-bold text-xs h-10"
                onClick={() => { loadSafeDelete(node.id); setActiveTab('decision'); }}
                disabled={safeDeleteLoading}
              >
                {safeDeleteLoading ? 'Checking…' : 'Safe to Delete?'}
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}

/* ── Loading Skeleton ──────────────────────────────────────────── */
function LoadingPulse() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}

/* ── Confidence Progress ────────────────────────────────────────── */
function ConfidenceLevel({ value, label = 'Confidence' }) {
  const pct = Math.round((value || 0) * 100);
  const colorClass = pct >= 70 ? 'text-green-500' : pct >= 40 ? 'text-orange-500' : 'text-red-500';
  const progressColor = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
        <span className={cn("text-[11px] font-bold", colorClass)}>{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" indicatorClassName={progressColor} />
    </div>
  );
}

/* ── IMPACT TAB ────────────────────────────────────────────────── */
function ImpactTab({ data, loading }) {
  if (loading) return <LoadingPulse />;
  if (!data) return <p className="text-xs text-muted-foreground/60 italic py-4">Click a node to analyze impact.</p>;

  const impactScore = data.impactScore || 0;
  const affected = data.impactedNodeCount || 0;
  const critical = data.criticalNodesAffected || 0;
  const maxDepth = data.maxDepth || 0;
  const confidence = data.confidence?.overall || 0;

  return (
    <div className="space-y-6">
      {/* Hero metrics */}
      <div className="flex items-center justify-between bg-muted/20 p-4 rounded-xl border">
        <div className="space-y-1">
          <div className={cn(
            "text-3xl font-black tabular-nums",
            impactScore > 50 ? 'text-red-500' : impactScore > 20 ? 'text-orange-500' : 'text-green-500'
          )}>
            {impactScore.toFixed(0)}<span className="text-sm font-medium opacity-30">/100</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">Impact Score</p>
        </div>
        <div className="text-right space-y-1">
          <div className="text-3xl font-black tabular-nums text-primary">{affected}</div>
          <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">Affected Nodes</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatItem label="Critical Path Nodes" value={critical} color={critical > 0 ? 'text-red-500' : 'text-green-500'} />
        <StatItem label="Propagation Depth" value={`${maxDepth} hops`} />
      </div>

      {/* Confidence */}
      <ConfidenceLevel value={confidence} />

      {/* Summary */}
      {data.summary && (
        <Card className="bg-muted/30 border shadow-none">
          <CardContent className="p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground italic">
              "{data.summary}"
            </p>
          </CardContent>
        </Card>
      )}

      {/* Impacted nodes list */}
      {data.impactedNodes?.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pl-1">Affected Infrastructure</h4>
          <div className="space-y-1.5">
            {data.impactedNodes.slice(0, 6).map(n => (
              <div key={n.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card/50 hover:bg-muted/50 transition-colors group">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold pr-2 truncate">{n.label}</p>
                  <p className="text-[9px] font-medium text-muted-foreground uppercase opacity-70">{n.type?.replace('aws_', '')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={n.isCritical ? "destructive" : "secondary"} className="text-[9px] px-1.5 h-4 font-black">
                    D{n.depth}
                  </Badge>
                  {n.cost && (
                    <span className="text-[10px] tabular-nums font-bold opacity-40 group-hover:opacity-100 transition-opacity">
                      {n.cost.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {data.impactedNodes.length > 6 && (
            <Button variant="ghost" size="sm" className="w-full text-[10px] font-bold text-muted-foreground/60 h-7 uppercase">
              + {data.impactedNodes.length - 6} more resources
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── PATHS TAB ─────────────────────────────────────────────────── */
function PathsTab({ data, loading, activePath, activePathStep, onSelectPath, onStepPath }) {
  if (loading) return <LoadingPulse />;
  if (!data?.topPaths?.length) return <p className="text-xs text-muted-foreground italic py-4">No critical paths found.</p>;

  const paths = data.topPaths.slice(0, 8);

  return (
    <div className="space-y-5">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pl-1">Dependency Chains</h4>

      <div className="space-y-2">
        {paths.map((p, i) => {
          const isActive = activePath && JSON.stringify(activePath.path) === JSON.stringify(p.path);
          return (
            <div 
              key={i}
              className={cn(
                "group cursor-pointer rounded-xl border p-3 transition-all",
                isActive ? "bg-primary/5 border-primary shadow-sm" : "hover:bg-muted/50"
              )}
              onClick={() => onSelectPath(isActive ? null : p)}
            >
              <div className="flex justify-between items-center mb-2">
                <Badge variant={isActive ? "default" : "outline"} className="text-[9px] px-1.5 h-4 font-black uppercase">
                  Path {i + 1}
                </Badge>
                <div className="flex gap-1">
                  {p.modes?.map((m, mi) => (
                    <Badge key={mi} variant="outline" className={cn(
                      "text-[8px] h-3.5 px-1 font-bold",
                      m === 'sync' ? 'border-primary/50 text-primary' : m === 'async' ? 'border-orange-500/50 text-orange-500' : 'text-muted-foreground'
                    )}>
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground font-medium leading-relaxed mb-2">
                {p.description}
              </p>
              <div className="flex gap-3 px-2 py-1 rounded-md bg-muted/40 w-fit">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-muted-foreground uppercase leading-none mb-1">Cost</span>
                  <span className="text-[10px] font-black tabular-nums">{p.cost}</span>
                </div>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-muted-foreground uppercase leading-none mb-1">Score</span>
                  <span className="text-[10px] font-black tabular-nums">{p.score}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activePath?.path && (
        <Card className="bg-primary/5 border-primary/20 shadow-none">
          <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Explorer</CardTitle>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => onStepPath('prev')}
                disabled={activePathStep <= 0}
                className="h-6 w-6"
              >
                <ChevronLeft className="size-3" />
              </Button>
              <span className="text-[10px] font-black tabular-nums w-8 text-center">
                {activePathStep + 1} / {activePath.path.length}
              </span>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => onStepPath('next')}
                disabled={activePathStep >= activePath.path.length - 1}
                className="h-6 w-6"
              >
                <ChevronRight className="size-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-4 space-y-1.5">
            {activePath.path.map((hopId, idx) => (
              <div
                key={hopId}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg transition-all",
                  idx === activePathStep ? 'bg-background shadow-sm border ring-1 ring-primary/20' : 'opacity-40 grayscale blur-[0.2px]'
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shadow-inner",
                  idx === activePathStep ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {idx + 1}
                </span>
                <span className="text-[11px] font-bold flex-1 truncate">{hopId}</span>
                {idx < activePath.path.length - 1 && activePath.modes?.[idx] && (
                  <Badge variant="outline" className={cn(
                    "text-[8px] h-3.5 px-1",
                    idx === activePathStep ? "border-primary/50 text-primary" : ""
                  )}>
                    {activePath.modes[idx]}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── DECISION TAB ──────────────────────────────────────────────── */
function DecisionTab({ data, loading }) {
  if (loading) return <LoadingPulse />;
  if (!data) return (
    <div className="flex flex-col items-center gap-3 py-10 opacity-60">
      <HelpCircle className="size-10 stroke-1" />
      <p className="text-xs font-medium italic">Click "Safe to Delete?" to evaluate risk.</p>
    </div>
  );

  const decision = data.decision || 'UNCERTAIN';
  const confidence = data.confidence || 0;

  const decisionMap = {
    SAFE_TO_DELETE: { 
      color: 'text-green-500', 
      border: 'border-green-500/30', 
      bg: 'bg-green-500/10', 
      icon: <CheckCircle2 className="size-8" />, 
      label: 'Safe to Delete' 
    },
    UNSAFE_TO_DELETE: { 
      color: 'text-red-500', 
      border: 'border-red-500/30', 
      bg: 'bg-red-500/10', 
      icon: <AlertTriangle className="size-8" />, 
      label: 'Unsafe to Delete' 
    },
    UNCERTAIN: { 
      color: 'text-orange-500', 
      border: 'border-orange-500/30', 
      bg: 'bg-orange-500/10', 
      icon: <HelpCircle className="size-8" />, 
      label: 'Decision Uncertain' 
    },
  }[decision] || { 
    color: 'text-muted-foreground', 
    border: 'border-muted', 
    bg: 'bg-muted/30', 
    icon: <HelpCircle className="size-8" />, 
    label: decision 
  };

  return (
    <div className="space-y-6">
      {/* Decision badge */}
      <div className={cn(
        "flex flex-col items-center py-6 px-4 rounded-2xl border bg-gradient-to-br from-transparent to-background/40 shadow-sm",
        decisionMap.bg,
        decisionMap.border,
        decisionMap.color
      )}>
        <div className="mb-2.5 drop-shadow-sm">{decisionMap.icon}</div>
        <span className="text-sm font-black uppercase tracking-widest">{decisionMap.label}</span>
      </div>

      <ConfidenceLevel value={confidence} />

      {data.summary && (
        <Card className="bg-muted/20 border-border/50 shadow-none group">
          <CardContent className="p-3">
             <div className="text-[11px] leading-relaxed text-muted-foreground">
               <span className="text-[14px] leading-none text-primary font-bold mr-1 italic">“</span>
               {data.summary}
             </div>
          </CardContent>
        </Card>
      )}

      {/* Blockers */}
      {data.blockerReasons?.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-1.5 pl-1">
            <span className="h-1 w-1 bg-red-500 rounded-full" /> Risk Factors
          </h4>
          <div className="space-y-1.5">
            {data.blockerReasons.map((reason, i) => (
              <div key={i} className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 flex items-start gap-2.5 group hover:bg-red-500/10 transition-colors">
                <span className="text-[10px] mt-0.5 text-red-500/60 font-bold group-hover:text-red-500">{i + 1}</span>
                <span className="text-[10px] font-medium leading-relaxed opacity-80">{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence */}
      {data.evidenceReasons?.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-green-500 flex items-center gap-1.5 pl-1">
            <span className="h-1 w-1 bg-green-500 rounded-full" /> Evidence
          </h4>
          <div className="space-y-1.5">
            {data.evidenceReasons.map((reason, i) => (
              <div key={i} className="p-3 rounded-xl bg-green-500/5 border border-green-500/10 flex items-start gap-2.5 group hover:bg-green-500/10 transition-colors">
                 <CheckCircle2 className="size-3 mt-0.5 text-green-500/60 group-hover:text-green-500 transition-colors" />
                <span className="text-[10px] font-medium leading-relaxed opacity-80">{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impact stats */}
      <div className="grid grid-cols-2 gap-3 pb-4">
        <div className="p-3 rounded-xl border bg-card/40">
           <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Impact Scarcity</p>
           <p className="text-xs font-black tabular-nums">{((data.impactScore || 0) * 100).toFixed(0)}%</p>
        </div>
        <div className="p-3 rounded-xl border bg-card/40">
           <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Critical Paths</p>
           <p className="text-xs font-black tabular-nums">{data.criticalPaths || 0}</p>
        </div>
      </div>
    </div>
  );
}

/* ── SIMULATION TAB ────────────────────────────────────────────── */
function SimulationTab({ nodeId, data, loading, onRun }) {
  if (!data && !loading) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center px-4">
        <div className="size-16 rounded-3xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
           <Beaker className="size-8 stroke-[1.5] text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest">Chaos Simulation</h3>
          <p className="text-[10px] text-muted-foreground font-medium leading-relaxed max-w-[220px] mx-auto opacity-70">
            Orchestrate a controlled failure to observe service degradation and dependency ruptures.
          </p>
        </div>
        <Button
          onClick={onRun}
          className="px-8 font-black uppercase tracking-widest text-[10px] h-9 shadow-lg shadow-primary/20"
        >
          Initiate Simulation
        </Button>
      </div>
    );
  }

  if (loading) return <LoadingPulse />;

  const broken = data?.brokenNodes || [];
  const degraded = data?.degradedNodes || [];
  const unaffected = data?.unaffectedNodes || [];

  return (
    <div className="space-y-6">
      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Broken" value={broken.length} color="text-red-500" border="border-red-500/30" bg="bg-red-500/10" />
        <MetricCard label="Degraded" value={degraded.length} color="text-orange-500" border="border-orange-500/30" bg="bg-orange-500/10" />
        <MetricCard label="Safe" value={unaffected.length} color="text-green-500" border="border-green-500/30" bg="bg-green-500/10" />
      </div>

      {data?.confidence && <ConfidenceLevel value={data.confidence.overall} label="Sim Accuracy" />}

      {data?.summary && (
        <Card className="bg-muted/30 border-border/50 shadow-none">
          <CardContent className="p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {data.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Broken list */}
      {broken.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500 pl-1">Ruptures</h4>
          <div className="space-y-1.5">
            {broken.slice(0, 5).map(n => (
              <div key={n.id} className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 group hover:bg-red-500/10 transition-colors">
                <span className="text-[11px] font-bold text-foreground/90 group-hover:text-red-500 transition-colors">{n.label || n.id}</span>
                {n.detail && <p className="text-[9px] font-medium text-muted-foreground mt-0.5 opacity-60 leading-tight">{n.detail}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Degraded list */}
      {degraded.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-orange-500 pl-1">Degradation</h4>
          <div className="space-y-1.5">
            {degraded.slice(0, 5).map(n => (
              <div key={n.id} className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/15 group hover:bg-orange-500/10 transition-colors">
                 <span className="text-[11px] font-bold text-foreground/90 group-hover:text-orange-500 transition-colors">{n.label || n.id}</span>
                {n.detail && <p className="text-[9px] font-medium text-muted-foreground mt-0.5 opacity-60 leading-tight">{n.detail}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Re-run button */}
      <Button
        variant="ghost"
        onClick={onRun}
        className="w-full text-[10px] font-black uppercase tracking-widest h-9 text-muted-foreground/60 border border-dashed border-border/50 hover:border-muted-foreground/50 transition-all mb-4"
      >
        <Beaker className="size-3 mr-2" />
        Restart Chaos Suite
      </Button>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────────────── */
function StatItem({ label, value, color = 'text-foreground' }) {
  return (
    <div className="p-3 rounded-xl border bg-card/60 space-y-1 transition-all hover:border-primary/20">
      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none">{label}</p>
      <p className={cn("text-xs font-black tabular-nums capitalize truncate", color)}>{value}</p>
    </div>
  );
}

function MetricCard({ label, value, color, border, bg }) {
  return (
    <div className={cn(
      "flex flex-col items-center py-3 rounded-xl border transition-all hover:scale-[1.02] shadow-sm",
      bg, border
    )}>
      <span className={cn("text-lg font-black tabular-nums", color)}>{value}</span>
      <span className="text-[9px] font-black uppercase tracking-tighter opacity-70">{label}</span>
    </div>
  );
}
