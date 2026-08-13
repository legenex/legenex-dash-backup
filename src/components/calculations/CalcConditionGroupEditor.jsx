import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Copy } from 'lucide-react';

// Calc operator vocabulary. Kept local and isolated from the delivery-side
// operators so the Deliveries / Conversion Events editors are untouched.
const CALC_OPERATOR_OPTIONS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'in', label: 'in (comma separated)' },
  { value: 'not_in', label: 'not in (comma separated)' },
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: 'does not exist' },
];

const CALC_VALUE_LESS_OPS = ['exists', 'not_exists'];

// Normalize a raw conditions value (legacy flat array, a group object, or
// null) into a group tree. A legacy array becomes an all-match group so it
// opens cleanly and is written back as a group on the next change.
function normalizeCalcTree(raw) {
  if (Array.isArray(raw)) {
    return {
      type: 'group',
      match: 'all',
      name: '',
      children: raw.map((c) => ({
        type: 'condition',
        field: c.field || '',
        operator: c.operator || 'equals',
        value: c.value ?? '',
      })),
    };
  }
  if (raw && typeof raw === 'object' && raw.type === 'group') return raw;
  return { type: 'group', match: 'all', name: '', children: [] };
}

// Normalize then recursively collect leaf condition nodes into a flat array,
// in order. Used by the page to validate that at least one field is set.
export function flattenCalcConditions(raw) {
  const root = normalizeCalcTree(raw);
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'condition') { out.push(node); return; }
    if (node.type === 'group') {
      (Array.isArray(node.children) ? node.children : []).forEach(walk);
    }
  };
  walk(root);
  return out;
}

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function newCondition() {
  return { type: 'condition', field: '', operator: 'equals', value: '' };
}
function newGroup() {
  return { type: 'group', match: 'all', name: '', children: [newCondition()] };
}

// Recursive AND/OR group builder for calculated field conditional rules.
// Receives a group object (or legacy array) in `value` and always calls
// onChange with a group OBJECT. All edits are immutable: the tree is rebuilt
// by path, never mutated in place, never stringified.
export default function CalcConditionGroupEditor({ value, onChange, fieldOptions = [], valueOptionsFor }) {
  const root = normalizeCalcTree(value);

  const setAtPath = (node, path, updater) => {
    if (path.length === 0) return updater(node);
    const [head, ...rest] = path;
    const children = Array.isArray(node.children) ? node.children : [];
    return {
      ...node,
      children: children.map((c, i) => (i === head ? setAtPath(c, rest, updater) : c)),
    };
  };

  const setChildrenAtPath = (path, childrenUpdater) => {
    const next = setAtPath(root, path, (group) => ({
      ...group,
      children: childrenUpdater(Array.isArray(group.children) ? group.children : []),
    }));
    onChange(next);
  };

  return (
    <ConditionGroup
      group={root}
      path={[]}
      depth={0}
      isRoot
      fieldOptions={fieldOptions}
      valueOptionsFor={valueOptionsFor}
      setAtPath={(p, updater) => onChange(setAtPath(root, p, updater))}
      setChildrenAtPath={setChildrenAtPath}
    />
  );
}

