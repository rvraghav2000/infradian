import { useState, useEffect, useCallback } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import {
  testConnection,
  addConnection,
  listConnections,
  syncConnection,
  deleteConnection,
  bootstrapConnection,
} from '../services/cloudApi';
import { 
  X, 
  Cloud, 
  Plus, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle,
  ExternalLink,
  Lock,
  Search,
  Settings2,
  Globe,
  Database,
  Cpu,
  Layers,
  Activity,
  ChevronRight,
  ShieldCheck,
  Key
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ── Icons ───────────────────────────────────────────────────────────
const Icons = {
  AWS: () => (
    <svg width="20" height="20" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M228.8 190.5c-15.6 15.6-43.7 27.5-70.2 27.5-35.3 0-66.2-21.2-66.2-21.2l-10 16.5s38.4 28.1 82.2 28.1c32.8 0 71.2-16.6 88.7-36.9 3.1-3.6-1.5-8.5-4.7-6l-19.8 12z" fill="#FF9900"/>
      <path d="M125.7 186.2c-29.2 0-46.2-12.8-46.2-32.8 0-33.1 41.5-38.3 75.3-38.3v-4.1c0-10-4.1-18.7-22.1-18.7-13.8 0-27.9 5.2-36.9 11.4-2.8 1.9-5.1-.9-3.3-3.1 9.4-11.6 27.2-16.2 43.1-16.2 30.7 0 46.2 16.2 46.2 42.5v55.3c0 7.8 2.8 12.5 5.6 15.9 2.2 2.5-.3 6.6-3.8 5.6-8.1-2.2-19.4-6.9-19.4-15.9v-1.6l-.3-.3c-11.3 9.7-23.5 16.3-38.2 16.3zm31.9-46.5c-22.1 0-48.4 3.4-48.4 17.5 0 9.7 10 15.3 22.8 15.3 16.6 0 31.3-8.8 33.1-19.1v-13.7h-7.5z" fill="currentColor"/>
    </svg>
  ),
  Azure: () => (
    <svg width="20" height="20" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M110.1 57L31.9 204.4h67.1l51.5-103.1L110.1 57z" fill="#0078D4"/>
      <path d="M150.5 101.3l-34.9 66.2 46.6 36.9 93.8-31.9-105.5-71.2z" fill="#50E6FF"/>
      <path d="M172 136l-31.9 68.4h83.9l-52-68.4z" fill="#0078D4"/>
    </svg>
  ),
  GCP: () => (
    <svg width="20" height="20" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M192.3 84.7l-94.4 79.5 73.1 73.1H256v-94.4l-63.7-58.2z" fill="#EA4335"/>
      <path d="M84.7 192.3l79.5-94.4 73.1 73.1v85H84.7v-63.7z" fill="#34A853"/>
      <path d="M171.3 64.7L64.7 171.3 0 106.6V18.7h152.6l18.7 46z" fill="#4285F4"/>
      <path d="M64.7 171.3L171.3 64.7l73.1 73.1V256l-94.4-63.7-50-21z" fill="#FBBC05"/>
    </svg>
  )
};

// ── AWS Region Options ──────────────────────────────────────────────
const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  'sa-east-1', 'ca-central-1',
];

