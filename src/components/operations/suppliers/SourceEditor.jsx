import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useFieldCatalog } from './useFieldCatalog';
import { parseRules } from './tierRules';
import TieredPricingEditor from './TieredPricingEditor';

const PRICING_MODELS = [
  { value: 'none', label: 'None' },
  { value: 'flat_cpl', label: 'Flat CPL' },
  { value: 'profit_pct', label: 'Profit %' },
  { value: 'revenue_pct', label: 'Revenue %' },
  { value: 'tiered', label: 'Tiered (Rule/filter based)' },
];

// Create / edit editor for one SupplierSource. Renders inline inside the Sources
// tab. On save it writes only the SupplierSource record, storing null in the two
// pricing fields not in use. It never computes a SupplierPayout and never calls
// any state functions.
export default function SourceEditor({ supplier, source, existingCodes, onBack, onSaved }) {
  const { fieldOptions, fieldValueOptions } = useFieldCatalog();
  const isNew = !source?.id;

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => base44.entities.Brand.list(),
  });

  const [form, setForm] = useState(() => initForm(source));
  const [rules, setRules] = useState(() => parseRules(source?.tier_rules));
  const [sample, setSample] = useState({ state: '', accident_recency: '', accident_type: '' });
  const [saving, setSaving] = useState(false);
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    setForm(initForm(source));
    setRules(parseRules(source?.tier_rules));
    setCodeError('');
  }, [source]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const model = form.pricing_model;

  // Validate the code is not a duplicate for this supplier (uniqueness is
  // enforced at the entity level; this surfaces it cleanly before the write).
  const codeClashes = (() => {
    const code = (form.source_code || '').trim().toLowerCase();
    if (!code) return false;
    return existingCodes.some((c) => c.code.trim().toLowerCase() === code && c.id !== source?.id);
  })();

  const validate = () => {
    // Source code (SSID) is optional. When blank, this source resolves by brand.
    if (form.source_code.trim() && codeClashes) return `Source code "${form.source_code.trim()}" is already used by this supplier.`;
    if (!form.source_code.trim() && !form.brand.trim()) return 'Set a source code (SSID) or a brand so leads can resolve this source.';
    if (!model) return 'Pricing model is required.';
    if (model === 'profit_pct' && (form.profit_pct === '' || form.profit_pct == null)) return 'Profit % requires a percentage.';
    if (model === 'revenue_pct' && (form.revenue_pct === '' || form.revenue_pct == null)) return 'Revenue % requires a percentage.';
    if (model === 'flat_cpl' && (form.flat_cpl === '' || form.flat_cpl == null)) return 'Flat CPL requires a dollar amount.';
    if (model === 'tiered') {
      if (rules.length === 0) return 'Tiered pricing requires at least one rule.';
      if (rules.some((r) => r.price === '' || r.price == null)) return 'Every tier rule requires a price.';
    }
    return '';
  };

  const save = async () => {
    const err = validate();
    if (err) {
      if (codeClashes) setCodeError(err);
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        supplier_id: supplier.id,
        source_code: form.source_code.trim() || null,
        brand: form.brand.trim() || null,
        pricing_model: model,
        active: !!form.active,
        profit_pct: model === 'profit_pct' ? clampPct(form.profit_pct) : null,
        revenue_pct: model === 'revenue_pct' ? clampPct(form.revenue_pct) : null,
        flat_cpl: model === 'flat_cpl' ? Number(form.flat_cpl) : null,
        tier_rules: model === 'tiered'
          ? rules.map((r) => ({ conditions: (r.conditions || []).filter((c) => c.field), price: Number(r.price) }))
          : null,
      };
      if (isNew) await base44.entities.SupplierSource.create(payload);
      else await base44.entities.SupplierSource.update(source.id, payload);
      toast.success(isNew ? 'Source created' : 'Source saved');
      onSaved();
    } catch (e) {
      // Fallback for the entity level uniqueness constraint.
      const msg = e?.message || '';
      if (/uniqu|duplicate/i.test(msg)) {
        setCodeError(`Source code "${form.source_code.trim()}" is already used by this supplier.`);
        toast.error('That source code is already used by this supplier.');
      } else {
        toast.error(`Could not save source: ${msg || 'unknown error'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sources
      </button>

      <h3 className="text-[15px] font-semibold text-foreground">{isNew ? 'Add source' : 'Edit source'}</h3>

      <Field label="Source code (SSID), optional">
        <Input
          value={form.source_code}
          onChange={(e) => { set('source_code', e.target.value); setCodeError(''); }}
          placeholder="LGNX-DS"
          className={`bg-background font-mono text-[12px] ${codeError ? 'border-primary' : ''}`}
        />
        {codeError && <p className="text-[11px] text-primary mt-1">{codeError}</p>}
        <p className="text-[11px] text-muted-foreground mt-1">When a lead carries an ssid it matches here first. A supplier with one source can leave this blank.</p>
      </Field>

      <Field label="Brand, fallback match">
        <Select value={form.brand || '__none__'} onValueChange={(v) => set('brand', v === '__none__' ? '' : v)}>
          <SelectTrigger className="bg-background text-[12px]"><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {brands.map((b) => <SelectItem key={b.id} value={b.brand_name}>{b.brand_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1">Used when the lead has no ssid: the source whose brand equals the lead supplier_brand is selected.</p>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Payout model">
          <Select value={model} onValueChange={(v) => set('pricing_model', v)}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Select model" /></SelectTrigger>
            <SelectContent>
              {PRICING_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-end">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5 w-full">
            <Label className="text-[13px]">Active</Label>
            <Switch checked={!!form.active} onCheckedChange={(v) => set('active', v)} />
          </div>
        </div>
      </div>

      {/* Exactly one pricing control, driven by the model. */}
      {model === 'profit_pct' && (
        <Field label="Profit %">
          <div className="relative w-40">
            <Input
              type="number" step="1" min={0} max={100}
              value={form.profit_pct}
              onChange={(e) => set('profit_pct', e.target.value)}
              className="bg-background font-mono tabular-nums pr-7"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Percentage of profit, where profit is revenue minus cost.</p>
        </Field>
      )}

      {model === 'revenue_pct' && (
        <Field label="Revenue %">
          <div className="relative w-40">
            <Input
              type="number" step="1" min={0} max={100}
              value={form.revenue_pct}
              onChange={(e) => set('revenue_pct', e.target.value)}
              className="bg-background font-mono tabular-nums pr-7"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Percentage of revenue.</p>
        </Field>
      )}

      {model === 'flat_cpl' && (
        <Field label="Flat cost per lead">
          <div className="relative w-40">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
            <Input
              type="number" step="0.01"
              value={form.flat_cpl}
              onChange={(e) => set('flat_cpl', e.target.value)}
              className="bg-background font-mono tabular-nums pl-6"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Paid per accepted lead regardless of what the lead sells for.</p>
        </Field>
      )}

      {model === 'tiered' && (
        <TieredPricingEditor
          rules={rules}
          onChange={setRules}
          fieldOptions={fieldOptions}
          fieldValueOptions={fieldValueOptions}
          sample={sample}
          onSampleChange={setSample}
        />
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : (isNew ? 'Create Source' : 'Save Source')}</Button>
      </div>
    </div>
  );
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function initForm(source) {
  return {
    source_code: source?.source_code || '',
    brand: source?.brand || '',
    pricing_model: source?.pricing_model || '',
    active: source?.active !== false,
    profit_pct: source?.profit_pct ?? '',
    revenue_pct: source?.revenue_pct ?? '',
    flat_cpl: source?.flat_cpl ?? '',
  };
}