import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DownloadCloud, Play, RefreshCw, FlaskConical, Trash2, Pencil } from 'lucide-react';
import ApiKeyField, { maskKey } from '@/components/settings/ApiKeyField';
import { webhookTypeClass } from '@/lib/tagColors';
import { format } from 'date-fns';
import { toast } from 'sonner';
import SupplierRulesEditor from '@/components/settings/SupplierRulesEditor';
import { pullCallLogs } from '@/functions/pullCallLogs';

// Scheduled pulls: the outbound half of the Webhooks surface. An inbound
// webhook waits for a platform to post; a pull goes and fetches on a timer.
// Ringba is the first provider, because its call logs endpoint has no webhook
// at all: the only way to see a call is to ask for it.

const PROVIDERS = [
  { value: 'ringba', label: 'Ringba call logs' },
  { value: 'http', label: 'Custom HTTP request' },
];

const INTERVALS = [
  { value: '15m', label: 'Every 15 minutes' },
  { value: '1h', label: 'Hourly' },
  { value: '6h', label: 'Every 6 hours' },
  { value: 'daily', label: 'Daily' },
];

const METHODS = [{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }];

// Fields a Ringba call log record carries, offered to the rules editor so an
// operator picks rather than guesses the spelling.
const RINGBA_FIELDS = [
  { value: 'publisherName', label: 'publisherName' },
  { value: 'publisherId', label: 'publisherId' },
  { value: 'publisherSubId', label: 'publisherSubId' },
  { value: 'campaignName', label: 'campaignName' },
  { value: 'targetName', label: 'targetName' },
  { value: 'buyer', label: 'buyer' },
  { value: 'numberPoolName', label: 'numberPoolName' },
  { value: 'inboundPhoneNumber', label: 'inboundPhoneNumber' },
];

const DEFAULT_FORM = {
  name: '', provider: 'ringba', target: 'call_logs', enabled: false,
  account_id: '', api_key: '', credential_env: '', method: 'GET', url: '',
  auth_header: 'Token {{secret}}', body_template: '', records_path: '',
  page_size: 1000, field_map: '', supplier_rules: '[]', dedupe_field: '',
  backfill_days: 7, sync_interval: '1h', notes: '',
};

