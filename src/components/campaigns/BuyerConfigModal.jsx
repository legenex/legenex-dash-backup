import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  ChevronDown, Plus, Trash2, Loader2, Save,
} from 'lucide-react';
import {
  FiltersEditor, CapsEditor, cleanFilters, cleanCaps,
} from '@/components/distribution/memberFieldEditors';

// Edit Buyer Configuration modal. Every section is wired to a real RouteMember
// field (status/priority/payout/caps/filters on canonical fields; the additive
// JSON fields carry budget caps, KPI, transforms, ping and delivery config). No
// routing/engine logic is touched here. The Ping section renders only when the
// campaign method includes ping.

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try { const v = JSON.parse(raw); return v ?? fallback; } catch { return fallback; }
}

const PAYOUT_TYPES = [
  { value: 'flat_cpl', label: 'Flat CPL' },
  { value: 'revenue_pct', label: 'Revenue %' },
  { value: 'profit_pct', label: 'Profit %' },
];
const BUDGET_KEYS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'total', label: 'Total' },
];
const PING_FORMATS = ['json', 'form', 'query'];
const PING_OPERATORS = ['equals', 'not_equals', 'contains', 'gt', 'lt', 'exists'];
const DELIVERY_METHODS = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'email', label: 'Email' },
  { value: 'google_sheet', label: 'Google Sheet' },
  { value: 'ghl', label: 'GHL' },
];

