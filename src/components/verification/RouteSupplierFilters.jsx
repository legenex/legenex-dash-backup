import React from 'react';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';

const ROUTE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'direct', label: 'Direct' },
  { value: 'data', label: 'Data' },
  { value: 'event', label: 'Event' },
  { value: 'queue', label: 'Queue' },
];

const TYPE_OPTIONS = [
  { value: 'Internal', label: 'Internal' },
  { value: 'External', label: 'External' },
  { value: 'Calls', label: 'Calls' },
];

export function RouteSupplierFilters({ suppliers = [], filter_suppliers = [], filter_supplier_types = [], filter_routes = [], onChange }) {
  const supplierOptions = suppliers
    .filter(s => s.active !== false)
    .map(s => ({ value: s.name, label: s.name + (s.sid ? ` (${s.sid})` : '') }));

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-[12px]">Suppliers</Label>
        <p className="text-[11px] text-muted-foreground mb-1">Only run for these suppliers. Empty = all.</p>
        <MultiSelect
          value={filter_suppliers}
          onValueChange={v => onChange({ filter_suppliers: v })}
          options={supplierOptions}
          placeholder="All suppliers"
        />
      </div>
      <div>
        <Label className="text-[12px]">Supplier Types</Label>
        <MultiSelect
          value={filter_supplier_types}
          onValueChange={v => onChange({ filter_supplier_types: v })}
          options={TYPE_OPTIONS}
          placeholder="All types"
        />
      </div>
      <div>
        <Label className="text-[12px]">Lead Routes</Label>
        <p className="text-[11px] text-muted-foreground mb-1">Only run on these routes. Empty = Standard, Direct, Data.</p>
        <MultiSelect
          value={filter_routes}
          onValueChange={v => onChange({ filter_routes: v })}
          options={ROUTE_OPTIONS}
          placeholder="Standard, Direct, Data"
        />
      </div>
    </div>
  );
}

export default RouteSupplierFilters;