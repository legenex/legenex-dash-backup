import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Plus, Trash2 } from 'lucide-react';
import { OPERATOR_OPTIONS, VALUE_LESS_OPS } from '@/lib/conditionGroups';

// Flat AND list of { field, operator, value } conditions for one tier rule. All
// conditions within a rule must match (AND). Uses the exact operator set and
// field catalog the rest of the app uses. This is intentionally the flat shape,
// not the nested group tree, because tier_rules stores a plain conditions array.
export default function FlatConditionsEditor({ conditions, onChange, fieldOptions, fieldValueOptions }) {
  const rows = Array.isArray(conditions) ? conditions : [];

  const setRow = (i, key, val) => {
    const next = rows.map((c, idx) => (idx === i ? { ...c, [key]: val } : c));
    onChange(next);
  };
  const addRow = () => onChange([...rows, { field: '', operator: 'equals', value: '' }]);
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic">
          No conditions. This rule is an unconditional catch all and matches every lead.
        </p>
      )}
      {rows.map((cond, i) => {
        const fieldSelectOptions = (() => {
          const opts = fieldOptions.map((f) => ({ value: f, label: f }));
          if (cond.field && !opts.some((o) => o.value === cond.field)) opts.push({ value: cond.field, label: cond.field });
          return opts;
        })();
        const rawValueOpts = fieldValueOptions[cond.field];
        const valueOpts = rawValueOpts && rawValueOpts.length > 0 ? rawValueOpts : null;
        const valueDisabled = VALUE_LESS_OPS.includes(cond.operator);
        const effectiveValueOptions = valueOpts && cond.value && !valueOpts.some((o) => o.value === cond.value)
          ? [{ value: cond.value, label: cond.value }, ...valueOpts]
          : valueOpts;
        return (
          <div key={i} className="space-y-1">
            {i > 0 && <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pl-1">AND</div>}
            <div className="grid grid-cols-[1fr_120px_1fr_36px] gap-2 items-center">
              <SearchableSelect
                value={cond.field || ''}
                onValueChange={(v) => setRow(i, 'field', v)}
                options={fieldSelectOptions}
                placeholder="field e.g. state"
                className="font-mono text-[12px] h-9"
              />
              <SearchableSelect
                value={cond.operator || 'equals'}
                onValueChange={(v) => setRow(i, 'operator', v)}
                options={OPERATOR_OPTIONS}
                className="text-[12px] h-9"
              />
              {effectiveValueOptions ? (
                <SearchableSelect
                  value={cond.value || ''}
                  onValueChange={(v) => setRow(i, 'value', v)}
                  options={effectiveValueOptions}
                  placeholder="value..."
                  disabled={valueDisabled}
                  className="font-mono text-[12px] h-9"
                />
              ) : (
                <Input
                  value={cond.value || ''}
                  onChange={(e) => setRow(i, 'value', e.target.value)}
                  placeholder="value e.g. TX"
                  className="bg-background font-mono text-[12px] h-9"
                  disabled={valueDisabled}
                />
              )}
              <Button variant="ghost" size="sm" onClick={() => removeRow(i)} className="h-9 w-9 p-0 text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
      <Button size="sm" variant="outline" onClick={addRow} className="gap-1.5 h-8 text-[12px]">
        <Plus className="w-3.5 h-3.5" /> Add Condition
      </Button>
    </div>
  );
}