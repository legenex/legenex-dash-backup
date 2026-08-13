import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Send, Loader2, KeyRound, AlertTriangle, Link2 } from 'lucide-react';
import { CORE_LEAD_FIELDS } from '@/components/settings/leadSourceFields';
import { buildDeliveryPreview, classifySampleResponse } from '@/lib/distribution/previewClient';

// Per-buyer Deliveries panel. This is the former standalone CampaignDeliveries
// content, scoped to a single buyer and embedded in the Buyers > Deliveries tab.
// The endpoint config, payload preview, response tester, backlinks, and gated
// live test are unchanged; only the surrounding list is filtered to this buyer
// and a new delivery is pre-attached to the buyer.
const STATUSES = ['draft', 'active', 'paused', 'archived'];
const SAMPLE_LEAD = { first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', mobile: '5551234567', state: 'TX', zip: '75001', vertical: 'legal' };

function parseArr(raw) { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
// Token-only status text per DESIGN-SYSTEM.md: active is primary, the rest muted.
function statusText(s) { return s === 'active' ? 'text-primary' : 'text-muted-foreground'; }

export default function BuyerDeliveriesPanel({ buyerId }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('-created_date', 500) });
  const { data: allDeliveries = [], isLoading } = useQuery({ queryKey: ['deliveries'], queryFn: () => fetchAll((limit, skip) => base44.entities.Delivery.list('-created_date', limit, skip)) });
  const { data: subs = [] } = useQuery({ queryKey: ['subdeliveries'], queryFn: () => fetchAll((limit, skip) => base44.entities.SubDelivery.list('-created_date', limit, skip)) });
  const { data: members = [] } = useQuery({ queryKey: ['routemembers'], queryFn: () => fetchAll((limit, skip) => base44.entities.RouteMember.list('-created_date', limit, skip)) });
  const { data: settings = [] } = useQuery({ queryKey: ['appsettings'], queryFn: () => base44.entities.AppSettings.list() });

  const distributionMode = String((settings[0] && settings[0].distribution_mode) || 'legacy_only');
  const liveTestEnabled = distributionMode !== 'legacy_only';

  const deliveries = useMemo(() => allDeliveries.filter((d) => d.buyer_id === buyerId), [allDeliveries, buyerId]);
  const selected = deliveries.find((d) => d.id === selectedId) || null;
  const selectedSubs = subs.filter((s) => s.delivery_id === selectedId).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  async function createDelivery(payload) {
    await base44.entities.Delivery.create({ ...payload, buyer_id: buyerId });
    await qc.invalidateQueries({ queryKey: ['deliveries'] });
    toast.success('Delivery created');
  }
  async function updateDelivery(id, patch) {
    await base44.entities.Delivery.update(id, patch);
    await qc.invalidateQueries({ queryKey: ['deliveries'] });
  }
  async function addSubDelivery() {
    await base44.entities.SubDelivery.create({
      delivery_id: selectedId, name: `Tier ${selectedSubs.length + 1}`, active: true,
      order_index: selectedSubs.length, method: 'POST', encoding: 'json', timeout_ms: 10000,
    });
    await qc.invalidateQueries({ queryKey: ['subdeliveries'] });
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between pb-2">
        <div className="text-xs text-muted-foreground">Delivery endpoints for this buyer</div>
        <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Delivery</Button>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* Delivery list for this buyer */}
        <div className="border-r border-border overflow-y-auto pr-2 space-y-0.5">
          {isLoading && <div className="text-sm text-muted-foreground p-3"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading</div>}
          {!isLoading && deliveries.length === 0 && <div className="text-sm text-muted-foreground p-3">No deliveries yet for this buyer.</div>}
          {deliveries.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-[13px] flex items-center justify-between gap-2 ${
                selectedId === d.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
              }`}
            >
              <span className="truncate">{d.name || '(unnamed delivery)'}</span>
              <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium ${statusText(d.status)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'active' ? 'bg-primary' : 'bg-muted-foreground'}`} />
                {d.status || 'draft'}
              </span>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="overflow-y-auto pr-2">
          {!selected && <div className="text-sm text-muted-foreground p-6">Select a delivery to configure its endpoints.</div>}
          {selected && (
            <DeliveryDetail
              key={selected.id}
              delivery={selected}
              subs={selectedSubs}
              members={members}
              liveTestEnabled={liveTestEnabled}
              distributionMode={distributionMode}
              onUpdateDelivery={updateDelivery}
              onAddSub={addSubDelivery}
              qc={qc}
            />
          )}
        </div>
      </div>

      <NewDeliveryDialog open={newOpen} onOpenChange={setNewOpen} verticals={verticals} onCreate={createDelivery} />
    </div>
  );
}