function ConditionGroup({ group, path, depth, isRoot, fieldOptions, valueOptionsFor, setAtPath, setChildrenAtPath }) {
  const children = Array.isArray(group.children) ? group.children : [];
  // Cap the indent so deep trees do not run off the right edge (stop after depth 4).
  const indentClass = depth > 0 ? (depth <= 4 ? 'pl-3 border-l border-border' : 'border-l border-border') : '';

  const setMatch = (match) => setAtPath(path, (g) => ({ ...g, match }));
  const setName = (name) => setAtPath(path, (g) => ({ ...g, name }));

  const addCondition = () => setChildrenAtPath(path, (kids) => [...kids, newCondition()]);
  const addGroup = () => setChildrenAtPath(path, (kids) => [...kids, newGroup()]);

  const cloneChild = (i) => setChildrenAtPath(path, (kids) => {
    const copy = cloneNode(kids[i]);
    const next = [...kids];
    next.splice(i + 1, 0, copy);
    return next;
  });
  const deleteChild = (i) => setChildrenAtPath(path, (kids) => kids.filter((_, idx) => idx !== i));

  const opLabel = group.match === 'any' ? 'OR' : 'AND';

  return (
    <div className={`border border-border rounded-md p-2.5 space-y-2 bg-muted/20 ${indentClass}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setMatch('all')}
            className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${group.match !== 'any' ? 'bg-primary/20 text-primary' : 'bg-card text-muted-foreground hover:text-foreground'}`}
          >
            AND
          </button>
          <button
            type="button"
            onClick={() => setMatch('any')}
            className={`px-2.5 py-1 text-[11px] font-semibold transition-colors border-l border-border ${group.match === 'any' ? 'bg-primary/20 text-primary' : 'bg-card text-muted-foreground hover:text-foreground'}`}
          >
            OR
          </button>
        </div>
        <Input
          value={group.name || ''}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="h-7 border-0 bg-transparent text-[12px] text-muted-foreground focus-visible:ring-0 px-1"
        />
      </div>

      {/* Children */}
      {children.map((child, i) => (
        <div key={i} className="space-y-2">
          {i > 0 && (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pl-1">{opLabel}</div>
          )}
          {child.type === 'group' ? (
            <div className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0">
                <ConditionGroup
                  group={child}
                  path={[...path, i]}
                  depth={depth + 1}
                  isRoot={false}
                  fieldOptions={fieldOptions}
                  valueOptionsFor={valueOptionsFor}
                  setAtPath={setAtPath}
                  setChildrenAtPath={setChildrenAtPath}
                />
              </div>
              <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                <Button variant="ghost" size="sm" onClick={() => cloneChild(i)} className="h-7 w-7 p-0"><Copy className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => deleteChild(i)} className="h-7 w-7 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ) : (
            <ConditionRow
              cond={child}
              onChange={(field, val) => setAtPath([...path, i], (c) => ({ ...c, [field]: val }))}
              onClone={() => cloneChild(i)}
              onDelete={() => deleteChild(i)}
              fieldOptions={fieldOptions}
              valueOptionsFor={valueOptionsFor}
            />
          )}
        </div>
      ))}

      {/* Footer */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button size="sm" variant="outline" onClick={addCondition} className="gap-1.5 h-8 text-[12px]">
          <Plus className="w-3.5 h-3.5" /> Add Condition
        </Button>
        <Button size="sm" variant="outline" onClick={addGroup} className="gap-1.5 h-8 text-[12px]">
          <Plus className="w-3.5 h-3.5" /> Add Group
        </Button>
      </div>
    </div>
  );
}

function ConditionRow({ cond, onChange, onClone, onDelete, fieldOptions, valueOptionsFor }) {
  const fieldSelectOptions = (() => {
    const opts = fieldOptions.map((f) => (typeof f === 'string' ? { value: f, label: f } : { value: f.value, label: f.label }));
    // Ensure a stored field not in the option list still displays.
    if (cond.field && !opts.some((o) => o.value === cond.field)) opts.push({ value: cond.field, label: cond.field });
    return opts;
  })();

  const valueDisabled = CALC_VALUE_LESS_OPS.includes(cond.operator);

  // Some fields have a known, closed set of legitimate values: a sid is one of
  // the supplier codes, an ssid is one of the supplier sources. Offering those
  // rather than a text box is the difference between a condition that matches
  // and one that silently never fires because of a typo.
  const knownValues = valueOptionsFor ? valueOptionsFor(cond.field) : null;
  const valueIsKnownSet = Array.isArray(knownValues) && knownValues.length > 0;
  const valueOptions = valueIsKnownSet && cond.value && !knownValues.some((o) => o.value === cond.value)
    ? [...knownValues, { value: cond.value, label: `${cond.value} (not a known value)` }]
    : knownValues;

  return (
    <div className="grid grid-cols-[1fr_130px_1fr_36px_36px] gap-2 items-center">
      <SearchableSelect
        value={cond.field || ''}
        onValueChange={(v) => onChange('field', v)}
        options={fieldSelectOptions}
        placeholder="Field…"
        className="text-[12px] h-9"
      />
      <Select value={cond.operator || 'equals'} onValueChange={(v) => onChange('operator', v)}>
        <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CALC_OPERATOR_OPTIONS.map((op) => (
            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {valueIsKnownSet && !valueDisabled ? (
        <SearchableSelect
          value={cond.value || ''}
          onValueChange={(v) => onChange('value', v)}
          options={valueOptions}
          placeholder="Value…"
          className="text-[12px] h-9"
        />
      ) : (
        <Input
          value={cond.value || ''}
          onChange={(e) => onChange('value', e.target.value)}
          placeholder="Value"
          className="bg-background text-[12px] h-9"
          disabled={valueDisabled}
        />
      )}
      <Button variant="ghost" size="sm" onClick={onClone} className="h-9 w-9 p-0"><Copy className="w-3.5 h-3.5" /></Button>
      <Button variant="ghost" size="sm" onClick={onDelete} className="h-9 w-9 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
    </div>
  );
}