// Collapsible section shell using the Legenex card tokens.
function Section({ title, description, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-[10px] border border-border bg-card">
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
          {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-5 pb-5 pt-0 space-y-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export default function BuyerConfigModal({ open, onOpenChange, member, buyerName, method = 'direct_post' }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const showPing = method === 'ping_post' || method === 'both';

  useEffect(() => {
    if (!open || !member) return;
    const ping = parseJson(member.ping_config, {});
    const delivery = parseJson(member.delivery_config, {});
    const kpi = parseJson(member.kpi_metrics, {});
    setForm({
      active: member.active !== false,
      destination_name: member.destination_name || '',
      alias: member.alias || '',
      payout_type: member.payout_type || 'flat_cpl',
      fixed_price: member.fixed_price ?? '',
      conditional_pricing_enabled: !!member.conditional_pricing_enabled,
      caps: parseJson(member.caps, {}),
      budget_caps: parseJson(member.budget_caps, {}),
      budgetEnabled: BUDGET_KEYS.reduce((a, b) => ({ ...a, [b.key]: parseJson(member.budget_caps, {})[b.key] != null }), {}),
      filters: parseJson(member.filters, {}),
      target_cpa: kpi.target_cpa ?? '',
      transforms: parseJson(member.transforms, []),
      ping: {
        url: ping.url || '', format: ping.format || 'json', timeout_ms: ping.timeout_ms || 8000,
        headers: ping.headers || '', body_template: ping.body_template || '',
        accept_field: ping.accept_field || '', accept_operator: ping.accept_operator || 'equals', accept_value: ping.accept_value || '',
        realtime_price: !!ping.realtime_price,
      },
      delivery: {
        method: delivery.method || 'webhook', url: delivery.url || '', format: delivery.format || 'json',
        headers: delivery.headers || '', body_template: delivery.body_template || '',
      },
    });
  }, [open, member]);

  if (!form) return open ? (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[820px]"><div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div></DialogContent>
    </Dialog>
  ) : null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setPing = (patch) => setForm((f) => ({ ...f, ping: { ...f.ping, ...patch } }));
  const setDelivery = (patch) => setForm((f) => ({ ...f, delivery: { ...f.delivery, ...patch } }));
  const setBudget = (key, v) => setForm((f) => ({ ...f, budget_caps: { ...f.budget_caps, [key]: v } }));
  const setBudgetEnabled = (key, v) => setForm((f) => ({ ...f, budgetEnabled: { ...f.budgetEnabled, [key]: v } }));

  const setTransform = (i, k, v) => setForm((f) => ({ ...f, transforms: f.transforms.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));
  const addTransform = () => setForm((f) => ({ ...f, transforms: [...f.transforms, { field: '', from: '', to: '' }] }));
  const removeTransform = (i) => setForm((f) => ({ ...f, transforms: f.transforms.filter((_, idx) => idx !== i) }));

  function buildPayload() {
    const budget = {};
    BUDGET_KEYS.forEach(({ key }) => {
      if (form.budgetEnabled[key]) { const n = Number(form.budget_caps[key]); if (Number.isFinite(n) && n > 0) budget[key] = n; }
    });
    const transforms = form.transforms.filter((t) => t.field || t.from || t.to);
    const kpi = {}; if (form.target_cpa !== '' && form.target_cpa != null) kpi.target_cpa = Number(form.target_cpa);
    return {
      active: !!form.active,
      destination_name: form.destination_name || null,
      alias: form.alias || null,
      payout_type: form.payout_type,
      fixed_price: form.fixed_price === '' ? null : Number(form.fixed_price),
      conditional_pricing_enabled: !!form.conditional_pricing_enabled,
      caps: JSON.stringify(cleanCaps(form.caps)),
      budget_caps: JSON.stringify(budget),
      filters: JSON.stringify(cleanFilters(form.filters)),
      kpi_metrics: JSON.stringify(kpi),
      transforms: JSON.stringify(transforms),
      ping_config: JSON.stringify(form.ping),
      delivery_config: JSON.stringify(form.delivery),
    };
  }

  async function save() {
    setSaving(true);
    try {
      await base44.entities.RouteMember.update(member.id, buildPayload());
      await qc.invalidateQueries({ queryKey: ['routeMembers'] });
      toast.success('Buyer configuration saved');
      onOpenChange(false);
    } catch (e) { toast.error('Save failed: ' + (e?.message || 'error')); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[820px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Buyer Configuration - {buyerName || 'Buyer'}</DialogTitle>
          <DialogDescription className="text-[12px]">Configure payout, caps, filters, KPI, transforms and delivery for this buyer.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status / Name / Alias */}
          <Section title="Status, Name &amp; Alias" defaultOpen>
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-3 items-end">
              <div className="flex items-center gap-2 pb-1.5">
                <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
                <Label className="text-[13px]">{form.active ? 'Enabled' : 'Paused'}</Label>
              </div>
              <div>
                <Label className="text-[12px] font-medium">Buyer name</Label>
                <Input value={form.destination_name} onChange={(e) => set({ destination_name: e.target.value })} className="mt-1 bg-background h-9" placeholder={buyerName} />
              </div>
              <div>
                <Label className="text-[12px] font-medium">Alias</Label>
                <Input value={form.alias} onChange={(e) => set({ alias: e.target.value })} className="mt-1 bg-background h-9" placeholder="short alias" />
              </div>
            </div>
          </Section>

          <Section title="Payout" description="Payout basis and per-lead amount." defaultOpen>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px] font-medium">Payout type</Label>
                <Select value={form.payout_type} onValueChange={(v) => set({ payout_type: v })}>
                  <SelectTrigger className="mt-1 bg-background h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYOUT_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12px] font-medium">Per-lead amount</Label>
                <Input type="number" min="0" step="0.01" value={form.fixed_price} onChange={(e) => set({ fixed_price: e.target.value })} className="mt-1 bg-background h-9 font-mono text-[12px]" placeholder="0.00" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.conditional_pricing_enabled} onCheckedChange={(v) => set({ conditional_pricing_enabled: v })} />
              <Label className="text-[13px]">Conditional pricing</Label>
            </div>
          </Section>

          <Section title="Cap Settings" description="Lead caps and budget caps for this buyer.">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-2">Lead caps</div>
              <CapsEditor value={form.caps} onChange={(v) => set({ caps: v })} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-2">Budget caps ($)</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {BUDGET_KEYS.map((b) => (
                  <div key={b.key} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Switch checked={!!form.budgetEnabled[b.key]} onCheckedChange={(v) => setBudgetEnabled(b.key, v)} />
                      <Label className="text-[12px] font-medium">{b.label}</Label>
                    </div>
                    <Input type="number" min="0" step="0.01" disabled={!form.budgetEnabled[b.key]} value={form.budget_caps[b.key] ?? ''} onChange={(e) => setBudget(b.key, e.target.value)} className="bg-background h-9 font-mono text-[12px]" placeholder="0.00" />
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Lead Filters" description="Lead attributes this buyer accepts.">
            <FiltersEditor value={form.filters} onChange={(v) => set({ filters: v })} />
          </Section>

          <Section title="KPI Metrics" description="Performance targets for this buyer.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px] font-medium">Target CPA ($)</Label>
                <Input type="number" min="0" step="0.01" value={form.target_cpa} onChange={(e) => set({ target_cpa: e.target.value })} className="mt-1 bg-background h-9 font-mono text-[12px]" placeholder="0.00" />
              </div>
            </div>
          </Section>

          <Section title="Field Transforms" description="Value map rules applied before delivery.">
            <div className="space-y-2">
              {form.transforms.length === 0 && <div className="text-[12px] text-muted-foreground">No transforms yet.</div>}
              {form.transforms.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <Input value={t.field || ''} onChange={(e) => setTransform(i, 'field', e.target.value)} placeholder="field" className="bg-background h-9 text-[12px]" />
                  <Input value={t.from || ''} onChange={(e) => setTransform(i, 'from', e.target.value)} placeholder="from value" className="bg-background h-9 text-[12px]" />
                  <Input value={t.to || ''} onChange={(e) => setTransform(i, 'to', e.target.value)} placeholder="to value" className="bg-background h-9 text-[12px]" />
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeTransform(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addTransform} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Add transform</Button>
            </div>
          </Section>

          {showPing && (
            <Section title="Ping Configuration" description="Ping request and response parsing.">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-3">
                <div>
                  <Label className="text-[12px] font-medium">Ping URL</Label>
                  <Input value={form.ping.url} onChange={(e) => setPing({ url: e.target.value })} className="mt-1 bg-background h-9" placeholder="https://buyer.example/ping" />
                </div>
                <div>
                  <Label className="text-[12px] font-medium">Format</Label>
                  <Select value={form.ping.format} onValueChange={(v) => setPing({ format: v })}>
                    <SelectTrigger className="mt-1 bg-background h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{PING_FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px] font-medium">Timeout (ms)</Label>
                  <Input type="number" value={form.ping.timeout_ms} onChange={(e) => setPing({ timeout_ms: e.target.value })} className="mt-1 bg-background h-9 font-mono text-[12px]" />
                </div>
              </div>
              <div>
                <Label className="text-[12px] font-medium">Headers (JSON)</Label>
                <Textarea value={form.ping.headers} onChange={(e) => setPing({ headers: e.target.value })} rows={2} className="mt-1 bg-background font-mono text-[12px]" placeholder='{"X-Env":"prod"}' />
              </div>
              <div>
                <Label className="text-[12px] font-medium">Ping body template</Label>
                <Textarea value={form.ping.body_template} onChange={(e) => setPing({ body_template: e.target.value })} rows={3} className="mt-1 bg-background font-mono text-[12px]" />
              </div>
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-2">Response parsing (accept when)</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input value={form.ping.accept_field} onChange={(e) => setPing({ accept_field: e.target.value })} placeholder="field" className="bg-background h-9 text-[12px]" />
                  <Select value={form.ping.accept_operator} onValueChange={(v) => setPing({ accept_operator: v })}>
                    <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{PING_OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={form.ping.accept_value} onChange={(e) => setPing({ accept_value: e.target.value })} placeholder="value" className="bg-background h-9 text-[12px]" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.ping.realtime_price} onCheckedChange={(v) => setPing({ realtime_price: v })} />
                <Label className="text-[13px]">Real-time price</Label>
              </div>
            </Section>
          )}

          <Section title="Delivery Method" description="How accepted leads are delivered.">
            <div>
              <Label className="text-[12px] font-medium">Method</Label>
              <Select value={form.delivery.method} onValueChange={(v) => setDelivery({ method: v })}>
                <SelectTrigger className="mt-1 bg-background h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{DELIVERY_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
              <div>
                <Label className="text-[12px] font-medium">Endpoint URL</Label>
                <Input value={form.delivery.url} onChange={(e) => setDelivery({ url: e.target.value })} className="mt-1 bg-background h-9" placeholder="https://buyer.example/api" />
              </div>
              <div>
                <Label className="text-[12px] font-medium">Format</Label>
                <Select value={form.delivery.format} onValueChange={(v) => setDelivery({ format: v })}>
                  <SelectTrigger className="mt-1 bg-background h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{PING_FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[12px] font-medium">Headers (JSON)</Label>
              <Textarea value={form.delivery.headers} onChange={(e) => setDelivery({ headers: e.target.value })} rows={2} className="mt-1 bg-background font-mono text-[12px]" placeholder='{"Authorization":"Bearer ..."}' />
            </div>
            <div>
              <Label className="text-[12px] font-medium">Body template</Label>
              <Textarea value={form.delivery.body_template} onChange={(e) => setDelivery({ body_template: e.target.value })} rows={3} className="mt-1 bg-background font-mono text-[12px]" />
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}