function DeliveryDetail({ delivery, subs, members, liveTestEnabled, distributionMode, onUpdateDelivery, onAddSub, qc }) {
  const [activeTab, setActiveTab] = useState(subs[0]?.id || null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="text-base font-medium">{delivery.name || '(unnamed)'}</div>
          <div className="text-xs text-muted-foreground">Buyer-scoped delivery</div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={delivery.status || 'draft'} onValueChange={(v) => onUpdateDelivery(delivery.id, { status: v })}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab || ''} onValueChange={setActiveTab}>
        <div className="flex items-center gap-2">
          <TabsList className="flex-wrap h-auto">
            {subs.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="text-xs">
                {s.name || 'Tier'}{s.active === false ? ' (off)' : ''}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button size="sm" variant="outline" onClick={onAddSub}><Plus className="w-3.5 h-3.5 mr-1" />Sub-Delivery</Button>
        </div>

        {subs.length === 0 && <div className="text-sm text-muted-foreground p-6">No sub-deliveries. Create one to configure an endpoint.</div>}
        {subs.map((s) => (
          <TabsContent key={s.id} value={s.id}>
            <SubDeliveryEditor
              sub={s}
              members={members}
              liveTestEnabled={liveTestEnabled}
              distributionMode={distributionMode}
              qc={qc}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function SubDeliveryEditor({ sub, members, liveTestEnabled, distributionMode, qc }) {
  const [form, setForm] = useState({
    name: sub.name || '', active: sub.active !== false, target_url: sub.target_url || '',
    method: sub.method || 'POST', encoding: sub.encoding || 'json', timeout_ms: sub.timeout_ms || 10000,
    headers: sub.headers || '', response_mapping: sub.response_mapping || '', retry_policy: sub.retry_policy || '',
  });
  const [fieldMap, setFieldMap] = useState(parseArr(sub.field_map));
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);

  // Backlink: which RouteMembers point at this sub-delivery.
  const usedBy = members.filter((m) => m.sub_delivery_id === sub.id);
  const inUse = usedBy.length > 0;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const patchOf = () => ({
    ...form, timeout_ms: Number(form.timeout_ms) || 10000,
    field_map: JSON.stringify(fieldMap.filter((r) => r.src || r.dest)),
  });

  async function save() {
    setSaving(true);
    try {
      await base44.entities.SubDelivery.update(sub.id, patchOf());
      await qc.invalidateQueries({ queryKey: ['subdeliveries'] });
      toast.success('Sub-delivery saved');
    } catch (e) { toast.error(e.message || 'Save failed'); } finally { setSaving(false); }
  }

  async function toggleActive(next) {
    if (!next && inUse) { setConfirmOff(true); return; }
    set('active', next);
    await base44.entities.SubDelivery.update(sub.id, { active: next });
    await qc.invalidateQueries({ queryKey: ['subdeliveries'] });
  }

  // Live preview reflects UNSAVED edits.
  const draftSub = { ...sub, ...patchOf() };

  return (
    <div className="grid grid-cols-2 gap-5 pt-3">
      {/* Config */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={form.active} onCheckedChange={toggleActive} />
            <span className="text-xs text-muted-foreground">{form.active ? 'Active' : 'Inactive'}</span>
          </div>
          {inUse && <Badge variant="outline" className="text-[10px]"><Link2 className="w-3 h-3 mr-1" />{usedBy.length} member{usedBy.length > 1 ? 's' : ''}</Badge>}
        </div>
        <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} className="h-8" /></Field>
        <Field label="Target URL"><Input value={form.target_url} onChange={(e) => set('target_url', e.target.value)} placeholder="https://buyer.example/api" className="h-8" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Method">
            <Select value={form.method} onValueChange={(v) => set('method', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{['POST', 'PUT', 'GET'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Encoding">
            <Select value={form.encoding} onValueChange={(v) => set('encoding', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{['json', 'form'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Timeout (ms)"><Input type="number" value={form.timeout_ms} onChange={(e) => set('timeout_ms', e.target.value)} className="h-8" /></Field>
        </div>

        {/* Credential: presence + replace only. Value never shown or round-tripped. */}
        <CredentialRow sub={sub} qc={qc} />

        <FieldMapEditor rows={fieldMap} onChange={setFieldMap} />

        <Field label="Non-secret headers (JSON)"><Textarea value={form.headers} onChange={(e) => set('headers', e.target.value)} rows={2} className="text-xs font-mono" placeholder='{"X-Env":"prod"}' /></Field>
        <Field label="Response mapping (JSON)"><Textarea value={form.response_mapping} onChange={(e) => set('response_mapping', e.target.value)} rows={3} className="text-xs font-mono" placeholder='{"accepted":"accepted","rejected":"rejected","duplicate":"duplicate","queued":"queued","revenue":"price","buyer_lead_id":"id"}' /></Field>
        <Field label="Retry policy (JSON)"><Textarea value={form.retry_policy} onChange={(e) => set('retry_policy', e.target.value)} rows={2} className="text-xs font-mono" placeholder='{"maxAttempts":3,"baseMs":1000}' /></Field>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Save</Button>
          <Button size="sm" variant="outline" disabled={!liveTestEnabled} onClick={() => setLiveOpen(true)}>
            <Send className="w-3.5 h-3.5 mr-1" />Live test
          </Button>
          {!liveTestEnabled && <span className="text-[11px] text-muted-foreground">Live test disabled ({distributionMode})</span>}
        </div>
      </div>

      {/* Preview + tester + backlink */}
      <div className="space-y-4">
        <PayloadPreview sub={draftSub} />
        <ResponseTester sub={draftSub} />
        <BacklinkPanel usedBy={usedBy} />
      </div>

      <AlertConfirmOff open={confirmOff} onOpenChange={setConfirmOff} count={usedBy.length} onConfirm={async () => {
        setConfirmOff(false); set('active', false);
        await base44.entities.SubDelivery.update(sub.id, { active: false });
        await qc.invalidateQueries({ queryKey: ['subdeliveries'] });
      }} />
      <LiveTestDialog open={liveOpen} onOpenChange={setLiveOpen} sub={sub} />
    </div>
  );
}

function CredentialRow({ sub, qc }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState('');
  return (
    <div className="rounded-md border border-border p-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs">
        <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
        {sub.credential_ref
          ? <span>Credential set{sub.credential_updated_at ? ` · updated ${new Date(sub.credential_updated_at).toLocaleDateString()}` : ''}</span>
          : <span className="text-muted-foreground">No credential</span>}
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>Replace</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace credential</DialogTitle>
            <DialogDescription>Enter the secret-storage reference. The secret value itself is entered in secret storage, never here, and is never displayed.</DialogDescription>
          </DialogHeader>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="secret-storage reference" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              await base44.entities.SubDelivery.update(sub.id, { credential_ref: ref, credential_updated_at: new Date().toISOString() });
              await qc.invalidateQueries({ queryKey: ['subdeliveries'] });
              setOpen(false); setRef(''); toast.success('Credential reference updated');
            }}>Save reference</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldMapEditor({ rows, onChange }) {
  const set = (i, k, v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      <Label className="text-xs">Field mapping</Label>
      <div className="space-y-1 mt-1">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
            <Input list="lead-fields" value={r.src || ''} onChange={(e) => set(i, 'src', e.target.value)} placeholder="lead field" className="h-7 text-xs" />
            <Input value={r.dest || ''} onChange={(e) => set(i, 'dest', e.target.value)} placeholder="outbound key" className="h-7 text-xs" />
            <button className="text-muted-foreground hover:text-destructive text-xs px-1" onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>remove</button>
          </div>
        ))}
      </div>
      <datalist id="lead-fields">{CORE_LEAD_FIELDS.map((f) => <option key={f} value={f} />)}</datalist>
      <Button size="sm" variant="ghost" className="h-6 text-xs mt-1" onClick={() => onChange([...rows, { src: '', dest: '' }])}><Plus className="w-3 h-3 mr-1" />Add mapping</Button>
    </div>
  );
}

function PayloadPreview({ sub }) {
  const [lead, setLead] = useState(JSON.stringify(SAMPLE_LEAD, null, 2));
  let sample = {}; try { sample = JSON.parse(lead); } catch { /* keep last valid */ }
  const preview = buildDeliveryPreview(sub, sample);
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-medium mb-2">Payload preview (dry-run, nothing sent)</div>
      <Label className="text-[11px] text-muted-foreground">Sample lead</Label>
      <Textarea value={lead} onChange={(e) => setLead(e.target.value)} rows={4} className="text-[11px] font-mono mb-2" />
      <div className="text-[11px] font-mono bg-muted/40 rounded p-2 overflow-x-auto">
        <div>{preview.method} {preview.url || '(no url)'}</div>
        {Object.entries(preview.headers).map(([k, v]) => <div key={k} className="text-muted-foreground">{k}: {String(v)}</div>)}
        <pre className="mt-1 whitespace-pre-wrap">{preview.body}</pre>
      </div>
    </div>
  );
}

function ResponseTester({ sub }) {
  const [body, setBody] = useState('{"accepted":true,"price":42,"id":"BUY-9"}');
  const [code, setCode] = useState(200);
  const result = classifySampleResponse(sub, { httpStatus: code, body });
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-medium mb-2">Response mapping tester (dry-run)</div>
      <div className="flex items-center gap-2 mb-2">
        <Label className="text-[11px] text-muted-foreground">HTTP</Label>
        <Input type="number" value={code} onChange={(e) => setCode(Number(e.target.value))} className="h-7 w-20 text-xs" />
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="text-[11px] font-mono mb-2" />
      <div className="text-xs">Classified as <Badge className="ml-1">{result.status}</Badge>
        {result.status === 'accepted' && <span className="ml-2 text-muted-foreground">revenue {result.revenue}, buyer lead {String(result.buyerLeadId)}</span>}
      </div>
    </div>
  );
}

function BacklinkPanel({ usedBy }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-medium mb-2">Used by route members</div>
      {usedBy.length === 0 && <div className="text-[11px] text-muted-foreground">Not referenced by any route member.</div>}
      {usedBy.map((m) => <div key={m.id} className="text-[11px] font-mono text-muted-foreground">member {m.id} · group {m.route_group_id}</div>)}
    </div>
  );
}

function Field({ label, children }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}

function NewDeliveryDialog({ open, onOpenChange, verticals, onCreate }) {
  const [form, setForm] = useState({ name: '', vertical_id: '', status: 'draft' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New delivery</DialogTitle><DialogDescription>This delivery is attached to the current buyer.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-8" /></Field>
          <Field label="Vertical (optional)">
            <Select value={form.vertical_id} onValueChange={(v) => setForm((f) => ({ ...f, vertical_id: v }))}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>{verticals.map((v) => <SelectItem key={v.id} value={v.id}>{v.name || v.id}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={async () => { await onCreate(form); onOpenChange(false); setForm({ name: '', vertical_id: '', status: 'draft' }); }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertConfirmOff({ open, onOpenChange, count, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" />Deactivate an in-use endpoint?</DialogTitle>
          <DialogDescription>{count} route member{count > 1 ? 's' : ''} currently point at this sub-delivery. Deactivating it makes those members ineligible (they will not route) until you point them elsewhere.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Deactivate anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LiveTestDialog({ open, onOpenChange, sub }) {
  const [reason, setReason] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  async function run() {
    setRunning(true); setResult(null);
    try {
      const res = await base44.functions.invoke('campaignDeliveryTest', { confirm: true, sub_delivery_id: sub.id, reason, sample_lead: SAMPLE_LEAD });
      setResult(res && res.data ? res.data : res);
    } catch (e) { setResult({ ok: false, error: e.message || 'Test failed' }); } finally { setRunning(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="w-4 h-4" />Live outbound test</DialogTitle>
          <DialogDescription>This sends a REAL request to the buyer endpoint. It is audited. Only proceed with authorization.</DialogDescription>
        </DialogHeader>
        <Field label="Reason (audited)"><Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-8" /></Field>
        {result && <div className="text-xs font-mono bg-muted/40 rounded p-2 overflow-x-auto">{JSON.stringify(result, null, 2)}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="destructive" onClick={run} disabled={running}>{running && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Confirm and send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
