import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import ToolsShell from '@/components/tools/ToolsShell';
import { Tag } from '@/components/tools/toolsUi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Calculator, GripVertical, ArrowDownUp } from 'lucide-react';
import { toast } from 'sonner';
import { OutputFieldPicker } from '@/components/calculations/OutputFieldPicker';
import CalcConditionGroupEditor, { flattenCalcConditions } from '@/components/calculations/CalcConditionGroupEditor';
import { useSupplierSourceOptions } from '@/hooks/useSupplierSourceOptions';
import ReferenceKeyPanel from '@/components/calculations/ReferenceKeyPanel';
import ImportExportDialog from '@/components/shared/ImportExportDialog';

const DEFAULT_DATE_BUCKETS = [
  { label: 'Within 7 Days', max_days: 7 },
  { label: 'Within 14 Days', max_days: 14 },
  { label: 'Within 30 Days', max_days: 30 },
  { label: 'Within 3 Months', max_days: 90 },
  { label: 'Within 6 Months', max_days: 180 },
  { label: 'Within 12 Months', max_days: 365 },
  { label: 'Within 18 Months', max_days: 545 },
  { label: 'Within 24 Months', max_days: 730 },
];

const BLANK_FORM = {
  output_token: '',
  output_label: '',
  transform_type: 'value_map',
  vertical: '',
  input_field: '',
  enabled: true,
  sort_order: 0,
  buckets: DEFAULT_DATE_BUCKETS.map(b => ({ ...b })),
  fallback: 'Over 24 Months',
  date_format: 'MM/DD/YYYY',
  value_map: [{ from: '', to: '' }],
  conditional_rules: [{ conditions: [{ field: '', operator: 'equals', value: '' }], output: '' }],
  conditional_fallback: '',
  script: `// Available variables:\n// value - the raw input field value\n// lead - the full lead payload object\n// Return the computed output value.\n\nreturn value;`,
};

const CONDITION_FIELD_CONTEXT = [
  { value: 'supplier_type', label: 'Supplier Type' },
  { value: 'sid', label: 'Supplier SID' },
  { value: 'ssid', label: 'Supplier SubID (SSID)' },
  { value: 'final_status', label: 'Final Status' },
  { value: 'supplier_name', label: 'Supplier Name' },
  { value: 'brand', label: 'Brand' },
];

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'in', label: 'in (comma separated)' },
  { value: 'not_in', label: 'not in (comma separated)' },
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: 'does not exist' },
];

// AI-suggested calculated fields. "Add" opens the editor prefilled with the suggestion.
const SUGGESTED_FIELDS = [
  {
    token: 'campaign', label: 'Campaign', formula: 'MAP(optin_url, {...})',
    description: 'Derive a campaign name from the optin/landing URL.',
    prefill: { output_token: 'campaign', output_label: 'Campaign', transform_type: 'value_map', input_field: 'optin_url' },
  },
  {
    token: 'lead_age_days', label: 'Lead age days', formula: 'DAYS_BETWEEN(incident_date, NOW())',
    description: 'Days elapsed since the incident date, for routing and reports.',
    prefill: { output_token: 'lead_age_days', output_label: 'Lead Age (days)', transform_type: 'date_age_bucket', input_field: 'incident_date' },
  },
  {
    token: 'quality_score', label: 'Quality score', formula: 'SCORE(phone_valid, email_valid, injury_type, has_attorney)',
    description: 'Composite quality score from verification and case attributes.',
    prefill: { output_token: 'quality_score', output_label: 'Quality Score', transform_type: 'script', input_field: 'phone_verified' },
  },
];

function formToRecord(form) {
  let config = {};
  if (form.transform_type === 'date_age_bucket') {
    config = { buckets: form.buckets, fallback: form.fallback, date_format: form.date_format };
  } else if (form.transform_type === 'value_map') {
    const map = {};
    form.value_map.forEach(r => { if (r.from) map[r.from] = r.to; });
    config = { map };
  } else if (form.transform_type === 'clone') {
    config = {};
  } else if (form.transform_type === 'conditional') {
    config = {
      rules: form.conditional_rules
        .filter(r => (r.output || '').trim() !== '' && flattenCalcConditions(r.conditions).some(c => (c.field || '').trim() !== ''))
        .map(r => ({
          conditions: r.conditions,
          output: r.output,
        })),
      fallback: form.conditional_fallback,
    };
  } else {
    config = { script: form.script };
  }
  return {
    output_token: form.output_token,
    output_label: form.output_label || form.output_token,
    transform_type: form.transform_type,
    vertical: form.vertical || '',
    input_field: form.transform_type === 'conditional' ? '' : form.input_field,
    enabled: form.enabled,
    sort_order: form.sort_order,
    config: JSON.stringify(config),
  };
}

