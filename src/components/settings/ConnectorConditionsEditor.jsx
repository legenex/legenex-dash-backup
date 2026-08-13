import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Plus, Trash2, Copy } from 'lucide-react';
import {
  OPERATOR_OPTIONS,
  VALUE_LESS_OPS,
  normalizeConditionTree,
  serializeConditionTree,
  cloneNode,
} from '@/lib/conditionGroups';

// Recursive AND/OR group builder. Receives a JSON string in `value`, normalizes
// it to the group shape on every render (so legacy flat records open cleanly),
// and always calls onChange with the serialized group tree. All edits are
// immutable: the tree is rebuilt by path, never mutated in place.
export default function ConnectorConditionsEditor({ value, onChange, fieldOptions = [], fieldValueOptions = {} }) {
  const root = normalizeConditionTree(value);

  const commit = (nextRoot) => onChange(serializeConditionTree(nextRoot));

  // Rebuild the tree, replacing the node at `path` (array of child indexes)
  // using the updater. An empty path targets the root.
  const setAtPath = (node, path, updater) => {
    if (path.length === 0) return updater(node);
    const [head, ...rest] = path;
    const children = Array.isArray(node.children) ? node.children : [];
    return {
      ...node,
      children: children.map((c, i) => (i === head ? setAtPath(c, rest, updater) : c)),
    };
  };

  // Mutate the children array of the group at `path`.
  const setChildrenAtPath = (path, childrenUpdater) => {
    const next = setAtPath(root, path, (group) => ({
      ...group,
      children: childrenUpdater(Array.isArray(group.children) ? group.children : []),
    }));
    commit(next);
  };

  return (
    <ConditionGroup
      group={root}
      path={[]}
      depth={0}
      isRoot
      fieldOptions={fieldOptions}
      fieldValueOptions={fieldValueOptions}
      setAtPath={(p, updater) => commit(setAtPath(root, p, updater))}
      setChildrenAtPath={setChildrenAtPath}
    />
  );
}

function newCondition() {
  return { type: 'condition', field: '', operator: 'equals', value: '' };
}
function newGroup() {
  return { type: 'group', match: 'all', name: '', children: [newCondition()] };
}

function ConditionGroup({ group, path, depth, isRoot, fieldOptions, fieldValueOptions, setAtPath, setChildrenAtPath }) {
  const children = Array.isArray(group.children) ? group.children : [];
  // Cap the indent so deep trees do not run off the right edge (stop after depth 4).
  const indentClass = depth > 0 ? (depth <= 4 ? 'pl-3 border-l border-border' : 'border-l border-border') : '';

  const setMatch = (match) => setAtPath(path, (g) => ({ ...g, match }));
  const setName = (name) => setAtPath(path, (g) => ({ ...g, name }));

  const addCondition = () => setChildrenAtPath(path, (kids) => [...kids, newCondition()]);
  const addGroup = () => setChildrenAtPath(path, (kids) => [...kids, newGroup()]);

  // Clone a child: deep copy and insert immediately after the original.
  const cloneChild = (i) => setChildrenAtPath(path, (kids) => {
    const copy = cloneNode(kids[i]);
    const next = [...kids];
    next.splice(i + 1, 0, copy);
    return next;
  });
  const deleteChild = (i) => setChildrenAtPath(path, (kids) => kids.filter((_, idx) => idx !== i));

  const opLabel = group.match === 'any' ? 'OR' : 'AND';

  return (
    <div className={`border border-border rounded-md p-2.5 space-y-2 bg-background ${indentClass}`}>
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
                  fieldValueOptions={fieldValueOptions}
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
              fieldValueOptions={fieldValueOptions}
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

function ConditionRow({ cond, onChange, onClone, onDelete, fieldOptions, fieldValueOptions }) {
  const fieldSelectOptions = (() => {
    const opts = fieldOptions.map((f) => ({ value: f, label: f }));
    // Ensure a stored field not in the option list still displays.
    if (cond.field && !opts.some((o) => o.value === cond.field)) opts.push({ value: cond.field, label: cond.field });
    return opts;
  })();

  const rawValueOpts = fieldValueOptions[cond.field];
  const valueOpts = rawValueOpts && rawValueOpts.length > 0 ? rawValueOpts : null;
  const valueDisabled = VALUE_LESS_OPS.includes(cond.operator);
  // Prepend a stored value not in the option list so it still displays.
  const effectiveValueOptions = valueOpts && cond.value && !valueOpts.some((o) => o.value === cond.value)
    ? [{ value: cond.value, label: cond.value }, ...valueOpts]
    : valueOpts;

  return (
    <div className="grid grid-cols-[1fr_130px_1fr_36px_36px] gap-2 items-center">
      <SearchableSelect
        value={cond.field || ''}
        onValueChange={(v) => onChange('field', v)}
        options={fieldSelectOptions}
        placeholder="field e.g. accident_date_2"
        className="font-mono text-[12px] h-9"
      />
      <SearchableSelect
        value={cond.operator || 'equals'}
        onValueChange={(v) => onChange('operator', v)}
        options={OPERATOR_OPTIONS}
        className="text-[12px] h-9"
      />
      {effectiveValueOptions ? (
        <SearchableSelect
          value={cond.value || ''}
          onValueChange={(v) => onChange('value', v)}
          options={effectiveValueOptions}
          placeholder="value..."
          disabled={valueDisabled}
          className="font-mono text-[12px] h-9"
        />
      ) : (
        <Input
          value={cond.value || ''}
          onChange={(e) => onChange('value', e.target.value)}
          placeholder="value e.g. 2_years"
          className="bg-background font-mono text-[12px] h-9"
          disabled={valueDisabled}
        />
      )}
      <Button variant="ghost" size="sm" onClick={onClone} className="h-9 w-9 p-0"><Copy className="w-3.5 h-3.5" /></Button>
      <Button variant="ghost" size="sm" onClick={onDelete} className="h-9 w-9 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
    </div>
  );
}