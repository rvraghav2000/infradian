import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  testAWSConnection,
  addConnection,
  listConnections,
  syncConnection,
  deleteConnection,
  bootstrapConnection,
} from '../services/cloudApi';

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
function StatusBadge({ status, isDark }) {
  const map = {
    connected: { bg: 'rgba(52,199,89,0.15)', color: '#34C759', label: 'Connected' },
    syncing:   { bg: 'rgba(0,122,255,0.15)',  color: '#007AFF', label: 'Syncing…' },
    warning:   { bg: 'rgba(255,149,0,0.15)',  color: '#FF9500', label: 'Warning' },
    error:     { bg: 'rgba(255,59,48,0.15)',   color: '#FF3B30', label: 'Error' },
    unknown:   { bg: 'rgba(174,174,178,0.15)', color: '#aeaeb2', label: 'Unknown' },
  };
  const s = map[status] || map.unknown;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
      background: s.bg, color: s.color,
      fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: s.color,
        animation: status === 'syncing' ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }} />
      {s.label}
    </span>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  CloudSettings — Main Component
// ═══════════════════════════════════════════════════════════════════

export default function CloudSettings({ isOpen, onClose, theme = 'light' }) {
  const isDark = theme === 'dark';

  // ── State ──────────────────────────────────────────────────────
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [setupMode, setSetupMode] = useState('auto'); // 'auto' | 'manual'
  const [alias, setAlias] = useState('');
  const [region, setRegion] = useState('us-east-1');
  
  // Manual mode states
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  
  // Auto mode states
  const [adminAccessKey, setAdminAccessKey] = useState('');
  const [adminSecretKey, setAdminSecretKey] = useState('');
  const [bootstrapping, setBootstrapping] = useState(false);

  const [testResult, setTestResult] = useState(null);   // { valid, account_id, error }
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Sync/delete in-flight
  const [syncingIds, setSyncingIds] = useState(new Set());
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [syncResults, setSyncResults] = useState({});

  // ── Fetch connections ──────────────────────────────────────────
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

  // ── Test Connection ────────────────────────────────────────────
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setFormError('');
    try {
      const result = await testAWSConnection({ region, access_key_id: accessKey, secret_access_key: secretKey });
      setTestResult(result);
    } catch (e) {
      setTestResult({ valid: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  // ── Save Connection (Manual) ───────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const conn = await addConnection({ alias, region, access_key_id: accessKey, secret_access_key: secretKey });
      resetForm();
      await fetchConnections();
      handleSync(conn.id);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Bootstrap Connection (Auto) ────────────────────────────────
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
    setAlias(''); setRegion('us-east-1'); 
    setAccessKey(''); setSecretKey('');
    setAdminAccessKey(''); setAdminSecretKey('');
    setTestResult(null); setShowAddForm(false);
    setFormError('');
  };

  // ── Sync ───────────────────────────────────────────────────────
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

  // ── Delete ─────────────────────────────────────────────────────
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

  // ── Keyboard Dismiss ───────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── Theme tokens ───────────────────────────────────────────────
  const panelBg    = isDark ? 'rgba(18,18,20,0.96)' : 'rgba(248,248,250,0.97)';
  const borderClr  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const cardBg     = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textPrim   = isDark ? 'rgba(255,255,255,0.9)' : '#1d1d1f';
  const textSec    = isDark ? 'rgba(255,255,255,0.5)' : '#86868b';
  const textDim    = isDark ? 'rgba(255,255,255,0.25)' : '#aeaeb2';
  const inputBg    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const inputBdr   = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for click-outside to close */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 69,
              background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)'
            }}
          />
          
          <motion.aside
            key="cloud-settings"
            initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed"
          style={{
            top: 0, right: 0, bottom: 0,
            width: 420, zIndex: 70,
            display: 'flex', flexDirection: 'column',
            background: panelBg,
            backdropFilter: 'blur(32px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(32px) saturate(1.6)',
            borderLeft: `1px solid ${borderClr}`,
            boxShadow: isDark
              ? '-8px 0 40px rgba(0,0,0,0.5)'
              : '-4px 0 30px rgba(0,0,0,0.08)',
            fontFamily: 'Inter, -apple-system, sans-serif',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          {/* ── Header ──────────────────────────────────────────── */}
          <div style={{
            padding: '28px 24px 16px',
            borderBottom: `1px solid ${borderClr}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: textDim,
              }}>
                Settings
              </div>
              <h2 style={{
                fontSize: 18, fontWeight: 700, color: textPrim,
                letterSpacing: '-0.02em', margin: '4px 0 0',
                background: 'linear-gradient(135deg, #f97316, #f59e0b)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Cloud Connections
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 10,
                border: `1px solid ${cardBorder}`,
                background: cardBg, color: textSec,
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 12, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = cardBg; }}
            >
              ✕
            </button>
          </div>

          {/* ── Content ─────────────────────────────────────────── */}
          <div style={{ padding: '16px 24px 32px', flex: 1 }}>

            {/* Add New Connection Button */}
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  width: '100%', padding: '12px 16px',
                  borderRadius: 12,
                  border: `1.5px dashed ${isDark ? 'rgba(249,115,22,0.3)' : 'rgba(249,115,22,0.4)'}`,
                  background: isDark ? 'rgba(249,115,22,0.06)' : 'rgba(249,115,22,0.04)',
                  color: '#f97316',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginBottom: 20,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = isDark ? 'rgba(249,115,22,0.12)' : 'rgba(249,115,22,0.08)';
                  e.currentTarget.style.borderColor = '#f97316';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = isDark ? 'rgba(249,115,22,0.06)' : 'rgba(249,115,22,0.04)';
                  e.currentTarget.style.borderColor = isDark ? 'rgba(249,115,22,0.3)' : 'rgba(249,115,22,0.4)';
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                Add AWS Connection
              </button>
            )}

            {/* ── Add Connection Form ───────────────────────────── */}
            <AnimatePresence>
              {showAddForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden', marginBottom: 20 }}
                >
                  <div style={{
                    padding: 16, borderRadius: 14,
                    background: cardBg,
                    border: `1px solid ${cardBorder}`,
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: 14,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: textPrim }}>New Connection</span>
                      <button
                        onClick={resetForm}
                        style={{ background: 'none', border: 'none', color: textSec, cursor: 'pointer', fontSize: 10 }}
                      >Cancel</button>
                    </div>

                    {/* Mode Toggle */}
                    <div style={{ 
                      display: 'flex', background: inputBg, borderRadius: 10, 
                      padding: 2, marginBottom: 16, border: `1px solid ${inputBdr}`
                    }}>
                      <button
                        onClick={() => { setSetupMode('auto'); setTestResult(null); }}
                        style={{
                          flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 10, fontWeight: 600,
                          border: 'none', cursor: 'pointer',
                          background: setupMode === 'auto' ? (isDark ? 'rgba(255,255,255,0.1)' : '#fff') : 'transparent',
                          color: setupMode === 'auto' ? '#f97316' : textSec,
                          boxShadow: setupMode === 'auto' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        Auto-Scaffold
                      </button>
                      <button
                        onClick={() => { setSetupMode('manual'); setTestResult(null); }}
                        style={{
                          flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 10, fontWeight: 600,
                          border: 'none', cursor: 'pointer',
                          background: setupMode === 'manual' ? (isDark ? 'rgba(255,255,255,0.1)' : '#fff') : 'transparent',
                          color: setupMode === 'manual' ? '#f97316' : textSec,
                          boxShadow: setupMode === 'manual' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        Manual Setup
                      </button>
                    </div>

                    {/* Alias */}
                    <label style={labelStyle(textSec)}>Connection Alias</label>
                    <input
                      type="text" value={alias} onChange={e => setAlias(e.target.value)}
                      placeholder="e.g. My Production VPC"
                      style={inputStyle(inputBg, inputBdr, textPrim)}
                    />

                    {/* Region */}
                    <label style={labelStyle(textSec)}>AWS Region</label>
                    <select
                      value={region} onChange={e => setRegion(e.target.value)}
                      style={{ ...inputStyle(inputBg, inputBdr, textPrim), cursor: 'pointer', appearance: 'auto' }}
                    >
                      {AWS_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>

                    {setupMode === 'auto' ? (
                      <>
                        <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.1)', marginBottom: 12 }}>
                          <p style={{ margin: 0, fontSize: 10, color: textSec, lineHeight: 1.4 }}>
                            Provide admin keys to automatically create a restricted <strong>infradian-scanner</strong> user with <strong>ReadOnlyAccess</strong>.
                          </p>
                        </div>
                        <label style={labelStyle(textSec)}>Admin Access Key</label>
                        <input
                          type="text" value={adminAccessKey} onChange={e => setAdminAccessKey(e.target.value)}
                          placeholder="AKIA..."
                          style={{ ...inputStyle(inputBg, inputBdr, textPrim), fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}
                        />
                        <label style={labelStyle(textSec)}>Admin Secret Key</label>
                        <input
                          type="password" value={adminSecretKey} onChange={e => setAdminSecretKey(e.target.value)}
                          placeholder="Secret..."
                          style={{ ...inputStyle(inputBg, inputBdr, textPrim), fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}
                        />
                        
                        {formError && (
                          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, fontSize: 11, background: 'rgba(255,59,48,0.12)', color: '#FF3B30', border: '1px solid rgba(255,59,48,0.2)' }}>
                            {formError}
                          </div>
                        )}

                        <button
                          onClick={handleBootstrap}
                          disabled={bootstrapping || !adminAccessKey || !adminSecretKey || !alias}
                          style={{
                            width: '100%', marginTop: 14, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, color: '#fff',
                            background: (!adminAccessKey || !adminSecretKey || !alias) ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)') : 'linear-gradient(135deg, #f97316, #f59e0b)',
                            opacity: (!adminAccessKey || !adminSecretKey || !alias) ? 0.5 : 1,
                            transition: 'all 0.2s',
                          }}
                        >
                          {bootstrapping ? '⟳ Provisioning...' : '🚀 Auto-Provision Scanner'}
                        </button>
                      </>
                    ) : (
                      <>
                        <label style={labelStyle(textSec)}>Access Key ID</label>
                        <input
                          type="text" value={accessKey} onChange={e => setAccessKey(e.target.value)}
                          placeholder="AKIA..."
                          style={{ ...inputStyle(inputBg, inputBdr, textPrim), fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}
                        />
                        <label style={labelStyle(textSec)}>Secret Access Key</label>
                        <input
                          type="password" value={secretKey} onChange={e => setSecretKey(e.target.value)}
                          placeholder="Secret..."
                          style={{ ...inputStyle(inputBg, inputBdr, textPrim), fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}
                        />

                        {testResult && (
                          <div style={{
                            marginTop: 10, padding: '8px 12px', borderRadius: 10,
                            fontSize: 11, fontWeight: 500,
                            background: testResult.valid ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
                            color: testResult.valid ? '#34C759' : '#FF3B30',
                            border: `1px solid ${testResult.valid ? 'rgba(52,199,89,0.2)' : 'rgba(255,59,48,0.2)'}`,
                          }}>
                            {testResult.valid ? `✓ Verified — Account ${testResult.account_id}` : `✗ ${testResult.error || 'Invalid credentials'}`}
                          </div>
                        )}

                        {formError && (
                          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, fontSize: 11, background: 'rgba(255,59,48,0.12)', color: '#FF3B30', border: '1px solid rgba(255,59,48,0.2)' }}>
                            {formError}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                          <button
                            onClick={handleTest}
                            disabled={testing || !accessKey || !secretKey}
                            style={{ ...actionBtnStyle(isDark), flex: 1, opacity: (!accessKey || !secretKey) ? 0.4 : 1 }}
                          >
                            {testing ? '⟳ Testing…' : '⚡ Test'}
                          </button>
                          <button
                            onClick={handleSave}
                            disabled={saving || !testResult?.valid || !alias}
                            style={{
                              flex: 1, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                              fontSize: 11, fontWeight: 600, color: '#fff',
                              background: (!testResult?.valid || !alias) ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)') : 'linear-gradient(135deg, #f97316, #f59e0b)',
                              opacity: (!testResult?.valid || !alias) ? 0.5 : 1,
                              transition: 'all 0.2s',
                            }}
                          >
                            {saving ? 'Saving…' : 'Save Connection'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Section Label ──────────────────────────────────── */}
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: textDim,
              marginBottom: 10,
            }}>
              Connected Accounts ({connections.length})
            </div>

            {/* ── Connection List ────────────────────────────────── */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: textSec, fontSize: 12 }}>
                Loading connections…
              </div>
            ) : connections.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 20px',
                color: textDim, fontSize: 12,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>☁️</div>
                No connections yet. Add your first AWS account above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {connections.map(conn => (
                  <ConnectionCard
                    key={conn.id}
                    conn={conn}
                    isDark={isDark}
                    cardBg={cardBg}
                    cardBorder={cardBorder}
                    textPrim={textPrim}
                    textSec={textSec}
                    textDim={textDim}
                    isSyncing={syncingIds.has(conn.id)}
                    isDeleting={deletingIds.has(conn.id)}
                    syncResult={syncResults[conn.id]}
                    onSync={() => handleSync(conn.id)}
                    onDelete={() => handleDelete(conn.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  ConnectionCard — Individual account row
// ═══════════════════════════════════════════════════════════════════

function ConnectionCard({
  conn, isDark, cardBg, cardBorder, textPrim, textSec, textDim,
  isSyncing, isDeleting, syncResult, onSync, onDelete,
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '14px 16px', borderRadius: 14,
        background: hovered
          ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)')
          : cardBg,
        border: `1px solid ${hovered ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)') : cardBorder}`,
        transition: 'all 0.15s',
      }}
    >
      {/* Top row: alias + badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: textPrim,
          letterSpacing: '-0.01em',
        }}>
          {conn.alias}
        </span>
        <StatusBadge status={isSyncing ? 'syncing' : conn.status} isDark={isDark} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 16, fontSize: 10, color: textSec, marginBottom: 10, flexWrap: 'wrap' }}>
        <span title="Account ID">
          <strong style={{ color: textDim, fontWeight: 600 }}>ID:</strong> {conn.account_id || '—'}
        </span>
        <span title="Region">
          <strong style={{ color: textDim, fontWeight: 600 }}>Region:</strong> {conn.region}
        </span>
        <span title="Access Key">
          <strong style={{ color: textDim, fontWeight: 600 }}>Key:</strong>{' '}
          <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9 }}>{conn.access_key_id_masked}</code>
        </span>
      </div>

      {/* Bottom row: last sync + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: textDim }}>
          Synced: {timeAgo(conn.last_sync_at)}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onSync}
            disabled={isSyncing}
            style={{
              padding: '5px 12px', borderRadius: 8,
              border: 'none', cursor: isSyncing ? 'wait' : 'pointer',
              fontSize: 10, fontWeight: 600,
              background: isDark ? 'rgba(0,122,255,0.15)' : 'rgba(0,122,255,0.1)',
              color: '#007AFF',
              transition: 'all 0.15s',
              opacity: isSyncing ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!isSyncing) e.currentTarget.style.background = isDark ? 'rgba(0,122,255,0.25)' : 'rgba(0,122,255,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(0,122,255,0.15)' : 'rgba(0,122,255,0.1)'; }}
          >
            {isSyncing ? '⟳ Syncing…' : '↻ Sync Now'}
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            style={{
              padding: '5px 12px', borderRadius: 8,
              border: 'none', cursor: isDeleting ? 'wait' : 'pointer',
              fontSize: 10, fontWeight: 600,
              background: isDark ? 'rgba(255,59,48,0.12)' : 'rgba(255,59,48,0.08)',
              color: '#FF3B30',
              transition: 'all 0.15s',
              opacity: isDeleting ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!isDeleting) e.currentTarget.style.background = isDark ? 'rgba(255,59,48,0.22)' : 'rgba(255,59,48,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,59,48,0.12)' : 'rgba(255,59,48,0.08)'; }}
          >
            {isDeleting ? 'Removing…' : 'Delete'}
          </button>
        </div>
      </div>

      {syncResult && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          fontSize: 10, background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
          border: `1px solid ${cardBorder}`
        }}>
          <div style={{ 
            color: syncResult.status === 'warning' ? '#FF9500' : 
                   syncResult.status === 'error' ? '#FF3B30' : '#34C759',
            fontWeight: 600, marginBottom: 4 
          }}>
            {syncResult.message}
          </div>
          {syncResult.collector_errors && syncResult.collector_errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, color: '#FF3B30', marginTop: 6, listStyleType: 'disc' }}>
              {syncResult.collector_errors.map((err, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}


// ── Shared inline style helpers ─────────────────────────────────────

function labelStyle(color) {
  return {
    display: 'block', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color, marginTop: 10, marginBottom: 4,
    fontFamily: 'Inter, -apple-system, sans-serif',
  };
}

function inputStyle(bg, border, color) {
  return {
    width: '100%', padding: '8px 12px',
    borderRadius: 10,
    border: `1px solid ${border}`,
    background: bg, color,
    fontSize: 12, outline: 'none',
    fontFamily: 'Inter, -apple-system, sans-serif',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  };
}

function actionBtnStyle(isDark) {
  return {
    padding: '8px 14px', borderRadius: 10,
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    color: isDark ? 'rgba(255,255,255,0.8)' : '#1d1d1f',
    cursor: 'pointer', fontSize: 11, fontWeight: 600,
    transition: 'all 0.15s',
  };
}