function recordToForm(rec) {
  let cfg = {};
  try { cfg = JSON.parse(rec.config || '{}'); } catch {}
  return {
    output_token: rec.output_token || '',
    output_label: rec.output_label || '',
    transform_type: rec.transform_type || 'date_age_bucket',
    vertical: rec.vertical || '',
    input_field: rec.input_field || '',
    enabled: rec.enabled !== false,
    sort_order: rec.sort_order || 0,
    buckets: cfg.buckets || DEFAULT_DATE_BUCKETS.map(b => ({ ...b })),
    fallback: cfg.fallback || 'Over 24 Months',
    date_format: cfg.date_format || 'MM/DD/YYYY',
    value_map: cfg.map ? Object.entries(cfg.map).map(([from, to]) => ({ from, to })) : [{ from: '', to: '' }],
    conditional_rules: (rec.transform_type === 'conditional' && Array.isArray(cfg.rules) && cfg.rules.length)
      ? cfg.rules
      : [{ conditions: [{ field: '', operator: 'equals', value: '' }], output: '' }],
    conditional_fallback: rec.transform_type === 'conditional' ? (cfg.fallback || '') : '',
    script: cfg.script || BLANK_FORM.script,
  };
}

export default function CustomCalculations() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [deleteId, setDeleteId] = useState(null);
  const [ioOpen, setIoOpen] = useState(false);

  const { data: calcs = [] } = useQuery({
    queryKey: ['custom-calculations'],
    // No 50-row cap: a silent truncation here reads as a calculated field having
    // disappeared from the page.
    queryFn: () => base44.entities.CustomCalculation.list('sort_order', 500),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const { data: verticals = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.filter({ active: true }, 'sort_order', 100),
  });
  const verticalName = (code) => verticals.find(v => v.code === code)?.name || code;

  const inboundFields = customFields.filter(f => (f.source === 'inbound' || !f.source) && f.field_type !== 'Calculated');

  // Parse dropdown options from a CustomField's options string (JSON array or comma-separated)
  const parseDropdownOptions = (optStr) => {
    if (!optStr) return [];
    try {
      const parsed = JSON.parse(optStr);
      if (Array.isArray(parsed)) return parsed.map(v => String(v)).filter(Boolean);
    } catch {}
    return String(optStr).split(',').map(v => v.trim()).filter(Boolean);
  };

  const inputFieldObj = customFields.find(f => f.field_name === form.input_field);
  const inputDropdownOptions = inputFieldObj?.field_type === 'dropdown' ? parseDropdownOptions(inputFieldObj.options) : [];

  // Auto-populate value_map rows from the input field's dropdown options
  useEffect(() => {
    if (form.transform_type !== 'value_map' || !inputDropdownOptions.length) return;
    setForm(f => {
      const currentFroms = f.value_map.map(r => r.from).filter(Boolean);
      const matches = currentFroms.length === inputDropdownOptions.length &&
        inputDropdownOptions.every((v, i) => currentFroms[i] === v);
      if (matches) return f;
      return {
        ...f,
        value_map: inputDropdownOptions.map(v => {
          const existing = f.value_map.find(r => r.from === v);
          return existing || { from: v, to: '' };
        }),
      };
    });
  }, [form.input_field, form.transform_type]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editId) return base44.entities.CustomCalculation.update(editId, data);
      return base44.entities.CustomCalculation.create(data);
    },
    onSuccess: async () => {
      // Sync output_token as a Calculated CustomField so it appears in payload builder.
      //
      // Re-read the field list rather than trusting the cached one: a stale list
      // is how duplicate Calculated fields got created for the same token.
      try {
        let current = customFields;
        try { current = await base44.entities.CustomField.list(); } catch { /* fall back to cache */ }
        const token = String(form.output_token || '').trim();
        const matches = (current || []).filter(f => f.field_name === token);
        const existing = matches[0];
        if (!existing) {
          await base44.entities.CustomField.create({
            field_name: token,
            label: form.output_label || token,
            field_type: 'Calculated',
            source: 'inbound',
            include_in_leadbyte: true,
            leadbyte_field_name: token,
            // NOT auto_created: an operator deliberately created this. Flagging it
            // Auto put it in the auto-detected review queue, where it read as
            // something the system guessed rather than something you built.
            auto_created: false,
          });
        } else {
          const patch = {};
          if (existing.field_type !== 'Calculated') patch.field_type = 'Calculated';
          if (existing.auto_created) patch.auto_created = false;
          if (Object.keys(patch).length) await base44.entities.CustomField.update(existing.id, patch);
          // Clean up duplicates for the same token created by earlier stale reads.
          for (const dupe of matches.slice(1)) {
            try { await base44.entities.CustomField.delete(dupe.id); } catch { /* best effort */ }
          }
        }
      } catch (e) { /* field may already exist (e.g. created inline) - ignore */ }
      qc.invalidateQueries({ queryKey: ['custom-calculations'] });
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setOpen(false);
      toast.success(editId ? 'Calculated field updated' : 'Calculated field created');
    },
    onError: (err) => {
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
    },
  });

  // Deleting a calculation used to leave its Calculated CustomField behind. The
  // orphan still showed in Settings, Custom Fields with type Calculated and no
  // formula anywhere, so the field looked like it had silently vanished from the
  // Calculated Fields page. Delete the pair, or the catalogue lies.
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const row = (calcs || []).find(c => c.id === id);
      await base44.entities.CustomCalculation.delete(id);
      const token = String(row?.output_token || '').trim();
      if (!token) return;
      // Only remove the paired field if nothing else still computes that token.
      const others = (calcs || []).filter(c => c.id !== id && String(c.output_token || '').trim() === token);
      if (others.length > 0) return;
      try {
        const fields = await base44.entities.CustomField.list();
        for (const f of (fields || []).filter(f => f.field_name === token && f.field_type === 'Calculated')) {
          await base44.entities.CustomField.delete(f.id);
        }
      } catch { /* best effort: the calculation is already gone */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-calculations'] });
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setDeleteId(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.CustomCalculation.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries(['custom-calculations']),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds) => {
      const updates = orderedIds.map((id, idx) => ({ id, sort_order: idx }));
      return base44.entities.CustomCalculation.bulkUpdate(updates);
    },
    onError: () => qc.invalidateQueries({ queryKey: ['custom-calculations'] }),
  });

  function onDragEnd(result) {
    if (!result.destination || result.destination.index === result.source.index) return;
    const from = result.source.index;
    const to = result.destination.index;
    const ordered = [...calcs];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    qc.setQueryData(['custom-calculations'], ordered);
    reorderMutation.mutate(ordered.map(c => c.id));
  }

  function openNew() {
    setEditId(null);
    setForm({ ...BLANK_FORM, buckets: DEFAULT_DATE_BUCKETS.map(b => ({ ...b })) });
    setOpen(true);
  }

  function openEdit(rec) {
    setEditId(rec.id);
    setForm(recordToForm(rec));
    setOpen(true);
  }

  function addSuggestion(s) {
    setEditId(null);
    setForm({ ...BLANK_FORM, buckets: DEFAULT_DATE_BUCKETS.map(b => ({ ...b })), ...s.prefill });
    setOpen(true);
  }

  function setF(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function updateBucket(i, key, val) {
    setForm(f => {
      const buckets = [...f.buckets];
      buckets[i] = { ...buckets[i], [key]: key === 'max_days' ? Number(val) : val };
      return { ...f, buckets };
    });
  }

  function addBucket() {
    setForm(f => ({ ...f, buckets: [...f.buckets, { label: '', max_days: 0 }] }));
  }

  function removeBucket(i) {
    setForm(f => ({ ...f, buckets: f.buckets.filter((_, idx) => idx !== i) }));
  }

  function updateMapRow(i, key, val) {
    setForm(f => {
      const value_map = [...f.value_map];
      value_map[i] = { ...value_map[i], [key]: val };
      return { ...f, value_map };
    });
  }

  function addMapRow() { setForm(f => ({ ...f, value_map: [...f.value_map, { from: '', to: '' }] })); }
  function removeMapRow(i) { setForm(f => ({ ...f, value_map: f.value_map.filter((_, idx) => idx !== i) })); }

  function addRule() {
    setForm(f => ({ ...f, conditional_rules: [...f.conditional_rules, { conditions: [{ field: '', operator: 'equals', value: '' }], output: '' }] }));
  }

  function removeRule(ruleIndex) {
    setForm(f => ({ ...f, conditional_rules: f.conditional_rules.filter((_, idx) => idx !== ruleIndex) }));
  }

  function updateRuleOutput(ruleIndex, value) {
    setForm(f => {
      const conditional_rules = [...f.conditional_rules];
      conditional_rules[ruleIndex] = { ...conditional_rules[ruleIndex], output: value };
      return { ...f, conditional_rules };
    });
  }

  function updateRuleConditions(ruleIndex, tree) {
    setForm(f => {
      const conditional_rules = [...f.conditional_rules];
      conditional_rules[ruleIndex] = { ...conditional_rules[ruleIndex], conditions: tree };
      return { ...f, conditional_rules };
    });
  }

  const conditionFieldOptions = [
    ...CONDITION_FIELD_CONTEXT,
    ...customFields.map(f => ({ value: f.field_name, label: f.label || f.field_name })),
  ];

  // Suppliers and their sources, read from the one shared source of truth.
  const { suppliers: supplierRuleSuppliers, sources: supplierRuleSources } = useSupplierSourceOptions();

  // A sid, an ssid and a supplier name are not free text: they are the codes
  // created in Operations under a supplier. Offering them stops a condition
  // that looks right but never fires because the code was typed slightly wrong.
  const calcValueOptionsFor = (field) => {
    const f = String(field || '').toLowerCase();
    if (f === 'sid') {
      return (supplierRuleSuppliers || [])
        .filter((s) => s.sid)
        .map((s) => ({ value: s.sid, label: `${s.sid}  \u00b7  ${s.name}` }));
    }
    if (f === 'ssid' || f === 'source_code' || f === 'supplier_subid') {
      return (supplierRuleSources || [])
        .filter((s) => s.source_code)
        .map((s) => ({ value: s.source_code, label: s.source_code }));
    }
    if (f === 'supplier_name') {
      return (supplierRuleSuppliers || [])
        .filter((s) => s.name)
        .map((s) => ({ value: s.name, label: s.name }));
    }
    return null;
  };

  const conditionalValid =
    form.transform_type === 'conditional' &&
    form.conditional_rules.some(r => (r.output || '').trim() !== '' && flattenCalcConditions(r.conditions).some(c => (c.field || '').trim() !== ''));

  const typeLabels = { date_age_bucket: 'Date Transformer', value_map: 'Value Map', clone: 'Clone', script: 'Script' };
  const existingTokens = new Set(calcs.map(c => c.output_token));

  return (
    <ToolsShell
      title="Calculated Fields"
      subtitle="Derived fields computed on ingest, used in routing and reports."
      actions={
        <>
          <Button onClick={() => setIoOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <ArrowDownUp className="w-4 h-4" /> Import / Export
          </Button>
          <Button onClick={openNew} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> New Field
          </Button>
        </>
      }
    >
      {/* Top chips */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Tag tone="primary">{calcs.length} field{calcs.length !== 1 ? 's' : ''} defined</Tag>
        <Tag tone="neutral">evaluated on ingest</Tag>
      </div>

      <ImportExportDialog
        open={ioOpen}
        onOpenChange={setIoOpen}
        entityName="CustomCalculation"
        records={calcs}
        matchKey="output_token"
        labelKey="output_label"
        exportPrefix="calculated-fields"
        queryKeys={[['custom-calculations']]}
        title="Import / Export Calculated Fields"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Defined Fields table */}
          <div className="rounded-[10px] border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-[13px] font-semibold text-foreground">Defined Fields</div>
            {calcs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Calculator className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <div className="text-[13px] font-medium text-foreground">No calculated fields</div>
                <div className="text-[12px] text-muted-foreground mt-1">Create one to transform inbound fields on ingest.</div>
              </div>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="calcs">
                  {(provided) => (
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-[13px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          {['Field', 'Formula', 'Status', ''].map((h, i) => (
                            <th key={i} className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody ref={provided.innerRef} {...provided.droppableProps} className="divide-y divide-border">
                        {calcs.map((rec, index) => (
                          <Draggable key={rec.id} draggableId={rec.id} index={index}>
                            {(prov) => (
                              <tr ref={prov.innerRef} {...prov.draggableProps} className="hover:bg-accent/40 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span {...prov.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground">
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-foreground truncate">{`{{${rec.output_token}}}`}</span>
                                        {rec.vertical && (
                                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">{verticalName(rec.vertical)}</Badge>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground truncate">{rec.output_label}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant="outline" className="text-[10px]">{typeLabels[rec.transform_type] || rec.transform_type}</Badge>
                                    <span className="font-mono text-[11px] text-muted-foreground truncate">{rec.input_field}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <Switch
                                    checked={rec.enabled !== false}
                                    onCheckedChange={(v) => toggleMutation.mutate({ id: rec.id, enabled: v })}
                                  />
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(rec)}><Pencil className="w-3.5 h-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(rec.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </tbody>
                    </table>
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>

          {/* AI-suggested fields */}
          <div className="rounded-[10px] border border-border bg-card p-4">
            <div className="text-[13px] font-semibold text-foreground mb-3">AI-suggested fields</div>
            <div className="space-y-2">
              {SUGGESTED_FIELDS.map(s => {
                const added = existingTokens.has(s.token);
                return (
                  <div key={s.token} className="border border-border rounded-lg p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-status-sold status-sold">{s.token}</span>
                        <span className="font-mono text-[11px] text-muted-foreground truncate">{s.formula}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">{s.description}</div>
                    </div>
                    <Button size="sm" variant={added ? 'ghost' : 'outline'} disabled={added} className="gap-1.5 shrink-0" onClick={() => addSuggestion(s)}>
                      <Plus className="w-3.5 h-3.5" /> {added ? 'Added' : 'Add'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-[10px] bg-card border border-border p-3 sticky top-4">
            <div className="text-[13px] font-semibold text-foreground mb-2">Reference Key</div>
            <ReferenceKeyPanel />
          </div>
        </div>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border">
            <DialogTitle>{editId ? 'Edit Calculated Field' : 'New Calculated Field'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-6 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
            <div className="space-y-1.5">
              <Label>Calculated Field Type</Label>
              <SearchableSelect
                portal={false}
                value={form.transform_type}
                onValueChange={v => setF('transform_type', v)}
                options={[
                  { value: 'value_map', label: 'Value Map' },
                  { value: 'date_age_bucket', label: 'Date Transformer' },
                  { value: 'conditional', label: 'Conditional' },
                  { value: 'clone', label: 'Clone' },
                  { value: 'script', label: 'Script' },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Vertical</Label>
              <SearchableSelect
                portal={false}
                value={form.vertical || '__all__'}
                onValueChange={v => setF('vertical', v === '__all__' ? '' : v)}
                options={[
                  { value: '__all__', label: 'All Verticals' },
                  ...verticals.map(v => ({ value: v.code, label: v.name })),
                ]}
                placeholder="All Verticals"
              />
              <p className="text-xs text-muted-foreground">Empty applies this calculation to all verticals.</p>
            </div>

            {['date_age_bucket', 'value_map', 'clone', 'script'].includes(form.transform_type) && (
              <div className="space-y-1.5">
                <Label>Input Field</Label>
                <SearchableSelect
                portal={false}
                  value={form.input_field}
                  onValueChange={v => setF('input_field', v)}
                  options={inboundFields.map(f => ({ value: f.field_name, label: f.label || f.field_name, field_type: f.field_type, required: f.required }))}
                  placeholder="Select field…"
                  renderItem={(opt) => (
                    <>
                      <span className="truncate">{opt.label || opt.value}</span>
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {opt.required && (
                          <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded">req</span>
                        )}
                        <span className="text-[9px] text-muted-foreground bg-muted px-1 py-0.5 rounded">{opt.field_type || 'string'}</span>
                      </span>
                    </>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Output Field <span className="text-muted-foreground text-xs">(used as {'{{token}}'})</span></Label>
                <OutputFieldPicker
                  value={form.output_token}
                  onValueChange={({ field_name, label }) => setForm(f => ({ ...f, output_token: field_name, output_label: label }))}
                  fields={customFields}
                  placeholder="Select or create output field…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Output Label</Label>
                <Input value={form.output_label} onChange={e => setF('output_label', e.target.value)} placeholder={form.output_token || 'Calculated Field Label'} />
              </div>
            </div>

            {form.transform_type === 'conditional' && (
              <div className="space-y-3">
                <Label className="block">Rules <span className="text-muted-foreground text-xs">(checked in order, first match wins)</span></Label>
                <div className="space-y-3">
                  {form.conditional_rules.map((rule, ri) => (
                    <div key={ri} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
                      <div className="flex items-center justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeRule(ri)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                      <CalcConditionGroupEditor
                        value={rule.conditions}
                        onChange={tree => updateRuleConditions(ri, tree)}
                        fieldOptions={conditionFieldOptions}
                        valueOptionsFor={calcValueOptionsFor}
                      />
                      <div className="flex items-center gap-2 pt-1">
                        <Label className="text-[12px] whitespace-nowrap">Set output to</Label>
                        <Input className="flex-1" value={rule.output} onChange={e => updateRuleOutput(ri, e.target.value)} placeholder="Output value" />
                      </div>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={addRule} className="gap-1"><Plus className="w-3.5 h-3.5" />Add Rule</Button>
                <div className="space-y-1.5">
                  <Label>Fallback Value <span className="text-muted-foreground text-xs">(used when no rule matches)</span></Label>
                  <Input value={form.conditional_fallback} onChange={e => setF('conditional_fallback', e.target.value)} placeholder="Fallback value" />
                </div>
              </div>
            )}

            {form.transform_type === 'date_age_bucket' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Date Format</Label>
                  <Input value={form.date_format} onChange={e => setF('date_format', e.target.value)} placeholder="MM/DD/YYYY" />
                </div>
                <div>
                  <Label className="mb-2 block">Age Buckets <span className="text-muted-foreground text-xs">(checked in order, first match wins)</span></Label>
                  <div className="space-y-2">
                    {form.buckets.map((b, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input className="flex-1" value={b.label} onChange={e => updateBucket(i, 'label', e.target.value)} placeholder="Label" />
                        <Input className="w-28" type="number" value={b.max_days} onChange={e => updateBucket(i, 'max_days', e.target.value)} placeholder="Max days" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">days</span>
                        <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeBucket(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addBucket} className="gap-1"><Plus className="w-3.5 h-3.5" />Add Bucket</Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Fallback Value <span className="text-muted-foreground text-xs">(when no bucket matches)</span></Label>
                  <Input value={form.fallback} onChange={e => setF('fallback', e.target.value)} placeholder="Over 24 Months" />
                </div>
              </div>
            )}

            {form.transform_type === 'value_map' && (
              <div className="space-y-2">
                <Label className="block mb-1">Value Mappings</Label>
                {form.value_map.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {inputDropdownOptions.length > 0 ? (
                      <Select value={row.from} onValueChange={v => updateMapRow(i, 'from', v)}>
                        <SelectTrigger className="flex-1 h-9">
                          <SelectValue placeholder="From value" />
                        </SelectTrigger>
                        <SelectContent>
                          {inputDropdownOptions.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input className="flex-1" value={row.from} onChange={e => updateMapRow(i, 'from', e.target.value)} placeholder="From value" />
                    )}
                    <span className="text-muted-foreground">→</span>
                    <Input className="flex-1" value={row.to} onChange={e => updateMapRow(i, 'to', e.target.value)} placeholder="To value" />
                    <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeMapRow(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addMapRow} className="gap-1"><Plus className="w-3.5 h-3.5" />Add Row</Button>
              </div>
            )}

            {form.transform_type === 'script' && (
              <div className="space-y-1.5">
                <Label>JavaScript Transform Script</Label>
                <Textarea
                  className="font-mono text-xs h-48"
                  value={form.script}
                  onChange={e => setF('script', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Available: <code className="bg-muted px-1 rounded">value</code> (input field value), <code className="bg-muted px-1 rounded">lead</code> (full payload). Must return the output value.
                </p>
              </div>
            )}

            {form.transform_type === 'clone' && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Clones the value of <span className="font-mono text-foreground">{form.input_field || 'the input field'}</span> into <span className="font-mono text-foreground">{`{{${form.output_token || 'output_field'}}}`}</span>. No additional configuration needed.
                </p>
              </div>
            )}
          </div>
          <div className="lg:col-span-1">
            <div className="rounded-lg bg-card border border-border p-3">
              <div className="text-[13px] font-semibold text-foreground mb-2">Reference Key</div>
              <ReferenceKeyPanel />
            </div>
          </div>
          </div>
          </div>

          <DialogFooter className="px-6 py-4 shrink-0 border-t border-border">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(formToRecord(form))} disabled={
              !form.output_token ||
              saveMutation.isPending ||
              (['date_age_bucket', 'value_map', 'clone', 'script'].includes(form.transform_type) && !form.input_field) ||
              (form.transform_type === 'conditional' && !conditionalValid)
            }>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Calculation?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone. The corresponding custom field will remain.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolsShell>
  );
}