import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowUpRight, Plus, X, Play, Trash2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  OUTBOUND_OPERATORS, PAYLOAD_SOURCES, parseFilters, parsePayloadFields,
  emptyPayloadRow, emptyOutboundFilter, buildPayload, passesFilters,
} from '@/lib/outboundPayload';
import { sendOutboundWebhook } from '@/functions/sendOutboundWebhook';
import ApiKeyField, { maskKey } from '@/components/settings/ApiKeyField';
import { webhookTypeClass } from '@/lib/tagColors';

// Outbound webhooks: we post a record out to a third party.
//
// Deliberately NOT buyer lead delivery. That runs through Lead Distribution,
// which owns caps, reservations, the wallet ledger and the routing engine. This
// is for notifications and integrations, and the dialog says so, because an
// operator who wires buyer delivery through here would be bypassing all of it.

const TRIGGERS = [
  { value: 'manual', label: 'Manual only (Test button)' },
  { value: 'lead_created', label: 'Lead created' },
  { value: 'lead_status_changed', label: 'Lead status changed' },
  { value: 'call_created', label: 'Call created' },
  { value: 'call_status_changed', label: 'Call status changed' },
];

const PAYLOAD_MODES = [
  { value: 'builder', label: 'Build field by field' },
  { value: 'template', label: 'Raw JSON template' },
];

// Fields on our records an operator can send. Custom fields are appended from
// the CustomField records so the list matches what this account actually holds.
const BASE_LEAD_FIELDS = [
  'id', 'email', 'mobile', 'first_name', 'last_name', 'state', 'zip', 'city',
  'final_status', 'revenue', 'supplier_payout', 'sid', 'ssid', 'supplier_name',
  'buyer_id', 'buyer_name', 'vertical', 'lead_type', 'created_date',
];

const DEFAULT_FORM = {
  name: '', enabled: false, trigger: 'manual', url: '', api_key: '', credential_env: '',
  auth_header: 'Bearer {{secret}}', headers: '', filters: '[]',
  payload_fields: '[]', payload_mode: 'builder', payload_template: '', notes: '',
};

