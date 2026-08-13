import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ChevronUp, ChevronDown, Info, AlertTriangle } from 'lucide-react';
import FlatConditionsEditor from './FlatConditionsEditor';
import { firstMatchIndex, hasCatchAll } from './tierRules';

// Editor for the tier_rules array. Order is explicit: rules are numbered and
// reorderable, with a persistent note that the first matching rule wins. A live
// preview and a catch all warning make fallthrough visible.
export default function TieredPricingEditor({ rules, onChange, fieldOptions, fieldValueOptions, sample, onSampleChange }) {
  const list = Array.isArray(rules) ? rules : [];

  const setRule = (i, patch) => onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => onChange([...list, { conditions: [], price: '' }]);
  const removeRule = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const appendCatchAll = () => onChange([...list, { conditions: [], price: '' }]);

  // Build the sample lead the preview evaluates against. The three inputs map
  // onto the real field names rules use: state -> state, accident type ->
  // accident_type, and the recency bucket onto every field referenced by a rule
  // that is not state or accident_type (typically a date_age_bucket calc token
  // such as accident_date_2). This lets a bucket rule preview without asking the
  // operator to know the exact token name.
  const sampleLead = useMemo(() => {
    const lead = { state: sample.state || '', accident_type: sample.accident_type || '' };
    for (const rule of list) {
      for (const c of (Array.isArray(rule.conditions) ? rule.conditions : [])) {
        if (c.field && c.field !== 'state' && c.field !== 'accident_type' && !(c.field in lead)) {
          lead[c.field] = sample.accident_recency || '';
        }
      }
    }
    return lead;
  }, [list, sample]);

  const matchIdx = useMemo(() => firstMatchIndex(list, sampleLead), [list, sampleLead]);
  const catchAll = hasCatchAll(list);
  const matched = matchIdx >= 0 ? list[matchIdx] : null;
  const previewPrice = matched && matched.price !== '' && matched.price != null ? Number(matched.price) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
        <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Rules are evaluated top down and the first matching rule wins. All conditions within a rule must match.
        </p>
      </div>

      {list.length === 0 && (
        <p className="text-[12px] text-muted-foreground italic">No rules yet. Add at least one rule to price this source.</p>
      )}

      {list.map((rule, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/15 text-primary font-mono text-[12px] font-semibold shrink-0">{i + 1}</span>
            <span className="text-[12px] font-medium text-foreground">Rule {i + 1}</span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} className="h-7 w-7 p-0"><ChevronUp className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="h-7 w-7 p-0"><ChevronDown className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => removeRule(i)} className="h-7 w-7 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          <FlatConditionsEditor
            conditions={rule.conditions}
            onChange={(next) => setRule(i, { conditions: next })}
            fieldOptions={fieldOptions}
            fieldValueOptions={fieldValueOptions}
          />

          <div className="grid grid-cols-[120px_1fr] gap-2 items-center pt-1">
            <Label className="text-[12px] text-muted-foreground">Price</Label>
            <div className="relative w-40">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                value={rule.price ?? ''}
                onChange={(e) => setRule(i, { price: e.target.value })}
                className="bg-background font-mono tabular-nums pl-6"
              />
            </div>
          </div>
        </div>
      ))}

      <Button size="sm" variant="outline" onClick={addRule} className="gap-1.5 h-8 text-[12px]">
        <Plus className="w-3.5 h-3.5" /> Add Rule
      </Button>

      {/* Catch all warning */}
      {list.length > 0 && !catchAll && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[hsl(38_80%_57%)]/40 bg-status-unsold p-3">
          <AlertTriangle className="w-4 h-4 status-unsold shrink-0 mt-0.5" />
          <div className="text-[12px] text-foreground/90 leading-relaxed">
            <p>The last rule has conditions, so some leads will not match any rule and will price at zero.</p>
            <Button size="sm" variant="outline" onClick={appendCatchAll} className="mt-2 h-7 text-[11px]">
              Append catch all rule
            </Button>
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live price preview</p>
        <div className="grid grid-cols-3 gap-2">
          <PreviewField label="Sample state" value={sample.state} onChange={(v) => onSampleChange({ ...sample, state: v })} placeholder="TX" />
          <PreviewField label="Accident recency" value={sample.accident_recency} onChange={(v) => onSampleChange({ ...sample, accident_recency: v })} placeholder="2_years" />
          <PreviewField label="Accident type" value={sample.accident_type} onChange={(v) => onSampleChange({ ...sample, accident_type: v })} placeholder="rear_end" />
        </div>
        {matchIdx >= 0 ? (
          <p className="text-[12px] text-foreground">
            Rule <span className="font-mono font-semibold text-primary">{matchIdx + 1}</span> matches first and prices this lead at{' '}
            <span className="font-mono font-semibold tabular-nums status-sold">
              {previewPrice == null ? 'no price set' : `$${previewPrice.toFixed(2)}`}
            </span>.
          </p>
        ) : (
          <p className="text-[12px] status-unsold">
            No rule matches this sample. The lead would price at zero.
          </p>
        )}
      </div>
    </div>
  );
}

function PreviewField({ label, value, onChange, placeholder }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-background font-mono text-[12px] h-8" />
    </div>
  );
}