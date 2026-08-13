import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import BuyerStatusPill from './BuyerStatusPill';
import { AlertTriangle } from 'lucide-react';
import { useRecomputeCoverage } from './useRecomputeCoverage';
import RecomputingIndicator from './RecomputingIndicator';
import BuyerOnboardingLink from './BuyerOnboardingLink';
import { BILLING_TYPE_OPTIONS as BILLING_TYPES } from '@/lib/billingTypes';
import { BUYER_TYPES } from '@/lib/buyerTypes';



// Editable form over a single Buyer record. buyer_code and status are shown
// read only. Save writes only the fields on this form.
export default function BuyerProfileTab({ buyer, verticals }) {
  const qc = useQueryClient();
  const { recomputing, scheduleRecompute } = useRecomputeCoverage();
  const [form, setForm] = useState(() => initForm(buyer));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(initForm(buyer)); }, [buyer]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    // client_type determines which coverage tier this buyer can win, so a
    // change to it must trigger a recompute after the save succeeds.
    const prevClientType = buyer.client_type || null;
    const nextClientType = form.client_type || null;
    const clientTypeChanged = prevClientType !== nextClientType;
    try {
      // Keep the primary vertical inside the additive verticals list so the
      // multi-select always reflects it, but the single `vertical` field stays
      // the driver of coverage/pricing/routing logic.
      const mergedVerticals = Array.from(new Set([form.vertical, ...(form.verticals || [])].filter(Boolean)));
      await base44.entities.Buyer.update(buyer.id, {
        company_name: form.company_name,
        contact_name: form.contact_name,
        client_type: form.client_type || null,
        vertical: form.vertical,
        verticals: mergedVerticals,
        billing_type: form.billing_type,
        verify_required: form.verify_required,
        ipl_fee_pct: Number(form.ipl_fee_pct) || 0,
        credit_limit: form.credit_limit === '' ? null : Number(form.credit_limit),
        leadbyte_bid: form.leadbyte_bid,
        email: form.email,
        phone: form.phone,
        location: form.location,
        billing_email: form.billing_email,
        notes: form.notes,
      });
      toast.success('Buyer saved');
      qc.invalidateQueries({ queryKey: ['op-buyers'] });
      if (clientTypeChanged) {
        // Use the buyer's current vertical for the recompute stamp.
        scheduleRecompute({ id: buyer.id, vertical: form.vertical || buyer.vertical });
      }
    } catch (err) {
      toast.error(`Could not save buyer: ${err?.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const unclassified = !form.client_type;

  return (
    <div className="space-y-5">
      {unclassified && (
        <div className="flex gap-2.5 rounded-lg border border-[hsl(38_80%_57%)]/40 bg-status-unsold p-3">
          <AlertTriangle className="w-4 h-4 status-unsold shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground/90 leading-relaxed">
            This buyer is unclassified. It counts toward state volume but can never win a coverage
            tier, so it will not open a state on its own. Setting a client type resolves it.
          </p>
        </div>
      )}

      {/* Read only identity */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Buyer Code">
          <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/40 font-mono text-[12px] text-muted-foreground">
            {buyer.buyer_code || 'Not allocated'}
          </div>
        </Field>
        <Field label="Status">
          <div className="h-9 flex items-center">
            <BuyerStatusPill status={buyer.status} />
          </div>
        </Field>
      </div>

      <BuyerOnboardingLink buyer={buyer} />

      <Field label="Buyer Name">
        <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} className="bg-background" />
      </Field>

      <Field label="Contact Name">
        <Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Primary contact person" className="bg-background" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Buyer Type">
          <Select value={form.client_type || 'none'} onValueChange={(v) => set('client_type', v === 'none' ? '' : v)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unclassified</SelectItem>
              {BUYER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Primary Vertical">
          <Select value={form.vertical || 'none'} onValueChange={(v) => set('vertical', v === 'none' ? '' : v)}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Select vertical" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {verticals.map((vt) => <SelectItem key={vt.code} value={vt.code}>{vt.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Connected Verticals / Campaigns">
        <MultiSelect
          value={form.verticals || []}
          onValueChange={(vals) => set('verticals', vals)}
          options={verticals.map((vt) => ({ value: vt.code, label: vt.name }))}
          placeholder="Select verticals"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          The primary vertical drives coverage &amp; pricing; these are additional verticals this buyer receives.
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Billing Type">
          <Select value={form.billing_type || 'prepay'} onValueChange={(v) => set('billing_type', v)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BILLING_TYPES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="LeadByte BID">
          <Input value={form.leadbyte_bid} onChange={(e) => set('leadbyte_bid', e.target.value)} className="bg-background font-mono text-[12px]" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="IPL Fee (multiplier)">
          <Input type="number" step="0.001" value={form.ipl_fee_pct} onChange={(e) => set('ipl_fee_pct', e.target.value)} className="bg-background font-mono tabular-nums" />
        </Field>
        <Field label="Credit Limit">
          <Input type="number" step="0.01" value={form.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} placeholder="No limit" className="bg-background font-mono tabular-nums" />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <div>
          <Label className="text-[13px]">Verification Required</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">Leads must pass verification before delivery.</p>
        </div>
        <Switch checked={!!form.verify_required} onCheckedChange={(v) => set('verify_required', v)} />
      </div>

      <div className="pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email">
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} className="bg-background" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="bg-background" />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} className="bg-background" />
          </Field>
          <Field label="Billing Email">
            <Input value={form.billing_email} onChange={(e) => set('billing_email', e.target.value)} className="bg-background" />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} className="bg-background" />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <RecomputingIndicator active={recomputing} />
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function initForm(buyer) {
  return {
    company_name: buyer.company_name || '',
    contact_name: buyer.contact_name || '',
    client_type: buyer.client_type || '',
    vertical: buyer.vertical || '',
    verticals: Array.isArray(buyer.verticals) ? buyer.verticals : (buyer.vertical ? [buyer.vertical] : []),
    billing_type: buyer.billing_type || 'prepay',
    verify_required: !!buyer.verify_required,
    ipl_fee_pct: buyer.ipl_fee_pct ?? 1,
    credit_limit: buyer.credit_limit ?? '',
    leadbyte_bid: buyer.leadbyte_bid || '',
    email: buyer.email || '',
    phone: buyer.phone || '',
    location: buyer.location || '',
    billing_email: buyer.billing_email || '',
    notes: buyer.notes || '',
  };
}