const SettingsOutboundWebhooks = forwardRef(function SettingsOutboundWebhooks(_props, ref) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const { data: hooks = [] } = useQuery({
    queryKey: ['outbound-webhooks'],
    queryFn: async () => (await base44.entities.OutboundWebhook.list('-created_date', 200)) || [],
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields-outbound'],
    queryFn: async () => (await base44.entities.CustomField.list('sort_order', 300)) || [],
  });

  // Every field an operator can send, with the custom ones carrying their type
  // so the value control below can offer real choices instead of free text.
  const fieldOptions = useMemo(() => ([
    ...BASE_LEAD_FIELDS.map((f) => ({ value: f, label: f })),
    ...(customFields || [])
      .filter((cf) => cf.field_name)
      .map((cf) => ({
        value: cf.field_name,
        label: `${cf.label || cf.field_name}  ·  ${cf.field_type || 'text'}`,
      })),
  ]), [customFields]);

  const customByName = useMemo(() => {
    const m = new Map();
    for (const cf of customFields || []) if (cf.field_name) m.set(cf.field_name, cf);
    return m;
  }, [customFields]);

  // A custom field with a fixed option list gets a dropdown of those values
  // rather than a text box, so a filter cannot be written against a value the
  // field can never hold.
  const valueChoicesFor = (fieldName) => {
    const cf = customByName.get(fieldName);
    if (!cf) return null;
    let opts = cf.options;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { opts = String(cf.options).split(',').map((s) => s.trim()); }
    }
    if (!Array.isArray(opts) || opts.length === 0) return null;
    return opts
      .map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.value ?? o.label, label: o.label ?? o.value }))
      .filter((o) => o.value);
  };

  useImperativeHandle(ref, () => ({ openCreate }));

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  function openCreate() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setOpen(true);
  }

  const openEdit = (h) => {
    setForm({ ...DEFAULT_FORM, ...h, filters: h.filters || '[]', payload_fields: h.payload_fields || '[]' });
    setEditingId(h.id);
    setOpen(true);
  };

  const filters = parseFilters(form.filters);
  const rows = parsePayloadFields(form.payload_fields);

  const setFilters = (next) => set({ filters: JSON.stringify(next) });
  const setRows = (next) => set({ payload_fields: JSON.stringify(next) });

  // Live preview, built by the SAME module the dispatcher uses, against a
  // representative record. What you see here is what leaves.
  const preview = useMemo(() => {
    const sample = {
      id: 'sample', email: 'sample@example.com', first_name: 'Sample', last_name: 'Lead',
      mobile: '5555550123', state: 'TX', final_status: 'Sold', revenue: 250,
      sid: 'LGNX', supplier_name: 'Legenex',
      custom_fields: JSON.stringify(
        Object.fromEntries((customFields || []).filter((cf) => cf.field_name).map((cf) => [cf.field_name, 'sample'])),
      ),
    };
    const built = buildPayload(form, sample);
    return { ...built, passes: passesFilters(sample, form.filters) };
  }, [form, customFields]);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Give the webhook a name'); return; }
    if (!/^https:\/\//i.test(form.url || '')) { toast.error('Needs an absolute https URL'); return; }
    if (!preview.ok) { toast.error('Fix the payload before saving'); return; }
    const payload = { ...form, name: form.name.trim(), url: form.url.trim(), credential_env: (form.credential_env || '').trim() };
    delete payload.id;
    try {
      if (editingId) await base44.entities.OutboundWebhook.update(editingId, payload);
      else await base44.entities.OutboundWebhook.create(payload);
      toast.success(editingId ? 'Webhook updated' : 'Webhook created, disabled until you enable it');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['outbound-webhooks'] });
    } catch (e) {
      toast.error(e?.message || 'Could not save');
    }
  };

  const runTest = async (h) => {
    setBusyId(h.id);
    try {
      const res = await sendOutboundWebhook({ webhook_id: h.id, test: true });
      const data = res?.data ?? res;
      if (data?.status !== 'ok') throw new Error(data?.error || 'Test failed');
      toast.success(data.payload_valid
        ? `Payload valid, filters ${data.passes_filters ? 'pass' : 'block it'}. Nothing was sent.`
        : `Payload error: ${data.payload_error}`);
    } catch (e) {
      toast.error(e?.message || 'Test failed');
    }
    setBusyId(null);
  };

  const toggle = async (h) => {
    await base44.entities.OutboundWebhook.update(h.id, { enabled: !h.enabled });
    qc.invalidateQueries({ queryKey: ['outbound-webhooks'] });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.OutboundWebhook.delete(deleteTarget.id);
    setDeleteTarget(null);
    toast.success('Webhook deleted');
    qc.invalidateQueries({ queryKey: ['outbound-webhooks'] });
  };

  return (
    <>
      {hooks.map((h) => (
        <tr key={h.id} className="hover:bg-accent/50 transition-colors">
          <td className="px-4 py-3 text-foreground whitespace-nowrap">{h.name}</td>
          <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${webhookTypeClass('outbound_post')}`}>
              <ArrowUpRight className="w-3 h-3" /> Outbound POST
            </span>
          </td>
          <td className="px-4 py-3 text-muted-foreground text-[12px]">
            {TRIGGERS.find((t) => t.value === h.trigger)?.label || h.trigger}
          </td>
          <td className="px-4 py-3 text-muted-foreground text-[12px]">-</td>
          <td className="px-4 py-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">{maskKey(h.api_key) || (h.credential_env ? 'env secret' : '-')}</td>
          <td className="px-4 py-3 text-muted-foreground text-[12px]">-</td>
          <td className="px-4 py-3"><Switch checked={!!h.enabled} onCheckedChange={() => toggle(h)} /></td>
          <td className="px-4 py-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
            {h.last_sent_at ? format(new Date(h.last_sent_at), 'MMM dd HH:mm') : '-'}
          </td>
          <td className="px-4 py-3 text-[12px] max-w-[200px] truncate">
            {h.last_error
              ? <span className="text-destructive">{h.last_error}</span>
              : <span className="text-muted-foreground">{h.last_status || '-'}</span>}
          </td>
          <td className="px-4 py-3 text-muted-foreground text-[12px]">{h.error_count || 0}</td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="gap-1.5 h-8" disabled={busyId === h.id} onClick={() => runTest(h)}>
                <Play className="w-3.5 h-3.5" /> Test
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(h)} aria-label="Edit webhook">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(h)} aria-label="Delete webhook">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </td>
        </tr>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[900px] max-h-[85vh] overflow-y-auto bg-popover border-border">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Outbound Webhook' : 'Create Outbound Webhook'}</DialogTitle>
            <DialogDescription>
              Posts a record out to another platform. Not for delivering leads to buyers: that runs through Lead
              Distribution, which owns caps, reservations and the wallet ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Notify Slack on sold lead" className="bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label>Fires on</Label>
                <SearchableSelect value={form.trigger} onValueChange={(v) => set({ trigger: v })} options={TRIGGERS} className="bg-background" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Endpoint URL</Label>
              <Input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://hooks.example.com/..." className="bg-background font-mono text-[12px]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ApiKeyField value={form.api_key} onChange={(v) => set({ api_key: v })} />
              <div className="space-y-1.5">
                <Label>Authorization header</Label>
                <Input value={form.auth_header} onChange={(e) => set({ auth_header: e.target.value })} placeholder="Bearer {{secret}}" className="bg-background font-mono text-[12px]" />
                <p className="text-[11px] text-muted-foreground">
                  {'{{secret}}'} is replaced server side. Leave blank to send no Authorization header.
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-foreground">Filters</div>
                  <p className="text-[11px] text-muted-foreground">All must pass. No filters means it fires on every trigger.</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFilters([...filters, emptyOutboundFilter()])}>
                  <Plus className="w-3.5 h-3.5" /> Add filter
                </Button>
              </div>
              {filters.map((f, i) => {
                const choices = valueChoicesFor(f.field);
                const needsValue = !['is_empty', 'is_not_empty'].includes(f.operator);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <SearchableSelect
                      value={f.field || ''}
                      onValueChange={(v) => setFilters(filters.map((x, ix) => (ix === i ? { ...x, field: v, value: '' } : x)))}
                      options={fieldOptions}
                      className="w-[220px] bg-background"
                      placeholder="Field"
                    />
                    <SearchableSelect
                      value={f.operator || 'equals'}
                      onValueChange={(v) => setFilters(filters.map((x, ix) => (ix === i ? { ...x, operator: v } : x)))}
                      options={OUTBOUND_OPERATORS}
                      className="w-[160px] bg-background"
                    />
                    {needsValue && (choices
                      ? (
                        <SearchableSelect
                          value={f.value || ''}
                          onValueChange={(v) => setFilters(filters.map((x, ix) => (ix === i ? { ...x, value: v } : x)))}
                          options={choices}
                          className="flex-1 bg-background"
                          placeholder="Value"
                        />
                      ) : (
                        <Input
                          value={f.value || ''}
                          onChange={(e) => setFilters(filters.map((x, ix) => (ix === i ? { ...x, value: e.target.value } : x)))}
                          placeholder="Value"
                          className="flex-1 bg-background"
                        />
                      ))}
                    <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => setFilters(filters.filter((_, ix) => ix !== i))}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Payload builder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-foreground">Payload</div>
                  <p className="text-[11px] text-muted-foreground">
                    Left is the key the receiver expects, right is where the value comes from. A field with no value is
                    omitted rather than sent as null.
                  </p>
                </div>
                <SearchableSelect value={form.payload_mode} onValueChange={(v) => set({ payload_mode: v })} options={PAYLOAD_MODES} className="w-[190px] bg-background" />
              </div>

              {form.payload_mode === 'template' ? (
                <textarea
                  value={form.payload_template}
                  onChange={(e) => set({ payload_template: e.target.value })}
                  rows={6}
                  placeholder={'{"email":"{{email}}","status":"{{final_status}}"}'}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] font-mono text-foreground"
                />
              ) : (
                <>
                  {rows.map((r, i) => {
                    const choices = r.source === 'static' ? null : valueChoicesFor(r.value);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={r.key || ''}
                          onChange={(e) => setRows(rows.map((x, ix) => (ix === i ? { ...x, key: e.target.value } : x)))}
                          placeholder="Their key"
                          className="w-[200px] bg-background font-mono text-[12px]"
                        />
                        <SearchableSelect
                          value={r.source || 'field'}
                          onValueChange={(v) => setRows(rows.map((x, ix) => (ix === i ? { ...x, source: v, value: '' } : x)))}
                          options={PAYLOAD_SOURCES}
                          className="w-[160px] bg-background"
                        />
                        {r.source === 'static' ? (
                          <Input
                            value={r.value || ''}
                            onChange={(e) => setRows(rows.map((x, ix) => (ix === i ? { ...x, value: e.target.value } : x)))}
                            placeholder="Static value"
                            className="flex-1 bg-background"
                          />
                        ) : (
                          <SearchableSelect
                            value={r.value || ''}
                            onValueChange={(v) => setRows(rows.map((x, ix) => (ix === i ? { ...x, value: v } : x)))}
                            options={choices || fieldOptions}
                            className="flex-1 bg-background"
                            placeholder="Our field"
                          />
                        )}
                        <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => setRows(rows.filter((_, ix) => ix !== i))}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRows([...rows, emptyPayloadRow()])}>
                    <Plus className="w-3.5 h-3.5" /> Add field
                  </Button>
                </>
              )}
            </div>

            {/* Preview, built by the same module the dispatcher uses. */}
            <div className="space-y-1.5">
              <Label>Preview</Label>
              <pre className="rounded-lg border border-border bg-background p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-[180px]">
                {preview.ok ? preview.raw : preview.error}
              </pre>
              <p className="text-[11px] text-muted-foreground">
                Built against a sample record by the same code that sends. Filters currently {preview.passes ? 'pass' : 'block this record'}.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
              <div>
                <div className="text-[13px] text-foreground">Enabled</div>
                <div className="text-[12px] text-muted-foreground">Disabled webhooks never send, even on their trigger.</div>
              </div>
              <Switch checked={!!form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editingId ? 'Save' : 'Create Webhook'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the webhook. It cannot be undone.</AlertDialogDescription>
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

export default SettingsOutboundWebhooks;
