import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { metaAdAccountsOverview } from '@/functions/metaAdAccountsOverview';
import { metaConnectionStatus } from '@/functions/metaConnectionStatus';
import { syncMetaSpend } from '@/functions/syncMetaSpend';
import { disconnectMetaConnection } from '@/functions/disconnectMetaConnection';
import { manageSupplierAdAccount } from '@/functions/manageSupplierAdAccount';
import MetaMapCampaignsDialog from '@/components/settings/MetaMapCampaignsDialog';
import MetaSyncHistoryDialog from '@/components/settings/MetaSyncHistoryDialog';
import MetaConnectDialog from '@/components/settings/MetaConnectDialog';
import MetaLeadFormsTab from '@/components/settings/MetaLeadFormsTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Facebook, RefreshCw, Plus, Link2, MoreVertical, AlertTriangle, Clock, Loader2, History, Plug, Search } from 'lucide-react';
import { toast } from 'sonner';

const fmtWhen = (iso) => {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtInterval = (mins) => {
  if (!mins || mins <= 0) return 'manual';
  if (mins % 1440 === 0) return `every ${mins / 1440} day${mins / 1440 === 1 ? '' : 's'}`;
  if (mins % 60 === 0) return `every ${mins / 60} hour${mins / 60 === 1 ? '' : 's'}`;
  return `every ${mins} min`;
};

// LeadDistro-style Manage view for the Meta connector. Lists connected ad
// accounts with their campaign-mapping count, Sync All, Add Ad Account, an
// auto-sync status row, per-account actions (Map campaigns, Reconnect, Disconnect
// account) and a whole-connection Disconnect. Binds to metaAdAccountsOverview
// (account list + map counts) and metaConnectionStatus (connections + sync).
export default function MetaManageDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('accounts');
  const [syncing, setSyncing] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectLeadForms, setConnectLeadForms] = useState(false);
  const [mapForAccount, setMapForAccount] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [acctSearch, setAcctSearch] = useState('');

  const { data: overview, isLoading: loadingAccts } = useQuery({
    queryKey: ['meta-adaccounts-overview'],
    queryFn: async () => (await metaAdAccountsOverview({})).data,
    enabled: open,
  });
  const { data: status } = useQuery({
    queryKey: ['meta-connection-status'],
    queryFn: async () => (await metaConnectionStatus({})).data,
    enabled: open,
  });

  const accounts = overview?.accounts || [];
  const connections = status?.connections || overview?.connections || [];
  const sync = status?.sync || {};
  const regIdByAccount = useMemo(() => {
    const m = {};
    for (const a of status?.accounts || []) if (a.ad_account_id) m[a.ad_account_id] = a.id;
    return m;
  }, [status]);
  const unmapped = accounts.filter(a => !(a.map_count > 0)).length;
  const filteredAccounts = accounts.filter(a => !acctSearch || `${a.ad_account_name || ''} ${a.ad_account_id || ''}`.toLowerCase().includes(acctSearch.toLowerCase()));

  const runSyncAll = async () => {
    setSyncing(true);
    try {
      const d = (await syncMetaSpend({})).data || {};
      if (d.success) toast.success(`Synced ${d.accounts_synced || 0} account${d.accounts_synced === 1 ? '' : 's'}, ${d.rows_synced || 0} spend rows`);
      else toast.error(d.error || 'Sync failed');
      qc.invalidateQueries({ queryKey: ['meta-adaccounts-overview'] });
      qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Sync failed'); }
    setSyncing(false);
  };

  const disconnectAccount = async (a) => {
    const id = regIdByAccount[a.ad_account_id];
    if (!id) { toast.error('This account is not registered.'); return; }
    if (!window.confirm(`Disconnect ${a.ad_account_name}? Historical spend is kept; it stops syncing.`)) return;
    setBusyId(a.ad_account_id);
    try {
      const d = (await manageSupplierAdAccount({ id, action: 'unlink' })).data || {};
      if (d.success !== false) toast.success('Ad account disconnected');
      else toast.error(d.error || 'Could not disconnect');
      qc.invalidateQueries({ queryKey: ['meta-adaccounts-overview'] });
      qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not disconnect'); }
    setBusyId('');
  };

  const disconnectConnection = async (c) => {
    if (!window.confirm(`Disconnect "${c.name}" entirely? This removes all of its ad accounts from syncing. Historical spend is kept.`)) return;
    setBusyId(c.id);
    try {
      const d = (await disconnectMetaConnection({ connection_id: c.id })).data || {};
      if (d.success) toast.success('Connection disconnected');
      else toast.error(d.error || 'Could not disconnect');
      qc.invalidateQueries({ queryKey: ['meta-adaccounts-overview'] });
      qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not disconnect'); }
    setBusyId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[680px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Facebook className="w-5 h-5 text-primary" /></div>
            <div>
              <DialogTitle className="text-foreground">Meta</DialogTitle>
              <DialogDescription className="text-muted-foreground">Manage ad accounts, spend sync, and campaign mappings.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="px-6 border-b border-border">
          <div className="flex gap-1">
            {[['accounts', 'Ad Accounts'], ['leadforms', 'Lead Forms']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 max-h-[62vh] overflow-y-auto space-y-4">
          {tab === 'leadforms' && (
            <MetaLeadFormsTab connections={connections} onReconnect={() => { setConnectLeadForms(true); setConnectOpen(true); }} />
          )}

          {tab === 'accounts' && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] text-muted-foreground">{overview?.total ?? accounts.length} connected account{(overview?.total ?? accounts.length) === 1 ? '' : 's'}</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={runSyncAll} disabled={syncing}>
                    {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync All
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:opacity-90" onClick={() => setConnectOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> Add Ad Account
                  </Button>
                </div>
              </div>

              {unmapped > 0 && (
                <div className="rounded-lg border border-border bg-card p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-[12px] text-muted-foreground">
                    <span className="text-foreground font-medium">{unmapped} ad account{unmapped === 1 ? '' : 's'} have no campaign mappings.</span> Map campaigns to a campaign and supplier so their spend shows in Reports.
                  </div>
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input value={acctSearch} onChange={e => setAcctSearch(e.target.value)} placeholder="Search ad accounts" className="pl-8 bg-background h-9" />
              </div>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {loadingAccts ? (
                  <div className="p-6 text-center text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading ad accounts…</div>
                ) : !accounts.length ? (
                  <div className="p-8 text-center text-[13px] text-muted-foreground">No ad accounts connected yet. Use Add Ad Account to connect some.</div>
                ) : !filteredAccounts.length ? (
                  <div className="p-6 text-center text-[13px] text-muted-foreground">No ad accounts match your search.</div>
                ) : filteredAccounts.map((a) => {
                  const mapped = a.map_count > 0;
                  const suppliers = Array.isArray(a.map_suppliers) ? a.map_suppliers.filter(Boolean) : [];
                  return (
                    <div key={a.ad_account_id} className="border-b border-border last:border-b-0 px-3 py-2.5 hover:bg-accent">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Facebook className="w-4 h-4 text-primary" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-foreground truncate">{a.ad_account_name}</div>
                          <div className="text-[11px] text-muted-foreground">Synced {fmtWhen(a.last_synced_at)}{a.currency ? ` · ${a.currency}` : ''}</div>
                        </div>
                        <button onClick={() => setMapForAccount({ ...a, registry_id: regIdByAccount[a.ad_account_id] })} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground shrink-0">
                          <Link2 className="w-3.5 h-3.5" /> {a.map_count || 0} Map
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1.5 shrink-0" disabled={busyId === a.ad_account_id}>
                              {busyId === a.ad_account_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover border-border">
                            <DropdownMenuItem onClick={() => setConnectOpen(true)}>Reconnect</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setMapForAccount({ ...a, registry_id: regIdByAccount[a.ad_account_id] })}>Map campaigns</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setHistoryFor(a)}>Sync history</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => disconnectAccount(a)}>Disconnect account</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {mapped ? (
                        suppliers.length > 0 && (
                          <div className="mt-1.5 ml-11 flex flex-wrap gap-1.5">
                            {suppliers.slice(0, 4).map((s, i) => (
                              <span key={i} className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">{s}</span>
                            ))}
                          </div>
                        )
                      ) : (
                        <div className="mt-1 ml-11 text-[11px] text-primary">Not mapped. Spend won't show in Reports until campaigns are mapped.</div>
                      )}
                      {a.last_sync_error ? (
                        <div className="mt-1 ml-11 text-[11px] text-destructive">Sync error: {a.last_sync_error}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Auto-sync status */}
              <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Clock className="w-4 h-4 text-primary" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground">Auto-Sync: {fmtInterval(sync.interval_minutes)}</span>
                    <span className={`inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium ${sync.enabled ? 'text-primary' : 'text-muted-foreground'}`}>{sync.enabled ? 'Active' : 'Paused'}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">Next sync {fmtWhen(sync.next_scheduled_sync)}</div>
                </div>
              </div>

              {/* Connections (whole-connection Reconnect / Disconnect) */}
              {connections.length > 0 && (
                <div>
                  <div className="text-[12px] font-medium text-muted-foreground mb-1.5">Connections</div>
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    {connections.map((c) => (
                      <div key={c.id} className="border-b border-border last:border-b-0 px-3 py-2.5 flex items-center gap-3 hover:bg-accent">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Facebook className="w-4 h-4 text-primary" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-foreground truncate">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground capitalize">{c.status || 'active'}{c.auth_type ? ` · ${c.auth_type === 'system_user' ? 'system user' : 'oauth'}` : ''}</div>
                        </div>
                        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setConnectOpen(true)}><Plug className="w-3.5 h-3.5" /> Reconnect</Button>
                        <Button size="sm" variant="outline" className="gap-1.5 shrink-0 text-destructive" onClick={() => disconnectConnection(c)} disabled={busyId === c.id}>
                          {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Disconnect
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <MetaConnectDialog open={connectOpen} onOpenChange={(o) => { setConnectOpen(o); if (!o) setConnectLeadForms(false); }} includeLeadForms={connectLeadForms} onConnected={() => { qc.invalidateQueries({ queryKey: ['meta-adaccounts-overview'] }); }} />
        <MetaMapCampaignsDialog open={!!mapForAccount} onOpenChange={(o) => !o && setMapForAccount(null)} account={mapForAccount} onSaved={() => qc.invalidateQueries({ queryKey: ['meta-adaccounts-overview'] })} />
        <MetaSyncHistoryDialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)} supplierAdAccountId={historyFor ? regIdByAccount[historyFor.ad_account_id] : null} title={historyFor ? `Sync history: ${historyFor.ad_account_name}` : 'Sync history'} />
      </DialogContent>
    </Dialog>
  );
}
