import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Zap, Send, Layers } from 'lucide-react';
import { toast } from 'sonner';

const BLANK = { name: '', brand: '', send_mode: 'direct_post' };

// A campaign IS a vertical: creating a campaign also creates the matching
// Vertical record (by code) if one doesn't already exist. Method supports
// Direct Post, Ping Post, or Both, not a forced either/or.
const METHOD_OPTS = [
  { value: 'direct_post', label: 'Direct Post', icon: Send, desc: 'Suppliers post the full lead in one request.' },
  { value: 'ping_post', label: 'Ping Post', icon: Zap, desc: 'Suppliers ping first, then post accepted leads.' },
  { value: 'both', label: 'Both', icon: Layers, desc: 'Accept either Direct Post or Ping Post.' },
];

// Turn a campaign name into a stable vertical code.
function toVerticalCode(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

export default function CampaignCreateModal({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: () => base44.entities.Brand.list(), enabled: open });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list(), enabled: open });

  const reset = () => setForm(BLANK);
  const handleClose = (v) => { if (!v) reset(); onOpenChange(v); };

  const create = async () => {
    setSaving(true);
    try {
      const code = toVerticalCode(form.name);
      // A campaign is a vertical, ensure the Vertical record exists.
      const exists = verticals.some((v) => (v.code || '').toLowerCase() === code);
      if (code && !exists) {
        await base44.entities.Vertical.create({ code, name: form.name });
        qc.invalidateQueries({ queryKey: ['verticals'] });
      }
      await base44.entities.Campaign.create({
        name: form.name,
        vertical: code,
        brand: form.brand || null,
        send_mode: form.send_mode,
        status: 'active',
        active: true,
      });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created');
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.message || 'Create failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-popover border-border max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-[12px]">Campaign name *</Label>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. MVA" className="mt-1 bg-background" autoFocus />
            <p className="text-[11px] text-muted-foreground mt-1">The campaign name is the vertical.</p>
          </div>

          <div>
            <Label className="text-[12px]">Brand</Label>
            <SearchableSelect
              value={form.brand}
              onValueChange={(v) => setForm((p) => ({ ...p, brand: v }))}
              className="mt-1 bg-background"
              placeholder="Select brand…"
              options={brands.map((b) => ({ value: b.brand_code || b.brand_name, label: b.brand_name }))}
            />
          </div>

          <div>
            <Label className="text-[12px] mb-2 block">Method</Label>
            <div className="grid grid-cols-3 gap-2.5">
              {METHOD_OPTS.map((opt) => {
                const Icon = opt.icon;
                const active = form.send_mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, send_mode: opt.value }))}
                    className={`text-left p-3 rounded-lg border transition-all ${active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-accent/40'}`}
                  >
                    <Icon className={`w-4 h-4 mb-1.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="text-[13px] font-medium text-foreground">{opt.label}</div>
                    <div className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
          <Button onClick={create} disabled={!form.name || saving}>Create Campaign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}