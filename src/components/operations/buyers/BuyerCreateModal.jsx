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
import { BUYER_TYPES } from '@/lib/buyerTypes';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';


const BILLING_TYPES = [
  { value: 'prepay', label: 'Prepay' },
  { value: 'invoiced_daily', label: 'Invoiced daily' },
  { value: 'invoiced_weekly', label: 'Invoiced weekly' },
  { value: 'invoiced_monthly', label: 'Invoiced monthly' },
];

function emptyForm() {
  return {
    company_name: '',
    client_type: '',
    vertical: '',
    billing_type: 'prepay',
    ipl_fee_pct: '1.0',
    verify_required: false,
    credit_limit: '',
    email: '',
    phone: '',
    location: '',
    billing_email: '',
    notes: '',
  };
}

// Create Buyer modal. Allocates a code first, then creates the draft Buyer.
// Never writes the active boolean (derived from status at the data layer).
export default function BuyerCreateModal({ open, onOpenChange, verticals, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setForm(emptyForm()); setSubmitting(false); } }, [open]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const canSubmit = form.company_name.trim() && form.client_type && form.vertical;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    // 1) Allocate the code. If this fails, no code was consumed.
    let allocatedCode;
    try {
      const res = await base44.functions.invoke('allocateBuyerCode', { client_type: form.client_type });
      allocatedCode = res?.data?.buyer_code;
      if (!allocatedCode) throw new Error(res?.data?.error || 'No code returned.');
    } catch (err) {
      toast.error(`Could not allocate a buyer code: ${err?.response?.data?.error || err?.message || 'unknown error'}`);
      setSubmitting(false);
      return;
    }

    // 2) Create the Buyer with the allocated code. If this fails, the code was
    // already consumed, so tell the operator rather than silently retrying.
    let created;
    try {
      created = await base44.entities.Buyer.create({
        company_name: form.company_name.trim(),
        client_type: form.client_type,
        vertical: form.vertical,
        billing_type: form.billing_type,
        ipl_fee_pct: Number(form.ipl_fee_pct) || 0,
        verify_required: !!form.verify_required,
        credit_limit: form.credit_limit === '' ? null : Number(form.credit_limit),
        email: form.email,
        phone: form.phone,
        location: form.location,
        billing_email: form.billing_email,
        notes: form.notes,
        buyer_code: allocatedCode,
        leadbyte_bid: allocatedCode,
        status: 'draft',
      });
    } catch (err) {
      toast.error(`Buyer creation failed after code ${allocatedCode} was allocated. That code has been consumed and will not be reused: ${err?.message || 'unknown error'}`);
      setSubmitting(false);
      return;
    }

    // Non-fatal: mint a per-buyer onboarding link. Buyer creation still
    // succeeds even if this step throws.
    try {
      await base44.functions.invoke('mintOnboardingLink', { buyer_id: created.id });
    } catch (err) {
      console.error('mintOnboardingLink failed', err);
    }

    toast.success(`Buyer created with code ${allocatedCode}. Set state coverage so it can receive leads.`);
    onOpenChange(false);
    onCreated?.(created);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Buyer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <Field label="Buyer Name" required>
            <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="Company name" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Buyer Type" required>
              <Select value={form.client_type} onValueChange={(v) => set('client_type', v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {BUYER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Vertical" required>
              <Select value={form.vertical} onValueChange={(v) => set('vertical', v)}>
                <SelectTrigger><SelectValue placeholder="Select vertical" /></SelectTrigger>
                <SelectContent>
                  {verticals.map((vt) => <SelectItem key={vt.code} value={vt.code}>{vt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Billing Type">
              <Select value={form.billing_type} onValueChange={(v) => set('billing_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_TYPES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="IPL Fee (multiplier)">
              <Input type="number" step="0.001" value={form.ipl_fee_pct} onChange={(e) => set('ipl_fee_pct', e.target.value)} className="font-mono tabular-nums" />
            </Field>
          </div>

          <Field label="Credit Limit">
            <Input type="number" step="0.01" value={form.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} placeholder="No limit" className="font-mono tabular-nums" />
          </Field>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
            <div>
              <Label className="text-[13px]">Verification Required</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Leads must pass verification before delivery.</p>
            </div>
            <Switch checked={!!form.verify_required} onCheckedChange={(v) => set('verify_required', v)} />
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
              <Field label="Location">
                <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
              </Field>
              <Field label="Billing Email">
                <Input value={form.billing_email} onChange={(e) => set('billing_email', e.target.value)} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Notes">
                <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? 'Creating...' : 'Create Buyer'}
          </Button>
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