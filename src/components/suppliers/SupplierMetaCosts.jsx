import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { metaConnectionStatus } from '@/functions/metaConnectionStatus';
import { syncMetaSpend } from '@/functions/syncMetaSpend';
import { testMetaConnection } from '@/functions/testMetaConnection';
import { manageSupplierAdAccount } from '@/functions/manageSupplierAdAccount';
import MetaConnectWizard from '@/components/settings/MetaConnectWizard';
import MetaSyncHistoryDialog from '@/components/settings/MetaSyncHistoryDialog';
import MetaEditMappingDialog from '@/components/settings/MetaEditMappingDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Facebook, RefreshCw, Plus, CheckCircle2, XCircle, Trash2, Clock, Pencil, ShieldCheck, AlertTriangle, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

const fmtWhen = (iso) => {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const money = (n, currency) => `${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;

// Supplier-level Meta cost panel. Shows connection health, every mapped ad
// account with its full details, and the connector actions. All writes go
// through operator-gated functions so non-admin operators can manage mappings.
export default function SupplierMetaCosts({ supplier }) {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [historyFor, setHistoryFor] = useState(null); // account row or 'supplier'
  const [editFor, setEditFor] = useState(null); // account row
  const [testingConn, setTestingConn] = useState('');

  const { data: status, refetch } = useQuery({
    queryKey: ['meta-connection-status', supplier?.id],
    queryFn: async () => (await metaConnectionStatus({ supplier_id: supplier.id })).data,
    enabled: !!supplier?.id,
  });

  const accounts = status?.accounts || [];
  const connections = status?.connections || [];
  const connById = Object.fromEntries(connections.map(c => [c.id, c]));
  const syncInfo = status?.sync || {};
  const lastSuccess = accounts.reduce((max, a) => (a.last_success_at && (!max || a.last_success_at > max) ? a.last_success_at : max), null);
  const anyError = accounts.some(a => a.last_sync_error);
  const currencies = Array.from(new Set(accounts.map(a => a.currency).filter(Boolean)));
  const period30 = accounts.reduce((s, a) => s + (a.period_spend_30d || 0), 0);
  // Connections in use by this supplier's accounts that need reconnecting.
  const actionConns = connections.filter(c => c.action_required && accounts.some(a => a.connection_id === c.id));

  const runSync = async (payload, label) => {
    setSyncing(true);
    try {
      const d = (await syncMetaSpend(payload)).data || {};
      if (d.success) toast.success(`Synced ${d.accounts_synced || 0} account${d.accounts_synced === 1 ? '' : 's'}, ${d.rows_synced || 0} daily rows${label ? ` (${label})` : ''}`);
      else toast.error(d.error || 'Sync failed');
      refetch();
      qc.invalidateQueries({ queryKey: ['adspend'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Sync failed'); }
    setSyncing(false);
  };

  const setEnabled = async (row, next) => {
    setBusyId(row.id);
    try { await manageSupplierAdAccount({ id: row.id, action: 'set_enabled', enabled: next }); refetch(); }
    catch { toast.error('Failed to update'); }
    setBusyId('');
  };

  const unlink = async (row) => {
    setBusyId(row.id);
    try {
      await manageSupplierAdAccount({ id: row.id, action: 'unlink' });
      toast.success('Ad account unlinked. Historical spend is kept.');
      refetch();
    } catch { toast.error('Failed to unlink'); }
    setBusyId('');
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

  return (
    <div className="bg-card border border-border rounded-[12px] p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Facebook className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="text-[14px] font-semibold text-foreground">Meta Ad Spend</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">Daily Meta advertising costs, imported automatically and attributed to {supplier?.name}.</div>
            {accounts.length > 0 && (
              anyError
                ? <div className="text-[11px] status-error inline-flex items-center gap-1 mt-1.5 font-medium"><XCircle className="w-3.5 h-3.5" /> Sync issues on {accounts.filter(a => a.last_sync_error).length} account(s)</div>
                : <div className="text-[11px] status-sold inline-flex items-center gap-1 mt-1.5 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Connected · last successful sync {fmtWhen(lastSuccess)}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setHistoryFor('supplier')}><Clock className="w-3.5 h-3.5" /> History</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => runSync({ supplier_id: supplier.id }, 'all accounts')} disabled={syncing}><RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync Now</Button>
            </>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setWizardOpen(true)}><Plus className="w-3.5 h-3.5" /> Connect ad account</Button>
        </div>
      </div>

      {/* Action required banner */}
      {actionConns.map(c => (
        <div key={c.id} className="mt-3 p-3 rounded-lg bg-status-error border border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] status-error inline-flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-4 h-4" /> Action required: connection "{c.name}" is {c.status}. Its accounts will not sync until reconnected.
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => testConnection(c.id)} disabled={testingConn === c.id}><ShieldCheck className="w-3.5 h-3.5" /> Test</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setWizardOpen(true)}><PlugZap className="w-3.5 h-3.5" /> Reconnect</Button>
          </div>
        </div>
      ))}

      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
          {[
            { label: 'Linked Accounts', v: accounts.length },
            { label: `Last 30 Days${currencies.length === 1 ? ` (${currencies[0]})` : ''}`, v: currencies.length > 1 ? 'Mixed' : money(period30) },
            { label: 'Next Sync', v: syncInfo.next_scheduled_sync ? fmtWhen(syncInfo.next_scheduled_sync) : 'Manual only' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[15px] font-bold text-foreground font-mono truncate">{s.v}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        {accounts.length === 0 ? (
          <p className="text-[12px] text-muted-foreground py-2">No Meta ad accounts linked yet. Connect one to import this supplier's advertising costs automatically.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map(a => {
              const conn = connById[a.connection_id];
              const actionReq = conn?.action_required;
              return (
                <div key={a.id} className="p-3 rounded-lg border border-border bg-background">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] text-foreground font-medium truncate">{a.ad_account_name || a.ad_account_id}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <Badge variant="outline" className="text-[10px] capitalize">{a.platform}</Badge>
                        <span className="text-[11px] text-muted-foreground font-mono">{a.ad_account_id}</span>
                        {a.currency && <Badge variant="outline" className="text-[10px]">{a.currency}</Badge>}
                        {a.business_name && <Badge variant="outline" className="text-[10px]">{a.business_name}{a.business_id ? ` · ${a.business_id}` : ''}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {actionReq
                        ? <span className="text-[11px] status-error inline-flex items-center gap-1 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Action required</span>
                        : conn?.status === 'active'
                          ? <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
                          : <span className="text-[11px] text-muted-foreground">{conn?.status || ''}</span>}
                      <Switch checked={a.enabled} disabled={busyId === a.id} onCheckedChange={(v) => setEnabled(a, v)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2.5 text-[11px]">
                    <div><div className="text-muted-foreground">Last success</div><div className="text-foreground">{fmtWhen(a.last_success_at)}</div></div>
                    <div><div className="text-muted-foreground">Next sync</div><div className="text-foreground">{a.next_scheduled_sync ? fmtWhen(a.next_scheduled_sync) : 'Manual'}</div></div>
                    <div><div className="text-muted-foreground">Last 30d</div><div className="text-foreground font-mono">{money(a.period_spend_30d, a.currency)}</div></div>
                    <div><div className="text-muted-foreground">Yesterday</div><div className="text-foreground font-mono">{money(a.yesterday_spend, a.currency)}</div></div>
                  </div>

                  {a.last_sync_error && (
                    <div className="text-[11px] status-error inline-flex items-center gap-1 mt-2"><XCircle className="w-3 h-3" /> {a.last_sync_error}</div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2.5 border-t border-border">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => runSync({ ad_account_ids: [a.ad_account_id] })} disabled={syncing}><RefreshCw className="w-3 h-3" /> Sync now</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => setEditFor(a)}><Pencil className="w-3 h-3" /> Edit mapping</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => setHistoryFor(a)}><Clock className="w-3 h-3" /> History</Button>
                    {actionReq && <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => testConnection(a.connection_id)} disabled={testingConn === a.connection_id}><ShieldCheck className="w-3 h-3" /> Test</Button>}
                    <button onClick={() => unlink(a)} disabled={busyId === a.id} className="ml-auto text-muted-foreground hover:text-destructive p-1 disabled:opacity-50" title="Unlink"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MetaConnectWizard open={wizardOpen} onOpenChange={setWizardOpen} supplier={supplier} onLinked={() => refetch()} />
      <MetaSyncHistoryDialog
        open={!!historyFor}
        onOpenChange={(o) => !o && setHistoryFor(null)}
        supplierId={historyFor === 'supplier' ? supplier?.id : null}
        supplierAdAccountId={historyFor && historyFor !== 'supplier' ? historyFor.id : null}
        title={historyFor === 'supplier' ? `Sync history · ${supplier?.name}` : `Sync history · ${historyFor?.ad_account_name || ''}`}
      />
      <MetaEditMappingDialog
        open={!!editFor}
        onOpenChange={(o) => !o && setEditFor(null)}
        account={editFor}
        onSaved={() => refetch()}
      />
    </div>
  );
}
