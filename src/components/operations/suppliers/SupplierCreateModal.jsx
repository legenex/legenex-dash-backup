import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

const SUPPLIER_TYPES = ['Internal', 'External', 'Calls'];
const PAYOUT_TYPES = ['None', 'Flat CPL', 'Profit %', 'Revenue %'];
const PERCENT_PAYOUTS = ['Profit %', 'Revenue %'];

function emptyForm() {
  return {
    name: '',
    supplier_type: '',
    payout_type: 'None',
    payout_value: '',
    is_call_source: false,
    email: '',
    phone: '',
    landing_page_url: '',
    brand: '',
    notify_email: '',
    notify_whatsapp: '',
    notify_slack_channel: '',
    notify_on_state_change: true,
  };
}

// Create Supplier modal. Sibling of BuyerCreateModal. Creates the Supplier in
// status new. Never allocates a code (suppliers have no code sequence) and never
// writes the active boolean, which the data layer derives from status.
export default function SupplierCreateModal({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setForm(emptyForm()); setSubmitting(false); } }, [open]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const isPercentPayout = PERCENT_PAYOUTS.includes(form.payout_type);
  const showPayoutValue = form.payout_type !== 'None';

  // A supplier with no channel cannot be told when a state closes, and will keep
  // sending leads into closed states. At least one channel is mandatory.
  const hasChannel = Boolean(
    form.notify_email.trim() || form.notify_whatsapp.trim() || form.notify_slack_channel.trim()
  );

  const canSubmit = form.name.trim() && form.supplier_type && form.payout_type && hasChannel;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    let created;
    try {
      created = await base44.entities.Supplier.create({
        name: form.name.trim(),
        supplier_type: form.supplier_type,
        payout_type: form.payout_type,
        payout_value: showPayoutValue && form.payout_value !== '' ? Number(form.payout_value) : null,
        is_call_source: !!form.is_call_source,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        landing_page_url: form.landing_page_url.trim() || null,
        brand: form.brand.trim() || null,
        notify_email: form.notify_email.trim() || null,
        notify_whatsapp: form.notify_whatsapp.trim() || null,
        notify_slack_channel: form.notify_slack_channel.trim() || null,
        notify_on_state_change: !!form.notify_on_state_change,
        status: 'new',
      });
    } catch (err) {
      toast.error(`Supplier creation failed: ${err?.message || 'unknown error'}`);
      setSubmitting(false);
      return;
    }

    toast.success(`Supplier ${created.name} created. Define its sources so leads price correctly.`);
    onOpenChange(false);
    onCreated?.(created);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Supplier</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
          {/* Section one: Profile */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Profile</p>

            <Field label="Supplier Name" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Supplier name" />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Supplier Type" required>
                <Select value={form.supplier_type} onValueChange={(v) => set('supplier_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Payout Type" required>
                <Select value={form.payout_type} onValueChange={(v) => set('payout_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select payout" /></SelectTrigger>
                  <SelectContent>
                    {PAYOUT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {showPayoutValue && (
              <Field label={isPercentPayout ? 'Payout Percentage' : 'Payout Amount Per Lead'}>
                <div className="relative w-48">
                  {!isPercentPayout && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>}
                  <Input
                    type="number"
                    step={isPercentPayout ? '1' : '0.01'}
                    min={0}
                    max={isPercentPayout ? 100 : undefined}
                    value={form.payout_value}
                    onChange={(e) => set('payout_value', e.target.value)}
                    className={`font-mono tabular-nums ${isPercentPayout ? 'pr-7' : 'pl-6'}`}
                  />
                  {isPercentPayout && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {isPercentPayout ? 'Percentage from 0 to 100.' : 'Flat dollar amount paid per accepted lead.'}
                </p>
              </Field>
            )}

            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <Label className="text-[13px]">Call Source</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">This supplier delivers inbound calls rather than form leads.</p>
              </div>
              <Switch checked={!!form.is_call_source} onCheckedChange={(v) => set('is_call_source', v)} />
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email">
                  <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </Field>
                <Field label="Landing Page URL">
                  <Input value={form.landing_page_url} onChange={(e) => set('landing_page_url', e.target.value)} />
                </Field>
                <Field label="Brand">
                  <Input value={form.brand} onChange={(e) => set('brand', e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          {/* Section two: Notifications */}
          <div className="space-y-4 pt-1 border-t border-border">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-3">Notifications</p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Notify Email">
                <Input value={form.notify_email} onChange={(e) => set('notify_email', e.target.value)} placeholder="ops@example.com" />
              </Field>
              <Field label="Notify WhatsApp">
                <Input value={form.notify_whatsapp} onChange={(e) => set('notify_whatsapp', e.target.value)} placeholder="+1..." />
              </Field>
            </div>
            <Field label="Notify Slack Channel">
              <Input value={form.notify_slack_channel} onChange={(e) => set('notify_slack_channel', e.target.value)} placeholder="#supplier-alerts" />
            </Field>

            {!hasChannel && (
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[12px] text-foreground leading-relaxed">
                  Add at least one channel. A supplier with no channel cannot be told when a state closes, and will keep sending leads into closed states.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <Label className="text-[13px]">Notify On State Change</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Alert this supplier when a state opens or closes.</p>
              </div>
              <Switch checked={!!form.notify_on_state_change} onCheckedChange={(v) => set('notify_on_state_change', v)} />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {!hasChannel && (
            <p className="text-[11px] text-muted-foreground order-last sm:order-first sm:mr-auto">
              Save is disabled until at least one notification channel is filled in.
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <span title={!hasChannel ? 'Add at least one notification channel to enable save.' : undefined}>
              <Button onClick={submit} disabled={!canSubmit || submitting}>
                {submitting ? 'Creating...' : 'Create Supplier'}
              </Button>
            </span>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground">
        {label}{required && <span className="text-primary ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}