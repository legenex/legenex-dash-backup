import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { metaOauthStart } from '@/functions/metaOauthStart';
import { metaBusinesses } from '@/functions/metaBusinesses';
import { saveMetaConnection } from '@/functions/saveMetaConnection';
import { registerMetaAdAccounts } from '@/functions/registerMetaAdAccounts';
import { appParams } from '@/lib/app-params';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Facebook, Search, Loader2, ChevronDown, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// Connector-style Meta connect flow. Step 1: connect with Facebook Login (or
// paste a system-user token). Step 2: pick which ad accounts to connect, with
// search and select-all. Accounts are registered without a supplier via
// registerMetaAdAccounts; campaigns are mapped to a Campaign + Source later.
// Reuses the OAuth popup and asset loading proven in MetaConnectWizard.
export default function MetaConnectDialog({ open, onOpenChange, onConnected, includeLeadForms = false }) {
  const qc = useQueryClient();
  const [step, setStep] = useState('connect');
  const [connectionId, setConnectionId] = useState('');
  const [assets, setAssets] = useState(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [chosen, setChosen] = useState([]);
  const [search, setSearch] = useState('');
  const [oauthPending, setOauthPending] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newToken, setNewToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  const reset = () => {
    setStep('connect'); setConnectionId(''); setAssets(null); setChosen([]);
    setSearch(''); setOauthPending(false); setRegistering(false); setError('');
    setShowToken(false); setNewLabel(''); setNewToken(''); setSavingToken(false);
  };
  const close = (o) => { if (!o) reset(); onOpenChange(o); };

  // Open Facebook Login in a popup; the callback posts a message back (handled
  // by the effect below) so we advance to account selection without navigating.
  const startOauth = async () => {
    setError(''); setOauthPending(true);
    try {
      const origin = window.location.origin;
      const redirectUri = `${origin}/api/apps/${appParams.appId}/functions/metaOauthCallback`;
      const res = await metaOauthStart({ origin, redirect_uri: redirectUri, include_lead_forms: includeLeadForms });
      const url = res?.data?.url;
      if (!url) { setError('Could not start Facebook Login. Set the Meta App credentials in Settings > Data Sources.'); setOauthPending(false); return; }
      const w = 600, h = 760;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      const popup = window.open(url, 'meta_oauth', `width=${w},height=${h},left=${left},top=${top}`);
      if (!popup) { setError('Popup blocked. Allow popups for this site, then try again.'); setOauthPending(false); return; }
      const timer = setInterval(() => { if (popup.closed) { clearInterval(timer); setOauthPending(false); } }, 600);
    } catch (e) {
      setError(e?.response?.data?.error || 'Facebook Login is not configured'); setOauthPending(false);
    }
  };

  const addTokenConnection = async () => {
    setError('');
    if (!newLabel.trim()) { setError('Enter a connection label'); return; }
    if (!newToken.trim()) { setError('Paste a system-user token'); return; }
    setSavingToken(true);
    try {
      const res = (await saveMetaConnection({ name: newLabel.trim(), token: newToken.trim() })).data || {};
      if (!res.success) { setError(res.error || 'Meta rejected this token'); setSavingToken(false); return; }
      await loadAssets(res.connection.id);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save the token');
    }
    setSavingToken(false);
  };

  const loadAssets = async (connId) => {
    setConnectionId(connId); setLoadingAssets(true); setError('');
    try {
      const res = (await metaBusinesses({ connection_id: connId })).data || {};
      if (!res.valid) { setError(res.error || 'This connection cannot reach Meta'); setLoadingAssets(false); return; }
      setAssets(res); setChosen([]); setStep('accounts');
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load ad accounts');
    }
    setLoadingAssets(false);
  };

  useEffect(() => {
    if (!open) return;
    const onMessage = (event) => {
      const data = event?.data;
      if (!data || data.type !== 'meta_oauth') return;
      setOauthPending(false);
      if (data.success && data.connection_id) {
        loadAssets(data.connection_id);
      } else {
        const map = { state_mismatch: 'Login could not be verified. Please try again.', not_configured: 'Facebook Login is not configured yet.', unauthorized: 'You need admin access to connect Meta.' };
        setError(map[data.error] || (data.error ? `Facebook Login failed: ${data.error}` : 'Facebook Login was cancelled.'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups = useMemo(() => {
    if (!assets) return [];
    const q = search.trim().toLowerCase();
    const match = (a) => !q || `${a.name || ''} ${a.account_id || ''} ${a.business_name || ''}`.toLowerCase().includes(q);
    const out = (assets.businesses || []).map(b => ({ id: b.id, name: b.name, accounts: (b.ad_accounts || []).map(a => ({ ...a, business_id: b.id, business_name: b.name })).filter(match) }));
    const un = (assets.unassigned_ad_accounts || []).filter(match);
    if (un.length) out.push({ id: '_none', name: 'No Business Manager', accounts: un });
    return out.filter(g => g.accounts.length > 0);
  }, [assets, search]);

  const visibleAccounts = useMemo(() => groups.flatMap(g => g.accounts), [groups]);
  const isChosen = (a) => chosen.some(x => x.id === a.id);
  const toggle = (a) => setChosen(prev => prev.some(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a]);
  const allVisibleSelected = visibleAccounts.length > 0 && visibleAccounts.every(isChosen);
  const toggleAll = () => {
    if (allVisibleSelected) {
      const vis = new Set(visibleAccounts.map(a => a.id));
      setChosen(prev => prev.filter(x => !vis.has(x.id)));
    } else {
      const have = new Set(chosen.map(x => x.id));
      setChosen(prev => [...prev, ...visibleAccounts.filter(a => !have.has(a.id))]);
    }
  };

  const confirm = async () => {
    if (!chosen.length) return;
    setRegistering(true); setError('');
    try {
      const res = (await registerMetaAdAccounts({ connection_id: connectionId, accounts: chosen })).data || {};
      if (!res.success) { setError(res.error || 'Could not connect accounts'); setRegistering(false); return; }
      const n = (res.registered?.length || 0) + (res.updated?.length || 0);
      toast.success(`Connected ${n} ad account${n === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
      qc.invalidateQueries({ queryKey: ['meta-adaccounts-overview'] });
      onConnected?.();
      close(false);
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not connect accounts');
    }
    setRegistering(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-popover border-border max-w-[560px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">{step === 'accounts' ? 'Select ad accounts' : 'Connect Meta'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === 'accounts'
              ? 'Pick which ad accounts to connect. You can map their campaigns to a campaign and source afterwards.'
              : 'Sign in with Facebook to import your ad accounts.'}
          </DialogDescription>
        </DialogHeader>

        {error && <div className="rounded-md border border-border bg-card px-3 py-2 text-[12px] text-destructive">{error}</div>}

        {step === 'connect' && (
          <div className="space-y-4">
            <Button onClick={startOauth} disabled={oauthPending} className="w-full gap-2 bg-primary text-primary-foreground hover:opacity-90">
              {oauthPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4" />}
              {oauthPending ? 'Waiting for Facebook\u2026' : 'Connect with Facebook Login'}
            </Button>
            <button type="button" onClick={() => setShowToken(v => !v)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showToken ? 'rotate-180' : ''}`} /> Paste a system-user token instead
            </button>
            {showToken && (
              <div className="rounded-md border border-border bg-card p-3 space-y-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Connection label</Label>
                  <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Business Manager 1" className="mt-1 bg-background" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">System-user token</Label>
                  <Input type="password" value={newToken} onChange={e => setNewToken(e.target.value)} placeholder="Paste token" className="mt-1 bg-background font-mono text-[12px]" />
                </div>
                <Button size="sm" className="w-full gap-1.5 mt-1" onClick={addTokenConnection} disabled={savingToken}>
                  {savingToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Use token
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'accounts' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ad accounts\u2026" className="pl-8 bg-background" />
            </div>
            <div className="flex items-center justify-between px-1">
              <button type="button" onClick={toggleAll} disabled={!visibleAccounts.length} className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50">
                <Checkbox checked={allVisibleSelected} className="pointer-events-none" /> Select all{search ? ' (filtered)' : ''}
              </button>
              <span className="text-[12px] text-muted-foreground">{chosen.length} selected</span>
            </div>
            <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border bg-card">
              {loadingAssets ? (
                <div className="p-6 text-center text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading ad accounts\u2026</div>
              ) : !visibleAccounts.length ? (
                <div className="p-6 text-center text-[13px] text-muted-foreground">No ad accounts found.</div>
              ) : groups.map(g => (
                <div key={g.id}>
                  <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-secondary/40">{g.name}</div>
                  {g.accounts.map(a => (
                    <button key={a.id} type="button" onClick={() => toggle(a)} className="w-full flex items-center gap-3 border-b border-border px-3 py-2.5 text-left hover:bg-accent">
                      <Checkbox checked={isChosen(a)} className="pointer-events-none" />
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><Facebook className="w-3.5 h-3.5 text-primary" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-foreground truncate">{a.name || a.account_id}</div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">{a.account_id}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'accounts' ? (
            <Button onClick={confirm} disabled={registering || !chosen.length} className="gap-1.5 bg-primary text-primary-foreground hover:opacity-90">
              {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Connect {chosen.length || ''} account{chosen.length === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
