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
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import SupplierStatusPill from './SupplierStatusPill';
import { AlertTriangle } from 'lucide-react';

const PAYOUT_TYPES = ['None', 'Flat CPL', 'Profit %', 'Revenue %'];
const PERCENT_TYPES = ['Profit %', 'Revenue %'];

// Editable form over a single Supplier record. status is shown read only because
// status changes belong to the row actions and their confirm dialogs. Save
// writes only the fields on this form and never recalculates SupplierPayout.
export default function SupplierPayoutTab({ supplier }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => initForm(supplier));
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { setForm(initForm(supplier)); }, [supplier]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const isPercent = PERCENT_TYPES.includes(form.payout_type);
  const isFlat = form.payout_type === 'Flat CPL';
  const isNone = form.payout_type === 'None' || !form.payout_type;
  const payoutTypeChanged = (supplier.payout_type || 'None') !== (form.payout_type || 'None');

  const commitSave = async () => {
    setSaving(true);
    try {
      // payout_value: null when None, else a number. Percentages are clamped
      // to 0 to 100 at write time.
      let payoutValue = null;
      if (!isNone) {
        const n = Number(form.payout_value);
        payoutValue = Number.isFinite(n) ? n : 0;
        if (isPercent) payoutValue = Math.max(0, Math.min(100, payoutValue));
      }
      await base44.entities.Supplier.update(supplier.id, {
        name: form.name,
        supplier_type: form.supplier_type,
        payout_type: form.payout_type || 'None',
        payout_value: payoutValue,
        is_call_source: !!form.is_call_source,
        contact_name: form.contact_name,
        email: form.email,
        phone: form.phone,
        landing_page_url: form.landing_page_url,
        brand: form.brand,
      });
      toast.success('Supplier saved');
      qc.invalidateQueries({ queryKey: ['op-suppliers'] });
    } catch (err) {
      toast.error(`Could not save supplier: ${err?.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // If the payout type changed, warn before saving. Otherwise save directly.
  const onSave = () => {
    if (payoutTypeChanged) setConfirmOpen(true);
    else commitSave();
  };

  return (
    <div className="space-y-5">
      {/* Read only identity */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="SID">
          <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/40 font-mono text-[12px] text-muted-foreground">
            {supplier.sid || 'None'}
          </div>
        </Field>
        <Field label="Status">
          <div className="h-9 flex items-center">
            <SupplierStatusPill status={supplier.status} />
          </div>
        </Field>
      </div>

      <Field label="Supplier Name">
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} className="bg-background" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Supplier Type">
          <Select value={form.supplier_type || ''} onValueChange={(v) => set('supplier_type', v)}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Internal">Internal</SelectItem>
              <SelectItem value="External">External</SelectItem>
              <SelectItem value="Calls">Calls</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Brand">
          <Input value={form.brand} onChange={(e) => set('brand', e.target.value)} className="bg-background" />
        </Field>
      </div>

      {/* Payout configuration */}
      <div className="pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payout</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Payout Type">
            <Select value={form.payout_type || 'None'} onValueChange={(v) => set('payout_type', v)}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYOUT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {!isNone && (
            <Field label={isFlat ? 'Dollar amount per lead' : 'Percentage'}>
              <div className="relative">
                {isFlat && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>}
                <Input
                  type="number"
                  step={isFlat ? '0.01' : '1'}
                  min={isPercent ? 0 : undefined}
                  max={isPercent ? 100 : undefined}
                  value={form.payout_value}
                  onChange={(e) => set('payout_value', e.target.value)}
                  className={`bg-background font-mono tabular-nums ${isFlat ? 'pl-6' : 'pr-7'}`}
                />
                {isPercent && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>}
              </div>
            </Field>
          )}
        </div>
        {isPercent && (
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            This percentage applies to leads from this supplier across all of its sources, unless a
            source overrides it.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <div>
          <Label className="text-[13px]">Call Source</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">This supplier delivers inbound calls rather than form leads.</p>
        </div>
        <Switch checked={!!form.is_call_source} onCheckedChange={(v) => set('is_call_source', v)} />
      </div>

      {/* Contact */}
      <div className="pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact Name">
            <Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Primary contact person" className="bg-background" />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} className="bg-background" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="bg-background" />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Landing Page URL">
            <Input value={form.landing_page_url} onChange={(e) => set('landing_page_url', e.target.value)} className="bg-background" />
          </Field>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Payout'}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 status-unsold" />
              Change payout type?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Historical SupplierPayout records are not recalculated. Only future payouts use the new
              setting. Existing payouts keep the rate they were calculated with.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); setConfirmOpen(false); commitSave(); }}
              disabled={saving}
            >
              I understand, save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function initForm(supplier) {
  return {
    name: supplier.name || '',
    supplier_type: supplier.supplier_type || '',
    payout_type: supplier.payout_type || 'None',
    payout_value: supplier.payout_value ?? '',
    is_call_source: !!supplier.is_call_source,
    contact_name: supplier.contact_name || '',
    email: supplier.email || '',
    phone: supplier.phone || '',
    landing_page_url: supplier.landing_page_url || '',
    brand: supplier.brand || '',
  };
}