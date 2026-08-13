import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { metaConnectionStatus } from '@/functions/metaConnectionStatus';
import { saveMetaAppCredentials } from '@/functions/saveMetaAppCredentials';
import { appParams } from '@/lib/app-params';
import { syncMetaSpend } from '@/functions/syncMetaSpend';
import { testMetaConnection } from '@/functions/testMetaConnection';
import { disconnectMetaConnection } from '@/functions/disconnectMetaConnection';
import { metaAdAccountsOverview } from '@/functions/metaAdAccountsOverview';
import { metaCampaignMappings } from '@/functions/metaCampaignMappings';
import MetaSyncHistoryDialog from '@/components/settings/MetaSyncHistoryDialog';
import MetaEditMappingDialog from '@/components/settings/MetaEditMappingDialog';
import MetaMapCampaignsDialog from '@/components/settings/MetaMapCampaignsDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import MetaConnectWizard from '@/components/settings/MetaConnectWizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Facebook, RefreshCw, Plus, Trash2, CheckCircle2, XCircle, Link2, AlertTriangle, KeyRound, ShieldCheck, PlugZap, MoreVertical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const fmtWhen = (iso) => {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Settings > Integrations Meta card. Supplier-first: connections are listed
// with health, every supplier association is grouped under its supplier, and
// the shared wizard (opened with no supplier so it shows the supplier step)
// handles connecting and linking. The Campaign Mappings card is retained only
// to tag ad accounts or campaigns with a vertical and brand; supplier
// attribution now lives on the SupplierAdAccount association, not the mapping.
export default function MetaAdSpend() {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [appIdInput, setAppIdInput] = useState('');
  const [appSecretInput, setAppSecretInput] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const [testingConn, setTestingConn] = useState('');
  const [disconnectingId, setDisconnectingId] = useState('');
  const [mapForAccount, setMapForAccount] = useState(null);
  const [showHidden, setShowHidden] = useState(false);

  const { data: status, refetch } = useQuery({
    queryKey: ['meta-connection-status'],
    queryFn: async () => (await metaConnectionStatus({})).data,
  });
  const { data: mappings = [] } = useQuery({
    queryKey: ['adspend-mappings'],
    queryFn: () => base44.entities.AdSpendMapping.list('-created_date'),
  });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('sort_order') });
  const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: () => base44.entities.Brand.list() });

  const connections = status?.connections || [];
  const accounts = status?.accounts || [];
  const connected = connections.length > 0;
  const activeConns = connections.filter(c => c.status === 'active').length;
  const suppliersLinked = new Set(accounts.map(a => a.supplier_id)).size;

  const { data: overview, refetch: refetchOverview, isFetching: loadingAccounts } = useQuery({
    queryKey: ['meta-ad-accounts'],
    queryFn: async () => (await metaAdAccountsOverview({})).data,
    enabled: connections.length > 0,
  });
  const adAccounts = overview?.accounts || [];
  const hiddenAccounts = overview?.hidden || [];
  const metaApp = status?.meta_app;
  const redirectUri = `${window.location.origin}/api/apps/${appParams.appId}/functions/metaOauthCallback`;
  useEffect(() => { if (metaApp?.app_id && !appIdInput) setAppIdInput(metaApp.app_id); }, [metaApp?.app_id]);

  const saveCreds = async () => {
    if (!appIdInput.trim() && !metaApp?.app_id) { toast.error('Enter the Meta App ID'); return; }
    setSavingCreds(true);
    try {
      const d = (await saveMetaAppCredentials({ app_id: appIdInput.trim(), app_secret: appSecretInput.trim() })).data || {};
      if (d.success) { toast.success('Meta app credentials saved'); setAppSecretInput(''); setCredsOpen(false); refetch(); }
      else toast.error(d.error || 'Failed to save credentials');
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to save credentials'); }
    setSavingCreds(false);
  };

  // Group associations by supplier for display.

  const runSync = async () => {
    setSyncing(true);
    try {
      const d = (await syncMetaSpend({})).data || {};
      if (d.success) toast.success(`Synced ${d.accounts_synced || 0} account${d.accounts_synced === 1 ? '' : 's'}, ${d.rows_synced || 0} daily spend rows`);
      else toast.error(d.error || 'Sync failed');
      refetch();
      qc.invalidateQueries({ queryKey: ['adspend'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Sync failed'); }
    setSyncing(false);
  };

  const testConnection = async (connectionId) => {
    setTestingConn(connectionId);
    try {
      const d = (await testMetaConnection({ connection_id: connectionId })).data || {};
      if (d.valid) toast.success(`Connection healthy. Reaches ${d.reachable_accounts} ad account${d.reachable_accounts === 1 ? '' : 's'}.`);
      else toast.error(d.error || 'Connection test failed');
      refetch();
    } catch (e) { toast.error(e?.response?.data?.error || 'Test failed'); }
    setTestingConn('');
  };

  const disconnect = async (c) => {
    if (!window.confirm(`Disconnect "${c.name}"? Its ad-account links are removed and it stops syncing. Imported spend history is kept.`)) return;
    setDisconnectingId(c.id);
    try {
      const d = (await disconnectMetaConnection({ connection_id: c.id })).data || {};
      if (d.success) toast.success('Connection disconnected.');
      else toast.error(d.error || 'Failed to disconnect');
      refetch();
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to disconnect'); }
    setDisconnectingId('');
  };

  const disconnectAccount = async (a) => {
    if (!window.confirm(`Disconnect ${a.ad_account_name}? It is removed from this list and stops syncing, and its campaign mappings are cleared. Imported spend history is kept.`)) return;
    try {
      await metaCampaignMappings({ action: 'disconnect_account', ad_account_id: a.ad_account_id });
      toast.success('Ad account disconnected.');
      refetchOverview(); refetch();
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to disconnect'); }
  };

  const restoreAccount = async (a) => {
    try { await metaCampaignMappings({ action: 'restore_account', ad_account_id: a.ad_account_id }); toast.success('Ad account restored.'); refetchOverview(); }
    catch { toast.error('Failed to restore'); }
  };

  const openMap = () => {
    setForm({ platform: 'meta', ad_account_id: '', ad_account_name: '', meta_campaign_id: '', meta_campaign_name: '', match_level: 'ad_account', vertical: '', brand: '', enabled: true });
    setMapOpen(true);
  };
  const saveMapping = async () => {
    if (!form.ad_account_id) { toast.error('Ad account id is required'); return; }
    await base44.entities.AdSpendMapping.create({ ...form });
    setMapOpen(false);
    qc.invalidateQueries({ queryKey: ['adspend-mappings'] });
  };
  const deleteMapping = async (id) => {
    await base44.entities.AdSpendMapping.delete(id);
    qc.invalidateQueries({ queryKey: ['adspend-mappings'] });
  };

  return (
    <div className="space-y-5">
      {/* Meta app credentials */}
      <div className="bg-card border border-border rounded-[12px] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><KeyRound className="w-5 h-5 text-primary" /></div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-foreground">Meta App credentials</div>
              {(!metaApp?.configured || credsOpen) && <div className="text-[12px] text-muted-foreground mt-0.5">Paste your Meta app's App ID and Secret so Facebook Login can start.</div>}
              {metaApp?.configured
                ? <div className="text-[11px] status-sold inline-flex items-center gap-1 mt-1.5 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Configured{metaApp.source === 'env' ? ' via environment' : ''} · App ID {metaApp.app_id} · secret ****{metaApp.secret_last4}</div>
                : <div className="text-[11px] status-error inline-flex items-center gap-1 mt-1.5 font-medium"><XCircle className="w-3.5 h-3.5" /> Not configured yet. Required before connecting.</div>}
            </div>
          </div>
          {metaApp?.configured && !credsOpen && (
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setCredsOpen(true)}>Edit</Button>
          )}
        </div>

        {(!metaApp?.configured || credsOpen) && (
        <div className="mt-3 space-y-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">Redirect URL to whitelist in the Meta app</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input readOnly value={redirectUri} onFocus={e => e.target.select()} className="bg-background font-mono text-[11px]" />
              <Button size="sm" variant="outline" onClick={() => { try { navigator.clipboard.writeText(redirectUri); toast.success('Copied'); } catch { /* ignore */ } }}>Copy</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">App ID</Label>
              <Input value={appIdInput} onChange={e => setAppIdInput(e.target.value)} placeholder="Meta App ID" className="mt-1 bg-background text-[13px]" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">App Secret</Label>
              <Input value={appSecretInput} onChange={e => setAppSecretInput(e.target.value)} type="password" placeholder={metaApp?.configured ? 'Leave blank to keep current' : 'Meta App Secret'} className="mt-1 bg-background font-mono text-[12px]" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={saveCreds} disabled={savingCreds}>{savingCreds ? 'Saving…' : 'Save credentials'}</Button>
            {metaApp?.configured && <Button size="sm" variant="ghost" onClick={() => { setCredsOpen(false); setAppSecretInput(''); }}>Done</Button>}
          </div>
        </div>
        )}
      </div>

      {/* Connections card */}
      <div className="bg-card border border-border rounded-[12px] p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Facebook className="w-5 h-5 text-primary" /></div>
            <div>
              <div className="text-[14px] font-semibold text-foreground">Meta (Facebook) Ads</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Connect Meta, then link each ad account to the supplier whose spend it represents. Costs import daily and drive true CPL per supplier.</div>
              {connected && (
                <div className="text-[11px] status-sold inline-flex items-center gap-1 mt-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {activeConns} active connection{activeConns === 1 ? '' : 's'} · {suppliersLinked} supplier{suppliersLinked === 1 ? '' : 's'} linked
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {accounts.length > 0 && <Button size="sm" variant="outline" className="gap-1.5" onClick={runSync} disabled={syncing}><RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync Now</Button>}
            <Button size="sm" className="gap-1.5" onClick={() => setWizardOpen(true)}><Plus className="w-3.5 h-3.5" /> Connect and link</Button>
          </div>
        </div>

        {connected && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
            {[
              { label: 'Connections', n: connections.length },
              { label: 'Linked Accounts', n: accounts.length },
              { label: 'Suppliers', n: suppliersLinked },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-[18px] font-bold text-foreground font-mono">{s.n}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Connections */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-[13px] font-semibold text-foreground mb-2">Connections</div>
          {connections.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-2">No connections yet. Use Connect and link to add a Meta connection through Facebook Login or a system-user token.</p>
          ) : (
            <div className="space-y-2">
              {connections.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-foreground font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {c.auth_type === 'oauth' ? 'Facebook Login' : 'System-user token'} · ****{c.token_last4}
                      {c.connected_account_name ? ` · ${c.connected_account_name}` : ''}
                    </div>
                    {c.expiry_warning && <div className="text-[11px] status-error inline-flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> {c.expiry_warning}</div>}
                    {c.last_error && <div className="text-[11px] status-error mt-0.5 truncate" title={c.last_error}>{c.last_error}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.action_required
                      ? <span className="text-[11px] status-error inline-flex items-center gap-1 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Action required</span>
                      : c.status === 'active'
                        ? <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
                        : <span className="text-[11px] status-error inline-flex items-center gap-1 font-medium"><XCircle className="w-3.5 h-3.5" /> {c.status}</span>}
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => testConnection(c.id)} disabled={testingConn === c.id}><ShieldCheck className="w-3 h-3" /> Test</Button>
                    {c.action_required && <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setWizardOpen(true)}><PlugZap className="w-3 h-3" /> Reconnect</Button>}
                    <button onClick={() => disconnect(c)} disabled={disconnectingId === c.id} className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50" title="Disconnect"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ad Accounts (all reachable) */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <div className="text-[13px] font-semibold text-foreground">Ad Accounts{adAccounts.length ? ` (${adAccounts.length})` : ''}</div>
            {adAccounts.length > 0 && <div className="text-[11px] text-muted-foreground">Map campaigns in an account to a supplier to import its spend.</div>}
          </div>
          {loadingAccounts ? (
            <p className="text-[12px] text-muted-foreground py-2 inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading ad accounts…</p>
          ) : adAccounts.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-2">No ad accounts reachable yet. Add a connection, then map campaigns to suppliers.</p>
          ) : (
            <div className="space-y-2">
              {adAccounts.map(a => (
                <div key={a.ad_account_id} className="p-3 rounded-lg border border-border bg-background">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Facebook className="w-4 h-4 text-primary" /></div>
                      <div className="min-w-0">
                        <div className="text-[13px] text-foreground font-medium truncate">{a.ad_account_name}</div>
                        <div className="text-[11px] text-muted-foreground">{a.last_success_at ? `Synced ${fmtWhen(a.last_success_at)}` : 'Synced Never'}{a.currency ? ` · ${a.currency}` : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.action_required && <span className="text-[10px] status-error inline-flex items-center gap-1 font-medium"><AlertTriangle className="w-3 h-3" /> Action required</span>}
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Link2 className="w-3 h-3" /> {a.map_count} Map</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-muted-foreground hover:text-foreground p-1"><MoreVertical className="w-4 h-4" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover border-border">
                          <DropdownMenuItem onClick={() => setMapForAccount(a)}><Link2 className="w-3.5 h-3.5 mr-2" /> Map campaigns</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setWizardOpen(true)}><PlugZap className="w-3.5 h-3.5 mr-2" /> Reconnect</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => disconnectAccount(a)} className="text-destructive focus:text-destructive"><Trash2 className="w-3.5 h-3.5 mr-2" /> Disconnect</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {a.map_count > 0 && a.suppliers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {a.suppliers.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
                    </div>
                  )}
                  {a.last_sync_error && <div className="text-[11px] status-error inline-flex items-center gap-1 mt-1.5"><XCircle className="w-3 h-3" /> {a.last_sync_error}</div>}
                </div>
              ))}
            </div>
          )}
          {hiddenAccounts.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowHidden(v => !v)} className="text-[11px] text-muted-foreground hover:text-foreground">{showHidden ? 'Hide disconnected' : `Show ${hiddenAccounts.length} disconnected`}</button>
              {showHidden && (
                <div className="space-y-1.5 mt-1.5">
                  {hiddenAccounts.map(a => (
                    <div key={a.ad_account_id} className="flex items-center justify-between p-2 rounded-lg border border-dashed border-border bg-background/50">
                      <span className="text-[12px] text-muted-foreground truncate">{a.ad_account_name}{a.currency ? ` · ${a.currency}` : ''}</span>
                      <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => restoreAccount(a)}>Restore</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Campaign tagging (vertical / brand only) */}
      {connected && (
        <div className="bg-card border border-border rounded-[12px] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Campaign Tags</div>
              <div className="text-[12px] text-muted-foreground">Optionally tag an ad account or campaign with a vertical and brand. Supplier attribution comes from the account links above, not from tags.</div>
            </div>
            <Button size="sm" className="gap-1.5" onClick={openMap}><Plus className="w-3.5 h-3.5" /> Add tag</Button>
          </div>
          {mappings.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-4 text-center">No tags yet.</p>
          ) : (
            <div className="space-y-2">
              {mappings.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                  <div className="min-w-0">
                    <div className="text-[13px] text-foreground truncate">{m.ad_account_name || m.ad_account_id} {m.meta_campaign_name && `· ${m.meta_campaign_name}`}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <Badge variant="outline" className="text-[10px]">{m.match_level}</Badge>
                      {m.vertical && <Badge variant="outline" className="text-[10px]">{m.vertical}</Badge>}
                      {m.brand && <Badge variant="outline" className="text-[10px]">{m.brand}</Badge>}
                      {m.supplier_name && <Badge variant="outline" className="text-[10px]">{m.supplier_name}</Badge>}
                    </div>
                  </div>
                  <button onClick={() => deleteMapping(m.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tag dialog */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader><DialogTitle>Tag ad account or campaign</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div>
                <Label className="text-[12px]">Ad Account *</Label>
                <Select value={form.ad_account_id} onValueChange={v => {
                  const a = accounts.find(x => x.ad_account_id === v);
                  setForm(p => ({ ...p, ad_account_id: v, ad_account_name: a?.ad_account_name || '' }));
                }}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select ad account" /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.ad_account_id}>{a.ad_account_name || a.ad_account_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12px]">Match Level</Label>
                <Select value={form.match_level} onValueChange={v => setForm(p => ({ ...p, match_level: v }))}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ad_account">Ad Account</SelectItem>
                    <SelectItem value="campaign">Campaign</SelectItem>
                    <SelectItem value="ad_set">Ad Set</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.match_level !== 'ad_account' && (
                <div>
                  <Label className="text-[12px]">Meta Campaign ID</Label>
                  <Input value={form.meta_campaign_id} onChange={e => setForm(p => ({ ...p, meta_campaign_id: e.target.value }))} placeholder="Campaign / ad set id" className="mt-1 bg-background font-mono text-[12px]" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[12px]">Vertical</Label>
                  <Select value={form.vertical} onValueChange={v => setForm(p => ({ ...p, vertical: v }))}>
                    <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>{verticals.map(v => <SelectItem key={v.id} value={v.code}>{v.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Brand</Label>
                  <Select value={form.brand} onValueChange={v => setForm(p => ({ ...p, brand: v }))}>
                    <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>{brands.map(b => <SelectItem key={b.id} value={b.brand_code}>{b.brand_code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMapOpen(false)}>Cancel</Button>
            <Button onClick={saveMapping}>Save tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MetaConnectWizard open={wizardOpen} onOpenChange={setWizardOpen} onLinked={() => refetch()} />
      <MetaSyncHistoryDialog
        open={!!historyFor}
        onOpenChange={(o) => !o && setHistoryFor(null)}
        supplierAdAccountId={historyFor?.id || null}
        title={`Sync history · ${historyFor?.ad_account_name || historyFor?.ad_account_id || ''}`}
      />
      <MetaEditMappingDialog
        open={!!editFor}
        onOpenChange={(o) => !o && setEditFor(null)}
        account={editFor}
        onSaved={() => refetch()}
      />
      <MetaMapCampaignsDialog
        open={!!mapForAccount}
        onOpenChange={(o) => !o && setMapForAccount(null)}
        account={mapForAccount}
        onSaved={() => { refetchOverview(); refetch(); }}
      />
    </div>
  );
}
