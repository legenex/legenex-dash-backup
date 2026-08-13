import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Plus, X, ArrowUp, ArrowDown, Copy, AlertTriangle } from 'lucide-react';
import { RULE_OPERATORS, ruleOperatorNeedsValue, emptySupplierRule, parseSupplierRules } from '@/lib/supplierRules';
import { useSupplierSourceOptions } from '@/hooks/useSupplierSourceOptions';
import { buildSupplierOptions, sourceOptionsForSid, supplierNameForSid } from '@/lib/supplierSourceOptions';

// Editor for supplier attribution rules, shared by the scheduled pull dialog
// and the Google Sheets inbound-calls builder so the two surfaces cannot drift.
//
// A call platform names traffic its own way: Ringba reports a publisher like
// CHECK-A-CASE-MVA, a buyer's report names the same traffic something else.
// Neither is our sid. These rules are the operator's translation table.
//
// The RESULT of a rule is picked, never typed. A supplier source is the ssid
// and it always belongs to exactly one supplier, so choosing the source sets
// the sid, the ssid and the supplier name together. Typing them separately is
// how a rule ends up with an ssid that belongs to no supplier: nothing rejects
// it, the call simply never joins and the money lands nowhere.
//
// Order is priority and the first match wins, so the reorder controls matter:
// a narrow rule has to sit above the broad one it would otherwise be swallowed
// by. That is why this is an ordered list rather than a set of key/value pairs.
export default function SupplierRulesEditor({
  value,
  onChange,
  fieldOptions = [],
  description,
}) {
  const { suppliers, sources, isLoading } = useSupplierSourceOptions();
  const rules = parseSupplierRules(value);

  // sid and ssid are two separate choices. A source belongs to exactly one
  // supplier, so the ssid list is scoped to whichever sid was picked; offering
  // every source at once would let an operator build a pairing that cannot
  // exist. ssid may be left blank, which means supplier level with no source.
  const supplierOptions = buildSupplierOptions(suppliers);

  const pickSupplier = (i, sid) => {
    const current = rules[i] || {};
    const stillValid = sourceOptionsForSid(sid, suppliers, sources)
      .some((o) => o.value === current.ssid);
    update(i, {
      sid,
      supplier_name: supplierNameForSid(sid, suppliers),
      // Clear a source that does not belong to the newly chosen supplier,
      // rather than leaving an impossible pairing behind.
      ssid: stillValid ? current.ssid : '',
    });
  };

  // Show a stored value the current lists do not contain, rather than silently
  // dropping it: a renamed source is worth seeing, not hiding.
  const withStored = (opts, stored, suffix) => (
    stored && !opts.some((o) => o.value === stored)
      ? [...opts, { value: stored, label: `${stored} ${suffix}` }]
      : opts
  );

  const emit = (next) => onChange(JSON.stringify(next));

  const update = (i, patch) => emit(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i) => emit(rules.filter((_, idx) => idx !== i));
  const add = () => emit([...rules, emptySupplierRule()]);
  // Insert the copy directly BELOW the original: order is priority here, so a
  // duplicate appended to the end would sit behind rules it should outrank.
  const duplicate = (i) => emit([...rules.slice(0, i + 1), { ...rules[i] }, ...rules.slice(i + 1)]);

  const move = (i, delta) => {
    const target = i + delta;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[i], next[target]] = [next[target], next[i]];
    emit(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-foreground">Supplier rules</div>
          <p className="text-[12px] text-muted-foreground mt-0.5 max-w-[560px]">
            {description || 'Translate what the source calls the traffic into our supplier. First matching rule wins, so put the narrow rules above the broad ones. A call that matches nothing is left unattributed rather than guessed at.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={add} className="gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> Add rule
        </Button>
      </div>

      {rules.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-6 text-center">
          <div className="text-[13px] text-muted-foreground">
            No rules yet. Without one, calls arrive with no supplier credited and show as unattributed.
          </div>
        </div>
      )}

      {rules.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {rules.map((rule, i) => (
            <div key={i} className="p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-semibold text-muted-foreground/70 w-5 shrink-0">
                  {i + 1}
                </span>
                <span className="text-[12px] text-muted-foreground shrink-0">If</span>
                {fieldOptions.length > 0 ? (
                  <SearchableSelect
                    value={rule.field || ''}
                    onValueChange={(v) => update(i, { field: v })}
                    className="w-[170px] bg-background"
                    options={fieldOptions}
                    placeholder="Field"
                  />
                ) : (
                  <Input
                    value={rule.field || ''}
                    onChange={(e) => update(i, { field: e.target.value })}
                    placeholder="Field, e.g. publisher"
                    className="w-[170px] bg-background font-mono text-[12px]"
                  />
                )}
                <SearchableSelect
                  value={rule.operator || 'contains'}
                  onValueChange={(v) => update(i, { operator: v })}
                  className="w-[150px] bg-background"
                  options={RULE_OPERATORS}
                />
                {ruleOperatorNeedsValue(rule.operator) && (
                  <Input
                    value={rule.value || ''}
                    onChange={(e) => update(i, { value: e.target.value })}
                    placeholder="e.g. CHECK-A-CASE"
                    className="flex-1 min-w-[160px] bg-background"
                  />
                )}
                <div className="flex items-center gap-0.5 ml-auto shrink-0">
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move rule up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    disabled={i === rules.length - 1} onClick={() => move(i, 1)} aria-label="Move rule down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => duplicate(i)} aria-label="Duplicate rule"
                    title="Duplicate this rule"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                    onClick={() => remove(i)} aria-label="Remove rule"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap pl-7">
                <span className="text-[12px] text-muted-foreground shrink-0">then credit</span>
                <SearchableSelect
                  value={rule.sid || ''}
                  onValueChange={(v) => pickSupplier(i, v)}
                  className="w-[220px] bg-background"
                  options={withStored(supplierOptions, rule.sid, '(unknown supplier)')}
                  placeholder={isLoading ? 'Loading...' : 'Supplier (sid)'}
                  emptyText="No suppliers. Create them in Operations, Suppliers."
                />
                <SearchableSelect
                  value={rule.ssid || ''}
                  onValueChange={(v) => update(i, { ssid: v })}
                  className="w-[240px] bg-background"
                  options={withStored(sourceOptionsForSid(rule.sid, suppliers, sources), rule.ssid, '(unknown source)')}
                  placeholder={rule.sid ? 'Source (ssid), optional' : 'Pick a supplier first'}
                  disabled={!rule.sid}
                  emptyText="This supplier has no sources."
                />
                {rule.ssid && (
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 text-[11px] text-muted-foreground"
                    onClick={() => update(i, { ssid: '' })}
                  >
                    Clear source
                  </Button>
                )}
                {/* A rule that matches traffic but credits nobody is legal and
                    sometimes deliberate, so it is flagged rather than blocked. */}
                {!rule.sid && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] status-unsold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Credits nobody
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
