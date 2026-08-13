import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Check, Copy, Phone, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CALL_LEAD_FIELDS, CALL_DEFAULT_MAPPING, IGNORE } from '@/components/settings/leadSourceFields';

const PROVIDER_LABEL = { ringba: 'Ringba', truecall: 'TrueCall' };

// A tiny spec of the expected inbound fields per provider, shown as guidance.
const PROVIDER_SPEC = {
  ringba: 'Ringba: POST JSON to this URL. Expected keys: inboundPhoneNumber, callerId, campaignName, targetName, callLengthInSeconds, tag, recordingUrl, conversionAmount.',
  truecall: 'TrueCall: POST JSON to this URL. Expected keys: caller_number, caller_id, campaign, target, duration, disposition, recording_url, payout.',
};

export default function CallSourceDialog({ open, onOpenChange, source, provider, onSaved }) {
  const editing = !!source;
  const kind = source?.kind || provider || 'ringba';
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null); // saved source (to reveal endpoint URL)
  const [form, setForm] = useState({ name: '', supplier_name: '', campaign_id: '', enabled: true });
  // mapping stored as rows of { key, field } for editability
  const [rows, setRows] = useState([]);

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list('-created_date', 200) });
  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list('-created_date', 200) });
  const { data: appSettingsArr = [] } = useQuery({ queryKey: ['app-settings'], queryFn: () => base44.entities.AppSettings.list() });

  const baseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';

  useEffect(() => {
    if (open) {
      setSaved(null);
      if (source) {
        setForm({ name: source.name || '', supplier_name: source.supplier_name || '', campaign_id: source.campaign_id || '', enabled: source.enabled ?? true });
        let m = {}; try { m = JSON.parse(source.mapping || '{}'); } catch {}
        setRows(Object.entries(m).map(([key, field]) => ({ key, field })));
        if (source.webhook_key) setSaved(source);
      } else {
        setForm({ name: '', supplier_name: '', campaign_id: '', enabled: true });
        setRows(Object.entries(CALL_DEFAULT_MAPPING[kind] || {}).map(([key, field]) => ({ key, field })));
      }
    }
  }, [open, source, kind]);

  const endpointUrl = saved?.webhook_key ? `${baseUrl}/functions/callWebhook?key=${saved.webhook_key}` : '';

  const updateRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, { key: '', field: IGNORE }]);
  const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.supplier_name) { toast.error('Pick a supplier to attribute'); return; }
    setBusy(true);
    try {
      const mapping = {};
      rows.forEach(r => { if (r.key.trim() && r.field && r.field !== IGNORE) mapping[r.key.trim()] = r.field; });
      const payload = {
        name: form.name.trim(), kind, enabled: form.enabled,
        supplier_name: form.supplier_name, campaign_id: form.campaign_id,
        mapping: JSON.stringify(mapping),
      };
      let rec;
      if (editing) { rec = await base44.entities.LeadSource.update(source.id, payload); }
      else { rec = await base44.entities.LeadSource.create(payload); }
      // Provision API key + webhook key, then reload to reveal endpoint.
      await base44.functions.invoke('provisionLeadSource', { source_id: rec.id });
      const fresh = (await base44.entities.LeadSource.filter({ id: rec.id }))[0];
      setSaved(fresh);
      onSaved?.();
      toast.success(editing ? 'Source updated' : `${PROVIDER_LABEL[kind]} source added`);
    } catch (err) {
      toast.error('Could not save source');
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" /> {editing ? 'Edit' : 'Add'} {PROVIDER_LABEL[kind]} Call Source
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="text-[12px] text-muted-foreground bg-muted/40 border border-border rounded-lg p-3">{PROVIDER_SPEC[kind]}</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Source Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={`${PROVIDER_LABEL[kind]} Calls`} className="mt-1 bg-background" />
            </div>
            <div>
              <Label className="text-[12px]">Attribute to Supplier *</Label>
              <SearchableSelect value={form.supplier_name} onValueChange={v => setForm(p => ({ ...p, supplier_name: v }))} className="mt-1 bg-background" placeholder="Select supplier…" options={suppliers.map(s => ({ value: s.name, label: s.name }))} />
            </div>
          </div>
          <div>
            <Label className="text-[12px]">Attribute to Campaign</Label>
            <SearchableSelect value={form.campaign_id} onValueChange={v => setForm(p => ({ ...p, campaign_id: v }))} className="mt-1 bg-background" placeholder="Optional" options={[{ value: '', label: 'None' }, ...campaigns.map(c => ({ value: c.id, label: c.name }))]} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-[12px]">Call Payload Mapping</Label>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={addRow}><Plus className="w-3 h-3" /> Add field</Button>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={r.key} onChange={e => updateRow(i, { key: e.target.value })} placeholder="payload key" className="bg-background text-[12px] h-8 font-mono flex-1" />
                  <span className="text-muted-foreground text-[11px]">→</span>
                  <SearchableSelect value={r.field} onValueChange={v => updateRow(i, { field: v })} className="bg-background h-8 w-[180px]" options={[{ value: IGNORE, label: '— Ignore —' }, ...CALL_LEAD_FIELDS.map(f => ({ value: f, label: f }))]} />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeRow(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
            </div>
          </div>

          {saved?.webhook_key && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-semibold text-primary uppercase tracking-wider">Webhook Endpoint</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-[12px] text-foreground break-all bg-background rounded p-2 border border-border">{endpointUrl}</code>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(endpointUrl); toast.success('Endpoint URL copied'); }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Paste this into {PROVIDER_LABEL[kind]} as the call webhook / postback URL. Each call posts here and becomes a lead.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{saved ? 'Done' : 'Cancel'}</Button>
          <Button onClick={save} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {editing ? 'Save Source' : 'Add Source'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}