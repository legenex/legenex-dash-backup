import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import ConnectorConditionsEditor from '@/components/settings/ConnectorConditionsEditor';

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

const LEAD_ROUTE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'direct', label: 'Direct' },
  { value: 'data', label: 'Data' },
  { value: 'event', label: 'Event' },
  { value: 'queue', label: 'Queue' },
];

export default function ConnectorFilterPanel({ editing, onFieldChange, brandOptions, supplierOptions, supplierTypeOptions, customFields }) {
  const { data: calcs = [] } = useQuery({
    queryKey: ['custom-calculations'],
    queryFn: () => base44.entities.CustomCalculation.list(),
  });

  const toggleArrayValue = (field, value) => {
    const arr = parseJsonArray(editing[field]);
    const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
    onFieldChange(field, JSON.stringify(next));
  };

  const fieldOptions = [...new Set([
    ...customFields.map(f => f.field_name),
    ...calcs.map(c => c.output_token).filter(Boolean),
    'accident_date', 'accident_date_2', 'incident_date_3', 'has_attorney', 'phone_verified', 'hlr_status', 'hlr_score',
  ])];

  // Predefined value options for calculated fields (date buckets / value maps), keyed by output_token.
  const fieldValueOptions = {};
  for (const c of calcs) {
    if (!c.output_token) continue;
    let cfg = {};
    try { cfg = JSON.parse(c.config || '{}'); } catch {}
    let opts = [];
    if (c.transform_type === 'date_age_bucket') {
      if (Array.isArray(cfg.buckets)) opts = cfg.buckets.map(b => ({ value: b.label, label: b.label })).filter(o => o.value);
      if (cfg.fallback) opts.push({ value: cfg.fallback, label: cfg.fallback });
    } else if (c.transform_type === 'value_map' && cfg.map && typeof cfg.map === 'object') {
      opts = [...new Set(Object.values(cfg.map))].map(to => ({ value: to, label: to }));
    }
    if (opts.length > 0) fieldValueOptions[c.output_token] = opts;
  }

  const renderPills = (field, options) => {
    if (!options || options.length === 0) return <span className="text-[11px] text-muted-foreground">None configured</span>;
    return options.map(opt => {
      const value = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt : opt.label;
      const active = parseJsonArray(editing[field]).includes(value);
      return (
        <button key={value} onClick={() => toggleArrayValue(field, value)}
          className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${active ? 'bg-primary/20 text-primary border-primary/40' : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}>
          {label}
        </button>
      );
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-3">
        <div className="text-[13px] font-semibold text-foreground">Filters</div>
        <p className="text-[11px] text-muted-foreground">Empty = match all. Pills within each group are OR (lead matches ANY selected pill). All non-empty groups must match. Field conditions below are evaluated as a nested AND / OR group.</p>

        {/* Quick filter pills - inline flow, wraps naturally */}
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-medium text-muted-foreground mt-1.5 whitespace-nowrap">Brands</span>
            <div className="flex flex-wrap gap-1.5">{renderPills('filter_brands', brandOptions)}</div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-medium text-muted-foreground mt-1.5 whitespace-nowrap">Suppliers</span>
            <div className="flex flex-wrap gap-1.5">{renderPills('filter_suppliers', supplierOptions)}</div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-medium text-muted-foreground mt-1.5 whitespace-nowrap">Types</span>
            <div className="flex flex-wrap gap-1.5">{renderPills('filter_supplier_types', supplierTypeOptions)}</div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-medium text-muted-foreground mt-1.5 whitespace-nowrap">Routes</span>
            <div className="flex flex-wrap gap-1.5">{renderPills('filter_routes', LEAD_ROUTE_OPTIONS)}</div>
          </div>
        </div>

        {/* Field Conditions - separate section */}
        <div className="pt-3 border-t border-border">
          <Label className="text-[12px]">Field Conditions</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">Match against the enriched lead data including calculated fields. Combine conditions with AND or OR, and nest groups for more complex logic. Empty = no conditions.</p>
          <div className="mt-2">
            <ConnectorConditionsEditor
              value={editing.filter_conditions || '[]'}
              onChange={v => onFieldChange('filter_conditions', v)}
              fieldOptions={fieldOptions}
              fieldValueOptions={fieldValueOptions}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}