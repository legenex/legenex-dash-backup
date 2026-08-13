import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { metaBusinesses } from '@/functions/metaBusinesses';
import { saveMetaConnection } from '@/functions/saveMetaConnection';
import { linkAdAccountToSupplier } from '@/functions/linkAdAccountToSupplier';
import { syncMetaSpend } from '@/functions/syncMetaSpend';
import { metaOauthStart } from '@/functions/metaOauthStart';
import { metaConnectionStatus } from '@/functions/metaConnectionStatus';
import { appParams } from '@/lib/app-params';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Facebook, Search, CheckCircle2, XCircle, ChevronLeft, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

const BACKFILL_OPTIONS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 180 days' },
  { value: 365, label: 'Last 365 days' },
];

// Supplier-first Meta connect wizard, shared by Settings > Integrations and the
// Supplier detail Ad Spend tab. Steps: supplier -> connection -> accounts ->
// confirm. When a supplier prop is provided the supplier step is skipped.
export default function MetaConnectWizard({ open, onOpenChange, supplier = null, onLinked }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(supplier ? 'connection' : 'supplier');
  const [supplierId, setSupplierId] = useState(supplier?.id || '');
  const [connectionId, setConnectionId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newToken, setNewToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [assets, setAssets] = useState(null); // { businesses, unassigned_ad_accounts }
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [chosen, setChosen] = useState([]); // ad account objects
  const [search, setSearch] = useState('');
  const [backfillMode, setBackfillMode] = useState('30');
  const [backfillSince, setBackfillSince] = useState('');
  const [linking, setLinking] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState('');
  const [oauthPending, setOauthPending] = useState(false);
  const [showTokenPaste, setShowTokenPaste] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
    enabled: open,
  });
  const { data: status } = useQuery({
    queryKey: ['meta-connection-status'],
    queryFn: async () => (await metaConnectionStatus({})).data,
    enabled: open,
  });
  const connections = status?.connections || [];
  const activeSupplier = supplier || suppliers.find(s => s.id === supplierId) || null;

  const reset = () => {
    setStep(supplier ? 'connection' : 'supplier');
    setSupplierId(supplier?.id || '');
    setConnectionId('');
    setNewLabel(''); setNewToken('');
    setAssets(null); setChosen([]); setSearch('');
    setBackfillMode('30'); setBackfillSince(''); setConflicts([]); setError('');
    setOauthPending(false); setShowTokenPaste(false);
  };

  const close = (o) => {
    if (!o) reset();
    onOpenChange(o);
  };

  // Open Facebook Login in a popup. The callback posts a message back (handled
  // by the effect below) so the wizard advances without leaving the page.
  const startOauth = async () => {
    setError('');
    setOauthPending(true);
    try {
      // Pass the current host's origin and callback URL so the redirect and the
      // popup message land on whatever domain the app is running on.
      const origin = window.location.origin;
      const redirectUri = `${origin}/api/apps/${appParams.appId}/functions/metaOauthCallback`;
      const res = await metaOauthStart({ origin, redirect_uri: redirectUri });
      const url = res?.data?.url;
      if (!url) { setError('Could not start Facebook Login. Check that META_APP_ID is configured.'); setOauthPending(false); return; }
      const w = 600, h = 760;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      const popup = window.open(url, 'meta_oauth', `width=${w},height=${h},left=${left},top=${top}`);
      if (!popup) { setError('Popup blocked. Allow popups for this site, then try again.'); setOauthPending(false); return; }
      // If the user closes the popup without finishing, stop waiting and refresh
      // status in case it did complete.
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          setOauthPending(false);
          qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
        }
      }, 600);
    } catch (e) {
      setError(e?.response?.data?.error || 'Facebook Login is not configured');
      setOauthPending(false);
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
      qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
      setNewLabel(''); setNewToken('');
      await loadAssets(res.connection.id);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save the token');
    }
    setSavingToken(false);
  };

  const loadAssets = async (connId) => {
    setConnectionId(connId);
    setLoadingAssets(true);
    setError('');
    try {
      const res = (await metaBusinesses({ connection_id: connId })).data || {};
      if (!res.valid) { setError(res.error || 'This connection cannot reach Meta'); setLoadingAssets(false); return; }
      setAssets(res);
      setChosen([]);
      setStep('accounts');
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load businesses');
    }
    setLoadingAssets(false);
  };

  // Receive the popup's result and advance straight to account selection.
  useEffect(() => {
    if (!open) return;
    const onMessage = (event) => {
      const data = event?.data;
      if (!data || data.type !== 'meta_oauth') return;
      setOauthPending(false);
      if (data.success && data.connection_id) {
        qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
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

  const allAccounts = useMemo(() => {
    if (!assets) return [];
    const out = [];
    for (const b of assets.businesses || []) {
      for (const a of b.ad_accounts || []) out.push({ ...a, business_id: b.id, business_name: b.name });
    }
    for (const a of assets.unassigned_ad_accounts || []) out.push({ ...a, business_id: '', business_name: '' });
    return out;
  }, [assets]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (a) => !q || `${a.name || ''} ${a.account_id || ''} ${a.business_name || ''}`.toLowerCase().includes(q);
    const out = (assets?.businesses || []).map(b => ({ id: b.id, name: b.name, accounts: (b.ad_accounts || []).map(a => ({ ...a, business_id: b.id, business_name: b.name })).filter(match) }));
    const un = (assets?.unassigned_ad_accounts || []).filter(match);
    if (un.length) out.push({ id: '_none', name: 'No Business Manager', accounts: un });
    return out.filter(g => g.accounts.length > 0);
  }, [assets, search]);

  const toggle = (a) => {
    setChosen(prev => prev.some(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a]);
  };

  const confirmLink = async () => {
    setLinking(true);
    setError('');
    setConflicts([]);
    try {
      const res = (await linkAdAccountToSupplier({
        supplier_id: supplierId,
        connection_id: connectionId,
        backfill_days: backfillMode === 'date' ? 30 : Number(backfillMode),
        backfill_since: backfillMode === 'date' ? backfillSince : '',
        accounts: chosen,
      })).data || {};
      if (!res.success) { setError(res.error || 'Failed to link accounts'); setLinking(false); return; }
      const linkedCount = (res.linked || []).length + (res.updated || []).length;
      setConflicts(res.conflicts || []);
      if (linkedCount > 0) {
        toast.success(`Linked ${linkedCount} account${linkedCount === 1 ? '' : 's'} to ${activeSupplier?.name || 'supplier'}. First sync started.`);
        // Fire the initial backfill in the background; status cards show progress.
        syncMetaSpend({ ad_account_ids: chosen.map(a => a.id), trigger: 'initial' }).catch(() => {});
        qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
        qc.invalidateQueries({ queryKey: ['adspend'] });
        onLinked?.();
      }
      if (!(res.conflicts || []).length) close(false);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to link accounts');
    }
    setLinking(false);
  };

  const stepTitle = {
    supplier: 'Select supplier',
    connection: 'Connect a Meta account',
    accounts: 'Select business and ad accounts',
    confirm: 'Confirm association',
  }[step];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-popover border-border max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="w-4 h-4 text-primary" />
            {stepTitle}
            {activeSupplier && step !== 'supplier' && <Badge variant="outline" className="text-[10px] ml-1">{activeSupplier.name}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {step === 'supplier' && (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">Meta ad spend imported through this connection is attributed to the supplier you pick here.</p>
            <div>
              <Label className="text-[12px]">Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 'connection' && (
          <div className="space-y-4">
            {connections.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-foreground mb-2">Use an existing connection</div>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {connections.map(c => (
                    <button key={c.id} onClick={() => loadAssets(c.id)} disabled={loadingAssets}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-background gap-3 hover:border-primary/50 text-left disabled:opacity-50">
                      <div className="min-w-0">
                        <div className="text-[13px] text-foreground font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{c.auth_type === 'oauth' ? 'Facebook Login' : 'System-user token'} · ****{c.token_last4}</div>
                      </div>
                      {c.status === 'active'
                        ? <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
                        : <span className="text-[11px] status-error inline-flex items-center gap-1 font-medium shrink-0"><XCircle className="w-3.5 h-3.5" /> {c.status}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[12px] font-semibold text-foreground mb-2">{connections.length ? 'Or add a new connection' : 'Add a connection'}</div>
              <Button size="sm" variant="outline" className="gap-1.5 w-full" onClick={startOauth} disabled={oauthPending}>
                <Facebook className="w-3.5 h-3.5" /> {oauthPending ? 'Waiting for Facebook…' : 'Connect with Facebook Login'}
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1.5">A Meta window opens for you to approve access. When it closes you drop straight to picking ad accounts. Facebook Login access lasts about 60 days.</p>

              <button type="button" onClick={() => setShowTokenPaste(v => !v)} className="text-[11px] text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1">
                <ChevronDown className={`w-3 h-3 transition-transform ${showTokenPaste ? 'rotate-180' : ''}`} /> Advanced: use a system-user token instead
              </button>
              {showTokenPaste && (
                <div className="mt-2">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Connection label</Label>
                      <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Acme BM" className="mt-1 bg-background text-[13px]" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">System-user token</Label>
                      <Input value={newToken} onChange={e => { setNewToken(e.target.value); setError(''); }} type="password" placeholder="Long-lived system-user token" className="mt-1 bg-background font-mono text-[12px]" />
                    </div>
                  </div>
                  <Button size="sm" className="gap-1.5 mt-2 w-full" onClick={addTokenConnection} disabled={savingToken}>
                    {savingToken ? 'Validating…' : 'Validate and continue'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1.5">The token needs ads_read plus business_management, reaches one Business Manager, and does not expire.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'accounts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] text-muted-foreground">{chosen.length} account{chosen.length === 1 ? '' : 's'} selected</div>
              <div className="relative flex-1 max-w-[260px]">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts" className="pl-8 bg-background text-[13px]" />
              </div>
            </div>
            <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
              {allAccounts.length === 0 && <p className="text-[12px] text-muted-foreground py-3">This connection cannot reach any ad accounts.</p>}
              {groups.map(g => (
                <div key={g.id}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">{g.name}</div>
                  <div className="space-y-2">
                    {g.accounts.map(a => (
                      <label key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background gap-3 cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox checked={chosen.some(x => x.id === a.id)} onCheckedChange={() => toggle(a)} />
                          <div className="min-w-0">
                            <div className="text-[13px] text-foreground font-medium truncate">{a.name || a.account_id}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[11px] text-muted-foreground font-mono">{a.account_id}</span>
                              {a.currency && <Badge variant="outline" className="text-[10px]">{a.currency}</Badge>}
                              {a.timezone_name && <Badge variant="outline" className="text-[10px]">{a.timezone_name}</Badge>}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              Spend from {chosen.length} ad account{chosen.length === 1 ? '' : 's'} will be imported daily and attributed to <span className="text-foreground font-medium">{activeSupplier?.name}</span>. An ad account can belong to only one supplier.
            </p>
            <div>
              <Label className="text-[12px]">Initial backfill</Label>
              <Select value={backfillMode} onValueChange={setBackfillMode}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BACKFILL_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                  <SelectItem value="date">From a specific date</SelectItem>
                </SelectContent>
              </Select>
              {backfillMode === 'date' && (
                <Input type="date" value={backfillSince} onChange={e => setBackfillSince(e.target.value)} className="mt-2 bg-background text-[13px]" />
              )}
              <p className="text-[11px] text-muted-foreground mt-1">How much history the first sync imports. Ongoing syncs then re-pull the trailing 3 days to absorb Meta restatements.</p>
            </div>
            <div className="space-y-1.5 max-h-[26vh] overflow-y-auto pr-1">
              {chosen.map(a => (
                <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-background">
                  <span className="text-[12px] text-foreground truncate">{a.name || a.account_id}</span>
                  <span className="text-[11px] text-muted-foreground font-mono shrink-0">{a.account_id}</span>
                </div>
              ))}
            </div>
            {conflicts.length > 0 && (
              <div className="p-3 rounded-lg bg-status-error border border-border">
                <div className="text-[12px] status-error font-medium mb-1">Already linked to another supplier and skipped:</div>
                {conflicts.map(c => (
                  <div key={c.ad_account_id} className="text-[11px] status-error">{c.ad_account_name || c.ad_account_id} → {c.supplier_name}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-[11px] status-error inline-flex items-start gap-1.5 font-medium">
            <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'accounts' && (
            <Button variant="ghost" className="mr-auto gap-1" onClick={() => setStep('connection')}><ChevronLeft className="w-3.5 h-3.5" /> Back</Button>
          )}
          {step === 'confirm' && (
            <Button variant="ghost" className="mr-auto gap-1" onClick={() => setStep('accounts')}><ChevronLeft className="w-3.5 h-3.5" /> Back</Button>
          )}
          <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          {step === 'supplier' && <Button onClick={() => setStep('connection')} disabled={!supplierId}>Continue</Button>}
          {step === 'accounts' && <Button onClick={() => setStep('confirm')} disabled={chosen.length === 0}>Continue</Button>}
          {step === 'confirm' && <Button onClick={confirmLink} disabled={linking || (backfillMode === 'date' && !backfillSince)}>{linking ? 'Linking…' : 'Link and start sync'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}