// Renders the outbound-GET rows for the shared Webhooks table, plus its own
// dialogs. Radix portals the dialogs to the body, so nothing invalid lands
// inside the tbody this is mounted in. The parent owns the Create button and
// calls openCreate() through the ref once the operator has chosen the type.
const SettingsPullSources = forwardRef(function SettingsPullSources(_props, ref) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const { data: sources = [] } = useQuery({
    queryKey: ['pull-sources'],
    queryFn: async () => (await base44.entities.PullSource.list('-created_date', 200)) || [],
  });

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setTestResult(null);
    setOpen(true);
  };

  useImperativeHandle(ref, () => ({ openCreate }));

  const openEdit = (s) => {
    setForm({ ...DEFAULT_FORM, ...s, supplier_rules: s.supplier_rules || '[]' });
    setEditingId(s.id);
    setTestResult(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Give the pull a name'); return; }
    if (form.provider === 'ringba' && !form.account_id.trim()) {
      toast.error('Ringba needs the account ID the call logs belong to'); return;
    }
    if (form.provider === 'http' && !/^https:\/\//i.test(form.url || '')) {
      toast.error('A custom request needs an absolute https URL'); return;
    }
    const payload = {
      name: form.name.trim(),
      provider: form.provider,
      target: 'call_logs',
      enabled: !!form.enabled,
      account_id: form.account_id.trim(),
      api_key: (form.api_key || '').trim(),
      credential_env: (form.credential_env || '').trim(),
      method: form.method,
      url: (form.url || '').trim(),
      auth_header: form.auth_header,
      body_template: form.body_template,
      records_path: (form.records_path || '').trim(),
      page_size: Number(form.page_size) || 1000,
      backfill_days: Number(form.backfill_days) || 0,
      field_map: form.field_map,
      supplier_rules: form.supplier_rules,
      dedupe_field: (form.dedupe_field || '').trim(),
      sync_interval: form.sync_interval,
      notes: form.notes,
    };
    try {
      if (editingId) await base44.entities.PullSource.update(editingId, payload);
      else await base44.entities.PullSource.create(payload);
      toast.success(editingId ? 'Pull updated' : 'Pull created, disabled until you enable it');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['pull-sources'] });
    } catch (e) {
      toast.error(e?.message || 'Could not save the pull');
    }
  };

  const runTest = async () => {
    if (!editingId) { toast.error('Save the pull first, then test it'); return; }
    setBusyId(editingId);
    setTestResult(null);
    try {
      const res = await pullCallLogs({ test: true, source_id: editingId });
      const data = res?.data ?? res;
      if (data?.status !== 'ok') throw new Error(data?.error || 'Test failed');
      setTestResult(data);
      toast.success(`Fetched ${data.fetched} records`);
    } catch (e) {
      setTestResult({ status: 'error', error: e?.message || 'Test failed' });
      toast.error(e?.message || 'Test failed');
    }
    setBusyId(null);
  };

  // reattribute re-applies the CURRENT supplier rules to calls already stored.
  // Without it a re-run leaves existing attribution alone, which is right in
  // steady state but wrong while an operator is still working the rules out.
  const runNow = async (s, { reattribute = false } = {}) => {
    setBusyId(s.id);
    try {
      const res = await pullCallLogs({ source_id: s.id, reattribute });
      const data = res?.data ?? res;
      if (data?.status !== 'ok') throw new Error(data?.error || 'Pull failed');
      const c = data.counts || {};
      toast.success(
        `Fetched ${c.fetched || 0}, created ${c.created || 0}, updated ${c.updated || 0}`
        + (c.unattributed ? `, ${c.unattributed} unattributed` : ''),
      );
      qc.invalidateQueries({ queryKey: ['pull-sources'] });
      qc.invalidateQueries({ queryKey: ['call-records-all'] });
    } catch (e) {
      toast.error(e?.message || 'Pull failed');
      qc.invalidateQueries({ queryKey: ['pull-sources'] });
    }
    setBusyId(null);
  };

  const toggle = async (s) => {
    await base44.entities.PullSource.update(s.id, { enabled: !s.enabled });
    qc.invalidateQueries({ queryKey: ['pull-sources'] });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.PullSource.delete(deleteTarget.id);
    setDeleteTarget(null);
    toast.success('Pull deleted');
    qc.invalidateQueries({ queryKey: ['pull-sources'] });
  };

  const isRingba = form.provider === 'ringba';

  return (
    <>
      {/* Rows for the one Webhooks table. A scheduled fetch is an INCOMING
          webhook: the data lands in the system either way. The only difference
          from an incoming POST is whose clock it runs on. */}
      {sources.map((s) => (
        <tr key={s.id} className="hover:bg-accent/50 transition-colors">
          <td className="px-4 py-3 text-foreground whitespace-nowrap">{s.name}</td>
          <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${webhookTypeClass('incoming_get')}`}>
              <DownloadCloud className="w-3 h-3" /> Incoming GET
            </span>
          </td>
          <td className="px-4 py-3 text-muted-foreground text-[12px]">
            Calls · {PROVIDERS.find((p) => p.value === s.provider)?.label || s.provider}
          </td>
          <td className="px-4 py-3 text-muted-foreground font-mono text-[12px]">{s.sync_interval || '1h'}</td>
          <td className="px-4 py-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
            {maskKey(s.api_key) || (s.credential_env ? 'env secret' : '-')}
          </td>
          <td className="px-4 py-3 text-muted-foreground text-[12px]">-</td>
          <td className="px-4 py-3">
            <Switch checked={!!s.enabled} onCheckedChange={() => toggle(s)} />
          </td>
          <td className="px-4 py-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
            {s.last_synced_at ? format(new Date(s.last_synced_at), 'MMM dd HH:mm') : '-'}
          </td>
          <td className="px-4 py-3 text-[12px] max-w-[200px] truncate">
            {s.last_error
              ? <span className="text-destructive">{s.last_error}</span>
              : <span className="text-muted-foreground">{s.last_sync_status || '-'}</span>}
          </td>
          <td className="px-4 py-3 text-muted-foreground text-[12px]">{s.error_count || 0}</td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="gap-1.5 h-8" disabled={busyId === s.id} onClick={() => runNow(s)}>
                <Play className="w-3.5 h-3.5" /> Run
              </Button>
              <Button
                size="sm" variant="ghost" className="gap-1.5 h-8"
                disabled={busyId === s.id}
                onClick={() => runNow(s, { reattribute: true })}
                title="Re-run and re-apply the supplier rules to calls already stored"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-attribute
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} aria-label="Edit pull">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(s)} aria-label="Delete pull">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </td>
        </tr>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[820px] max-h-[85vh] overflow-y-auto bg-popover border-border">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Pull' : 'Create Pull'}</DialogTitle>
            <DialogDescription>
              Fetches call records on a schedule and writes them to Calls.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Ringba Calls" className="bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <SearchableSelect value={form.provider} onValueChange={(v) => set({ provider: v })} options={PROVIDERS} className="bg-background" />
              </div>
            </div>

            {isRingba ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ringba account ID</Label>
                  <Input value={form.account_id} onChange={(e) => set({ account_id: e.target.value })} placeholder="RA..." className="bg-background font-mono text-[12px]" />
                </div>
                <ApiKeyField value={form.api_key} onChange={(v) => set({ api_key: v })} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <SearchableSelect value={form.method} onValueChange={(v) => set({ method: v })} options={METHODS} className="bg-background" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>URL</Label>
                    <Input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://..." className="bg-background font-mono text-[12px]" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ApiKeyField value={form.api_key} onChange={(v) => set({ api_key: v })} />
                  <div className="space-y-1.5">
                    <Label>Authorization header</Label>
                    <Input value={form.auth_header} onChange={(e) => set({ auth_header: e.target.value })} placeholder="Bearer {{secret}}" className="bg-background font-mono text-[12px]" />
                  </div>
                </div>
                {form.method === 'POST' && (
                  <div className="space-y-1.5">
                    <Label>Request body</Label>
                    <textarea
                      value={form.body_template}
                      onChange={(e) => set({ body_template: e.target.value })}
                      rows={3}
                      placeholder={'{"reportStart":"{{start}}","reportEnd":"{{end}}"}'}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] font-mono text-foreground"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Path to the record array</Label>
                  <Input value={form.records_path} onChange={(e) => set({ records_path: e.target.value })} placeholder="report.records, or blank if the response is already an array" className="bg-background font-mono text-[12px]" />
                </div>
              </>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Run every</Label>
                <SearchableSelect value={form.sync_interval} onValueChange={(v) => set({ sync_interval: v })} options={INTERVALS} className="bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label>Page size</Label>
                <Input type="number" value={form.page_size} onChange={(e) => set({ page_size: e.target.value })} className="bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label>First run backfill (days)</Label>
                <Input type="number" value={form.backfill_days} onChange={(e) => set({ backfill_days: e.target.value })} className="bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label>De-dupe field</Label>
                <Input value={form.dedupe_field} onChange={(e) => set({ dedupe_field: e.target.value })} placeholder="inboundCallId" className="bg-background font-mono text-[12px]" />
              </div>
            </div>

            <SupplierRulesEditor
              value={form.supplier_rules}
              onChange={(v) => set({ supplier_rules: v })}
              fieldOptions={isRingba ? RINGBA_FIELDS : []}
              description="Ringba reports a publisher like CHECK-A-CASE-MVA and a publisherSubId like CAC-MVA. Neither is our sid, so translate them into a supplier source here. First matching rule wins."
            />

            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
              <div>
                <div className="text-[13px] text-foreground">Enabled</div>
                <div className="text-[12px] text-muted-foreground">The scheduler only runs enabled pulls. Test first.</div>
              </div>
              <Switch checked={!!form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
            </div>

            {testResult && (
              <div className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                {testResult.status === 'error' ? (
                  <div className="text-[12px] text-destructive">{testResult.error}</div>
                ) : (
                  <>
                    <div className="text-[12px] text-foreground">
                      Fetched {testResult.fetched} records, {testResult.rule_count} rule{testResult.rule_count === 1 ? '' : 's'} applied. Nothing was written.
                    </div>
                    {(testResult.sample || []).map((s, i) => (
                      <div key={i} className="text-[11px] font-mono text-muted-foreground truncate">
                        {s.mapped?.mobile || 'no number'} - sid {s.resolved?.sid || 'none'} - {s.resolved?.matched ? 'matched' : 'unattributed'}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={runTest} disabled={!editingId || busyId === editingId} className="gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Test
            </Button>
            <Button onClick={save}>{editingId ? 'Save' : 'Create Pull'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the pull and its schedule. Calls it already wrote are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

export default SettingsPullSources;