// ── Relative Time Helper ────────────────────────────────────────────
function timeAgo(isoString) {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Status Badge ────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    connected: { variant: 'default', label: 'Connected', icon: <CheckCircle2 className="size-3" /> },
    syncing:   { variant: 'secondary', label: 'Syncing…', icon: <RefreshCw className="size-3 animate-spin" /> },
    warning:   { variant: 'outline', className: 'text-orange-500 border-orange-500/20 bg-orange-500/10', label: 'Warning', icon: <AlertCircle className="size-3" /> },
    error:     { variant: 'destructive', label: 'Error', icon: <AlertCircle className="size-3" /> },
    unknown:   { variant: 'outline', label: 'Unknown', icon: <HelpCircle className="size-3" /> },
  };
  const s = map[status] || map.unknown;
  
  return (
    <Badge variant={s.variant} className={cn("text-[10px] font-bold gap-1.5 px-2 h-5", s.className)}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

export default function CloudSettings({ isOpen, onClose, theme = 'light' }) {
  const isDark = theme === 'dark';
  const { activeAccounts, setActiveAccounts } = useAnalysis();

  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [provider, setProvider] = useState('aws');

  const [setupMode, setSetupMode] = useState('manual');
  const [alias, setAlias] = useState('');
  const [region, setRegion] = useState('us-east-1');
  
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  
  const [adminAccessKey, setAdminAccessKey] = useState('');
  const [adminSecretKey, setAdminSecretKey] = useState('');
  const [bootstrapping, setBootstrapping] = useState(false);

  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');

  const [projectId, setProjectId] = useState('');
  const [saJson, setSaJson] = useState('');

  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [syncingIds, setSyncingIds] = useState(new Set());
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [syncResults, setSyncResults] = useState({});

  const fetchConnections = useCallback(async () => {
    try {
      const data = await listConnections();
      setConnections(data);
    } catch (e) {
      console.error('Failed to fetch connections:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchConnections();
    }
  }, [isOpen, fetchConnections]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setFormError('');
    try {
      let payload = { provider };
      if (provider === 'aws') {
        payload = { ...payload, region, access_key_id: accessKey, secret_access_key: secretKey };
      } else if (provider === 'azure') {
        payload = { ...payload, tenant_id: tenantId, client_id: clientId, client_secret: clientSecret, subscription_id: subscriptionId };
      } else if (provider === 'gcp') {
        try {
          const saInfo = JSON.parse(saJson);
          payload = { ...payload, project_id: projectId, service_account_info: saInfo };
        } catch (e) {
          throw new Error("Invalid format for Service Account JSON");
        }
      }

      const result = await testConnection(payload);
      setTestResult(result);
    } catch (e) {
      setTestResult({ valid: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      let payload = { alias, provider };
      if (provider === 'aws') {
        payload = { ...payload, region, access_key_id: accessKey, secret_access_key: secretKey };
      } else if (provider === 'azure') {
        payload = { ...payload, tenant_id: tenantId, client_id: clientId, client_secret: clientSecret, subscription_id: subscriptionId };
      } else if (provider === 'gcp') {
        payload = { ...payload, project_id: projectId, service_account_info: JSON.parse(saJson) };
      }

      const conn = await addConnection(payload);
      resetForm();
      await fetchConnections();
      handleSync(conn.id);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setFormError('');
    try {
      const conn = await bootstrapConnection({
        alias,
        region,
        admin_access_key_id: adminAccessKey,
        admin_secret_access_key: adminSecretKey
      });
      resetForm();
      await fetchConnections();
      handleSync(conn.id);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBootstrapping(false);
    }
  };

  const resetForm = () => {
    setAlias(''); setRegion('us-east-1'); setProvider('aws');
    setAccessKey(''); setSecretKey('');
    setAdminAccessKey(''); setAdminSecretKey('');
    setTenantId(''); setClientId(''); setClientSecret(''); setSubscriptionId('');
    setProjectId(''); setSaJson('');
    setTestResult(null); setShowAddForm(false);
    setFormError('');
  };

  const handleSync = async (id) => {
    setSyncingIds(prev => new Set(prev).add(id));
    setSyncResults(prev => { const next = {...prev}; delete next[id]; return next; });
    try {
      const result = await syncConnection(id);
      setSyncResults(prev => ({...prev, [id]: result}));
      await fetchConnections();
    } catch (e) {
      console.error('Sync error:', e);
      setSyncResults(prev => ({...prev, [id]: { status: 'error', message: e.message }}));
      await fetchConnections();
    } finally {
      setSyncingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this connection and all its synced resources?')) return;
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      await deleteConnection(id);
      setConnections(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error('Delete error:', e);
    } finally {
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[420px] sm:max-w-[420px] p-0 flex flex-col gap-0 border-l bg-background/95 backdrop-blur-xl">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground opacity-70">Infrastructure Settings</span>
            <SheetTitle className="text-xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
              Cloud Connections
            </SheetTitle>
            <SheetDescription className="text-xs">
              Manage multi-account cloud infrastructure and collection status.
            </SheetDescription>
          </div>
        </SheetHeader>

          <ScrollArea className="flex-1 px-6">
            <div className="py-6 space-y-6">
              {/* Add New Connection Trigger */}
              {!showAddForm && (
                <Button 
                  variant="outline" 
                  className="w-full flex items-center justify-center gap-2 h-12 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5 transition-all text-sm font-bold"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="size-4" />
                  Add New Cloud Connection
                </Button>
              )}

              {/* Add Connection Form */}
              {showAddForm && (
                <Card className="border shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold">New Connection</CardTitle>
                      <Button variant="ghost" size="icon-xs" onClick={resetForm}>
                        <X className="size-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {/* Provider Selector */}
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Select Cloud Provider</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'aws', label: 'AWS', icon: <Icons.AWS />, color: 'text-[#FF9900]' },
                          { id: 'azure', label: 'Azure', icon: <Icons.Azure />, color: 'text-[#0078D4]' },
                          { id: 'gcp', label: 'GCP', icon: <Icons.GCP />, color: 'text-[#4285F4]' }
                        ].map(p => (
                          <Button
                            key={p.id}
                            variant={provider === p.id ? "secondary" : "outline"}
                            className={cn(
                              "h-16 flex flex-col gap-1 items-center justify-center rounded-xl transition-all",
                              provider === p.id ? "ring-2 ring-primary" : "opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                            )}
                            onClick={() => { setProvider(p.id); setTestResult(null); if(p.id !== 'aws') setSetupMode('manual'); }}
                          >
                            <div className={cn("size-6 scale-110", p.color)}>{p.icon}</div>
                            <span className="text-[8px] font-black uppercase tracking-tighter">{p.label}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Mode Toggle (AWS ONLY) */}
                    {provider === 'aws' && (
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Setup Mode</Label>
                        <Tabs value={setupMode} onValueChange={setSetupMode} className="w-full">
                          <TabsList className="grid w-full grid-cols-2 h-9 p-1">
                            <TabsTrigger value="auto" className="text-[10px] font-bold">Auto-Scaffold</TabsTrigger>
                            <TabsTrigger value="manual" className="text-[10px] font-bold">Manual Setup</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                    )}

                    {/* Connection Metadata */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Connection Alias</Label>
                        <Input 
                          value={alias} 
                          onChange={e => setAlias(e.target.value)}
                          placeholder={`e.g. Production ${provider.toUpperCase()}`}
                          className="h-9 text-xs"
                        />
                      </div>

                      {/* AWS Fields */}
                      {provider === 'aws' && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Region</Label>
                            <Select value={region} onValueChange={setRegion}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select region" />
                              </SelectTrigger>
                              <SelectContent>
                                {AWS_REGIONS.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>

                          {setupMode === 'auto' ? (
                            <div className="space-y-3 pt-2">
                              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 flex gap-3 items-start">
                                <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                                <p className="text-[10px] leading-relaxed text-muted-foreground">
                                  Provide admin keys to automatically provision a restricted <strong>infradian-scanner</strong> user with ReadOnlyAccess.
                                </p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Admin Access Key</Label>
                                <Input 
                                  value={adminAccessKey} 
                                  onChange={e => setAdminAccessKey(e.target.value)}
                                  placeholder="AKIA..."
                                  className="h-9 text-xs font-mono"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Admin Secret Key</Label>
                                <Input 
                                  type="password"
                                  value={adminSecretKey} 
                                  onChange={e => setAdminSecretKey(e.target.value)}
                                  placeholder="••••••••••••"
                                  className="h-9 text-xs font-mono"
                                />
                              </div>
                              <Button
                                className="w-full font-bold uppercase tracking-widest text-[10px] h-9 shadow-lg shadow-primary/20"
                                onClick={handleBootstrap}
                                disabled={bootstrapping || !adminAccessKey || !adminSecretKey || !alias}
                              >
                                {bootstrapping ? (
                                  <><RefreshCw className="size-3 mr-2 animate-spin" /> Provisioning...</>
                                ) : (
                                  <><Plus className="size-3 mr-2" /> Auto-Provision Scanner</>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3 pt-2">
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Access Key ID</Label>
                                <Input 
                                  value={accessKey} 
                                  onChange={e => setAccessKey(e.target.value)}
                                  placeholder="AKIA..."
                                  className="h-9 text-xs font-mono"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Secret Access Key</Label>
                                <Input 
                                  type="password"
                                  value={secretKey} 
                                  onChange={e => setSecretKey(e.target.value)}
                                  placeholder="••••••••••••"
                                  className="h-9 text-xs font-mono"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Azure Fields */}
                      {provider === 'azure' && (
                        <div className="space-y-3 pt-2">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tenant ID</Label>
                            <Input 
                              value={tenantId} 
                              onChange={e => setTenantId(e.target.value)}
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Client ID</Label>
                            <Input 
                              value={clientId} 
                              onChange={e => setClientId(e.target.value)}
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Client Secret</Label>
                            <Input 
                              type="password"
                              value={clientSecret} 
                              onChange={e => setClientSecret(e.target.value)}
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                        </div>
                      )}

                      {/* GCP Fields */}
                      {provider === 'gcp' && (
                        <div className="space-y-3 pt-2">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Project ID</Label>
                            <Input 
                              value={projectId} 
                              onChange={e => setProjectId(e.target.value)}
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Service Account JSON</Label>
                            <textarea
                              className="w-full flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm transition-colors cursor-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                              value={saJson} 
                              onChange={e => setSaJson(e.target.value)}
                              placeholder='{ "type": "service_account", ... }'
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="p-4 bg-muted/30 border-t flex flex-col gap-3">
                    {setupMode === 'manual' && (
                      <>
                        {testResult && (
                          <div className={cn(
                            "w-full p-2.5 rounded-lg border text-[10px] font-bold flex gap-2 items-center",
                            testResult.valid ? "bg-green-500/10 border-green-500/20 text-green-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                          )}>
                            {testResult.valid ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
                            {testResult.valid ? `Verified Connection: ${testResult.account_id}` : testResult.error || 'Invalid credentials'}
                          </div>
                        )}
                        <div className="flex gap-2 w-full">
                          <Button 
                            variant="outline" 
                            className="flex-1 text-[10px] font-bold h-9" 
                            onClick={handleTest}
                            disabled={testing}
                          >
                            {testing ? <RefreshCw className="size-3 mr-2 animate-spin" /> : <Activity className="size-3 mr-2" />}
                            Test
                          </Button>
                          <Button 
                            className="flex-1 text-[10px] font-bold h-9" 
                            onClick={handleSave}
                            disabled={saving || !testResult?.valid || !alias}
                          >
                            {saving ? <RefreshCw className="size-3 mr-2 animate-spin" /> : <Plus className="size-3 mr-2" />}
                            Save
                          </Button>
                        </div>
                      </>
                    )}
                    {formError && (
                      <div className="w-full p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold flex gap-2 items-center">
                        <AlertCircle className="size-3" />
                        {formError}
                      </div>
                    )}
                  </CardFooter>
                </Card>
              )}

            {/* ── Section Label ──────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">
                Connected Accounts ({connections.length})
              </Label>
              {loading && <RefreshCw className="size-3 animate-spin text-muted-foreground" />}
            </div>

            {/* ── Connection List ────────────────────────────────── */}
            {!loading && connections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 opacity-50">
                <Cloud className="size-12 stroke-[1]" />
                <div className="space-y-1">
                  <p className="text-sm font-bold">No connections yet</p>
                  <p className="text-xs">Add your first cloud account to start analyzing.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pb-12">
                {connections.map(conn => {
                  const isVisible = activeAccounts === null 
                    ? true 
                    : activeAccounts.has(String(conn.account_id));
                  
                  return (
                    <ConnectionCard
                      key={conn.id}
                      conn={conn}
                      isSyncing={syncingIds.has(conn.id)}
                      isDeleting={deletingIds.has(conn.id)}
                      syncResult={syncResults[conn.id]}
                      isVisible={isVisible}
                      onToggleVisible={() => {
                        let next;
                        if (activeAccounts === null) {
                          next = new Set(connections.map(c => String(c.account_id)));
                        } else {
                          next = new Set(activeAccounts);
                        }
                        
                        const accStr = String(conn.account_id);
                        if (next.has(accStr)) {
                          next.delete(accStr);
                        } else {
                          next.add(accStr);
                        }
                        
                        if (next.size === connections.length) {
                           setActiveAccounts(null);
                        } else {
                           setActiveAccounts(next);
                        }
                      }}
                      onSync={() => handleSync(conn.id)}
                      onDelete={() => handleDelete(conn.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="p-4 border-t bg-muted/20">
          <p className="text-[9px] text-center w-full font-bold uppercase tracking-widest text-muted-foreground opacity-50">
            Infradian Cloud Engine v2.4
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ConnectionCard({
  conn, isSyncing, isDeleting, syncResult, isVisible, onToggleVisible, onSync, onDelete,
}) {
  const providerColor = conn.provider === 'aws' ? 'border-[#FF9900]' : conn.provider === 'azure' ? 'border-[#0078D4]' : 'border-[#4285F4]';
  const providerIcon = {
    aws: <Icons.AWS />,
    azure: <Icons.Azure />,
    gcp: <Icons.GCP />
  }[conn.provider];

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-200 border-l-4",
      isVisible ? providerColor : "border-muted grayscale opacity-60",
      "hover:shadow-md"
    )}>
      <CardHeader className="p-4 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Switch 
              checked={isVisible} 
              onCheckedChange={onToggleVisible}
              className="scale-75"
            />
            <div className="flex items-center gap-2">
              <div className={cn("size-4", 
                conn.provider === 'aws' ? "text-[#FF9900]" : 
                conn.provider === 'azure' ? "text-[#0078D4]" : "text-[#4285F4]"
              )}>
                {providerIcon}
              </div>
              <span className={cn("text-sm font-bold truncate max-w-[180px]", !isVisible && "line-through opacity-50")}>
                {conn.alias}
              </span>
            </div>
          </div>
          <StatusBadge status={isSyncing ? 'syncing' : conn.status} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Lock className="size-2.5 opacity-50" />
            <span className="font-bold opacity-60 uppercase">Account:</span>
            <span className="font-mono truncate">{conn.account_id || '—'}</span>
          </div>
          {conn.region && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Globe className="size-2.5 opacity-50" />
              <span className="font-bold opacity-60 uppercase">Region:</span>
              <span className="truncate">{conn.region}</span>
            </div>
          )}
          {conn.access_key_id_masked && (
            <div className="col-span-2 flex items-center gap-1 text-muted-foreground">
              <Key className="size-2.5 opacity-50" />
              <span className="font-bold opacity-60 uppercase">Key:</span>
              <code className="bg-muted px-1 rounded text-[9px] font-mono">{conn.access_key_id_masked}</code>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 py-3 bg-muted/10 border-t flex items-center justify-between">
        <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground opacity-60 ">
          <RefreshCw className="size-2.5" />
          LAST SYNC: {timeAgo(conn.last_sync_at).toUpperCase()}
        </div>
        <div className="flex items-center gap-1.5">
          <Button 
            variant="ghost" 
            size="icon-xs" 
            className="h-7 w-7 text-primary hover:bg-primary/10" 
            onClick={(e) => { e.stopPropagation(); onSync(); }}
            disabled={isSyncing}
          >
            <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon-xs" 
            className="h-7 w-7 text-destructive hover:bg-destructive/10" 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={isDeleting}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>

      {syncResult && (
        <CardFooter className="px-4 py-3 bg-background border-t">
          <div className="w-full space-y-2">
            <div className={cn(
              "text-[10px] font-bold flex items-center gap-1.5",
              syncResult.status === 'error' ? "text-destructive" : "text-green-500"
            )}>
              {syncResult.status === 'error' ? <AlertCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
              {syncResult.message}
            </div>
            {syncResult.collector_errors?.length > 0 && (
              <ul className="text-[9px] text-destructive/80 space-y-1 list-disc pl-4">
                {syncResult.collector_errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
