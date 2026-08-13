import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { renameField } from '@/functions/renameField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, Trash2, Edit2, Wand2, GripVertical, Sparkles, CheckCheck, Ban, ArrowDownUp, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import ImportExportFieldsDialog from '@/components/settings/ImportExportFieldsDialog';
import AutoDetectedFieldsDialog from '@/components/settings/AutoDetectedFieldsDialog';

const BLANK_FIELD = {
  field_name: '', label: '', field_type: 'string',
  source: 'inbound', include_in_leadbyte: true,
  leadbyte_field_name: '', system_populated: false, required: false,
  options: [],
};

// Field types that carry a list of selectable values.
const VALUE_TYPES = ['system', 'dropdown'];

function guessType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function SettingsCustomFields() {
  const qc = useQueryClient();
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState(BLANK_FIELD);
  const [editingId, setEditingId] = useState(null);
  const [editingOriginal, setEditingOriginal] = useState(null);
  const [sampleJson, setSampleJson] = useState('');
  const [detectOpen, setDetectOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [orderedFields, setOrderedFields] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [autoReviewOpen, setAutoReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // null = manual drag order. Otherwise { key, dir: 'asc' | 'desc' }.
  const [sortConfig, setSortConfig] = useState(null);

  const { data: fields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || null;
    },
  });

  const { data: lbConnectors = [] } = useQuery({
    queryKey: ['lb-connectors-default'],
    queryFn: () => base44.entities.LeadByteConnector.filter({ is_default: true }),
  });

  useEffect(() => {
    const sorted = [...fields].sort((a, b) => {
      const ao = a.sort_order ?? a.created_date ?? 0;
      const bo = b.sort_order ?? b.created_date ?? 0;
      return ao - bo;
    });
    setOrderedFields(sorted);
  }, [fields]);

  const autoFields = fields.filter(f => f.auto_created);
  const autoCount = autoFields.length;

  const isSystem = (f) => f.field_type === 'system';

  const q = search.trim().toLowerCase();
  const searched = q
    ? orderedFields.filter(f =>
        (f.label || '').toLowerCase().includes(q) ||
        (f.field_name || '').toLowerCase().includes(q) ||
        (f.leadbyte_field_name || '').toLowerCase().includes(q)
      )
    : orderedFields;

  // System fields are always pinned to the top. Within each group we either keep
  // the manual drag order (sortConfig null) or apply the active column sort.
  const sortValue = (f, key) => {
    if (key === 'label') return (f.label || f.field_name || '').toLowerCase();
    if (key === 'field_name') return (f.field_name || '').toLowerCase();
    if (key === 'leadbyte_field_name') return (f.leadbyte_field_name || f.field_name || '').toLowerCase();
    if (key === 'field_type') return (f.field_type || '').toLowerCase();
    if (key === 'required') return f.required ? 1 : 0;
    return '';
  };

  const applyColumnSort = (list) => {
    if (!sortConfig) return list;
    const dir = sortConfig.dir === 'desc' ? -1 : 1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortConfig.key);
      const bv = sortValue(b, sortConfig.key);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  };

  const systemGroup = applyColumnSort(searched.filter(isSystem));
  const otherGroup = applyColumnSort(searched.filter(f => !isSystem(f)));
  const visibleFields = [...systemGroup, ...otherGroup];

  // Drag reordering is only meaningful in manual mode (no search, no column sort).
  const dragEnabled = !q && !sortConfig;

  const toggleSort = (key) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null; // third click clears back to manual order
    });
  };

  const SortHeader = ({ label, sortKey }) => {
    const active = sortConfig?.key === sortKey;
    return (
      <button
        onClick={() => toggleSort(sortKey)}
        className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {label}
        {active
          ? (sortConfig.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
      </button>
    );
  };

  const openCreate = () => { setForm(BLANK_FIELD); setEditingId(null); setEditingOriginal(null); setEditModal(true); };

  const openEdit = (f) => {
    let opts = [];
    if (Array.isArray(f.options)) opts = f.options;
    else if (typeof f.options === 'string') { try { const p = JSON.parse(f.options); if (Array.isArray(p)) opts = p; } catch {} }
    setForm({
      field_name: f.field_name || '', label: f.label || '',
      field_type: f.field_type || 'string', source: f.source || 'inbound',
      include_in_leadbyte: f.include_in_leadbyte ?? true,
      leadbyte_field_name: f.leadbyte_field_name || '',
      system_populated: f.system_populated ?? false,
      required: f.required ?? false,
      options: opts,
    });
    setEditingId(f.id);
    setEditingOriginal(f);
    setEditModal(true);
  };

  const openCopy = (f) => {
    setForm({
      field_name: f.field_name + '_copy', label: f.label ? f.label + ' (copy)' : '',
      field_type: f.field_type === 'system' ? 'dropdown' : (f.field_type || 'string'),
      source: f.source || 'inbound',
      include_in_leadbyte: f.include_in_leadbyte ?? true,
      leadbyte_field_name: f.leadbyte_field_name ? f.leadbyte_field_name + '_copy' : '',
      system_populated: false, required: f.required ?? false,
      options: parseJsonArray(f.options),
    });
    setEditingId(null);
    setEditingOriginal(null);
    setEditModal(true);
  };

  const editingSystem = editingOriginal?.field_type === 'system';

  const saveField = async () => {
    setSaving(true);
    try {
      const data = { ...form };
      // System fields keep their locked token; never rewrite field_name from the form.
      if (editingSystem) data.field_name = editingOriginal.field_name;
      if (!data.leadbyte_field_name) data.leadbyte_field_name = data.field_name;
      if (!data.label) data.label = data.field_name;
      // Only dropdown/system fields carry options; serialize to a JSON string for storage.
      data.options = VALUE_TYPES.includes(data.field_type) && Array.isArray(form.options) && form.options.length > 0
        ? JSON.stringify(form.options.filter(o => String(o).trim() !== ''))
        : '';

      if (editingId) {
        const orig = editingOriginal || {};
        const nameChanged = !editingSystem && orig.field_name && data.field_name && orig.field_name !== data.field_name;
        const labelChanged = (orig.label || '') !== (data.label || '');
        await base44.entities.CustomField.update(editingId, data);
        // Propagate a rename/label change everywhere it's referenced.
        if (nameChanged || labelChanged) {
          try {
            const res = await renameField({
              field_id: editingId,
              old_name: orig.field_name,
              new_name: data.field_name,
              new_label: data.label,
            });
            const updated = res?.data?.updated || [];
            if (nameChanged && updated.length) {
              toast.success(`Field updated & propagated to ${updated.length} reference${updated.length !== 1 ? 's' : ''}`);
            } else {
              toast.success('Field updated');
            }
            qc.invalidateQueries();
          } catch (e) {
            toast.success('Field updated');
          }
        } else {
          toast.success('Field updated');
        }
      } else {
        data.sort_order = orderedFields.length;
        await base44.entities.CustomField.create(data);
        toast.success('Field created');
      }
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setEditModal(false);
    } finally {
      setSaving(false);
    }
  };

  // Deletes a single field: removes it, adds to the ignore list, strips it from the
  // default LeadByte template. Shared by single and bulk delete.
  const deleteFieldRecord = async (field) => {
    await base44.entities.CustomField.delete(field.id);

    const currentIgnore = parseJsonArray(appSettings?.adaptive_fields_ignore_list);
    const normName = (field.field_name || '').toLowerCase();
    if (normName && !currentIgnore.map(s => String(s).toLowerCase()).includes(normName)) {
      currentIgnore.push(field.field_name);
      if (appSettings) {
        await base44.entities.AppSettings.update(appSettings.id, {
          adaptive_fields_ignore_list: JSON.stringify(currentIgnore),
        });
      }
    }

    const lbConn = lbConnectors[0];
    if (lbConn && lbConn.forwarding_mode === 'template' && lbConn.payload_template) {
      try {
        const parsed = JSON.parse(lbConn.payload_template);
        if (field.field_name in parsed) {
          delete parsed[field.field_name];
          await base44.entities.LeadByteConnector.update(lbConn.id, {
            payload_template: JSON.stringify(parsed, null, 2),
          });
        }
      } catch {}
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteFieldRecord(deleteTarget);
    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    qc.invalidateQueries({ queryKey: ['app-settings'] });
    qc.invalidateQueries({ queryKey: ['lb-connectors-default'] });
    setDeleteTarget(null);
    toast.success('Field deleted and added to ignore list');
  };

  // Bulk delete every selected non-system field.
  const bulkDeletableIds = [...selectedIds].filter(id => {
    const f = fields.find(x => x.id === id);
    return f && f.field_type !== 'system';
  });

  const confirmBulkDelete = async () => {
    const targets = bulkDeletableIds
      .map(id => fields.find(x => x.id === id))
      .filter(Boolean);
    for (const f of targets) {
      await deleteFieldRecord(f);
    }
    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    qc.invalidateQueries({ queryKey: ['app-settings'] });
    qc.invalidateQueries({ queryKey: ['lb-connectors-default'] });
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    toast.success(`${targets.length} field${targets.length !== 1 ? 's' : ''} deleted`);
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const payload = JSON.parse(sampleJson);
      let created = 0;
      const existing = new Set(fields.map(f => f.field_name));
      for (const [key, value] of Object.entries(payload)) {
        if (!existing.has(key)) {
          await base44.entities.CustomField.create({
            field_name: key,
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            field_type: guessType(value),
            source: 'inbound',
            include_in_leadbyte: true,
            leadbyte_field_name: key,
            sort_order: orderedFields.length + created,
          });
          created++;
        }
      }
      toast.success(`Created ${created} new fields`);
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setDetectOpen(false);
      setSampleJson('');
    } catch {
      toast.error('Invalid JSON');
    }
    setDetecting(false);
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const reordered = [...orderedFields];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setOrderedFields(reordered);

    const updates = reordered.map((f, i) => ({ id: f.id, sort_order: i }));
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    await Promise.all(
      updates.slice(lo, hi + 1).map(u =>
        base44.entities.CustomField.update(u.id, { sort_order: u.sort_order })
      )
    );
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orderedFields.length && orderedFields.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orderedFields.map(f => f.id)));
    }
  };

  const bulkSetRequired = async (required) => {
    const ids = [...selectedIds];
    await Promise.all(ids.map(id =>
      base44.entities.CustomField.update(id, { required })
    ));
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    toast.success(`${ids.length} field${ids.length !== 1 ? 's' : ''} ${required ? 'marked required' : 'unmarked'}`);
  };

  const onOptionDragEnd = (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    setForm(p => {
      const next = [...(p.options || [])];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...p, options: next };
    });
  };

  const showValues = VALUE_TYPES.includes(form.field_type);

  return (
    <div>
      {/* Sticky toolbar, stays visible while the field table scrolls beneath it. */}
      <div className="sticky top-0 z-20 bg-background pt-1 pb-3 -mt-1">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[13px] text-muted-foreground">{fields.length} fields defined</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportExportOpen(true)} className="gap-1.5">
              <ArrowDownUp className="w-3.5 h-3.5" /> Import / Export Fields
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDetectOpen(true)} className="gap-1.5">
              <Wand2 className="w-3.5 h-3.5" /> Detect from JSON
            </Button>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Field
            </Button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search fields by label, name or token..."
            className="pl-9 bg-background"
          />
        </div>

        {autoCount > 0 && (
          <button
            onClick={() => setAutoReviewOpen(true)}
            className="w-full flex items-center gap-2 mb-3 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/15 transition-colors text-left"
          >
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[13px] text-primary">{autoCount} field{autoCount !== 1 ? 's' : ''} auto-detected from inbound leads</span>
            <span className="text-[12px] text-primary/70 ml-auto">Review →</span>
          </button>
        )}

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 bg-muted border border-border rounded-lg">
            <span className="text-[13px] text-foreground font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => bulkSetRequired(true)} className="gap-1.5 h-7 text-[11px]"><CheckCheck className="w-3 h-3" /> Require All</Button>
            <Button size="sm" variant="outline" onClick={() => bulkSetRequired(false)} className="gap-1.5 h-7 text-[11px]"><Ban className="w-3 h-3" /> Unrequire All</Button>
            {bulkDeletableIds.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setBulkDeleteOpen(true)} className="gap-1.5 h-7 text-[11px] text-destructive border-destructive/40 hover:bg-destructive/10">
                <Trash2 className="w-3 h-3" /> Delete{bulkDeletableIds.length !== selectedIds.size ? ` (${bulkDeletableIds.length})` : ''}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="h-7 text-[11px] ml-auto">Clear</Button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-8 px-2">
                <Checkbox checked={selectedIds.size > 0 && selectedIds.size === orderedFields.length} onCheckedChange={toggleSelectAll} />
              </th>
              <th className="w-8 px-2" />
              <th className="text-left px-4 py-2.5"><SortHeader label="Field Label" sortKey="label" /></th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Token</th>
              <th className="text-left px-4 py-2.5"><SortHeader label="Type" sortKey="field_type" /></th>
              <th className="text-left px-4 py-2.5"><SortHeader label="Required" sortKey="required" /></th>
              <th className="text-left px-4 py-2.5"><SortHeader label="Field Name" sortKey="field_name" /></th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</th>
              <th className="text-left px-4 py-2.5" />
            </tr>
          </thead>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="fields-list">
              {(provided) => (
                <tbody
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="divide-y divide-border"
                >
                  {visibleFields.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      {q ? `No fields match "${search.trim()}".` : 'No fields yet. Add fields manually or detect from a sample payload.'}
                    </td></tr>
                  )}
                  {visibleFields.map((f, index) => (
                    <Draggable key={f.id} draggableId={f.id} index={index} isDragDisabled={!dragEnabled}>
                      {(provided, snapshot) => (
                        <tr
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`hover:bg-accent/40 transition-colors ${snapshot.isDragging ? 'bg-accent shadow-lg' : ''}`}
                        >
                          <td className="px-2 py-2.5 w-8">
                            <Checkbox checked={selectedIds.has(f.id)} onCheckedChange={() => toggleSelect(f.id)} />
                          </td>
                          <td className="px-2 py-2.5 w-8">
                            <div {...provided.dragHandleProps} className={`text-muted-foreground hover:text-foreground ${!dragEnabled ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}>
                              <GripVertical className="w-4 h-4" />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-foreground">{f.label || f.field_name}</td>
                          <td className="px-4 py-2.5 font-mono text-[12px] text-primary">{'{{' + f.field_name + '}}'}</td>
                          <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{f.field_type}</Badge></td>
                          <td className="px-4 py-2.5">
                            <Switch checked={f.required} onCheckedChange={async v => {
                              await base44.entities.CustomField.update(f.id, { required: v });
                              qc.invalidateQueries({ queryKey: ['custom-fields'] });
                            }} />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{f.leadbyte_field_name || f.field_name}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {f.auto_created && <Badge className="bg-primary/10 text-primary text-[10px] gap-1"><Sparkles className="w-2.5 h-2.5" /> Auto</Badge>}
                              {f.auto_created && f.sample_value && (
                                <span className="text-[10px] text-muted-foreground font-mono max-w-[120px] truncate" title={f.sample_value}>= {f.sample_value}</span>
                              )}
                              {f.field_type === 'system' && <Badge className="bg-chart-5/15 text-chart-5 text-[10px]">{f.system_role === 'email_valid' ? 'Email Valid' : f.system_role === 'phone_verified' ? 'Phone Verified' : 'System'}</Badge>}
                              {f.field_type === 'dropdown' && <Badge className="bg-chart-3/15 text-chart-3 text-[10px]">Dropdown</Badge>}
                              {f.required && <Badge className="bg-status-queued status-queued text-[10px]">Required</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(f)} className="h-7 w-7 p-0"><Edit2 className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => openCopy(f)} className="h-7 w-7 p-0"><Copy className="w-3 h-3" /></Button>
                              {f.field_type !== 'system' && (
                                <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(f)} className="h-7 w-7 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </tbody>
              )}
            </Droppable>
          </DragDropContext>
        </table>
        </div>
      </div>

      {/* Edit/Create Modal */}
      <Dialog open={editModal} onOpenChange={setEditModal}>
        <DialogContent className="bg-popover border-border max-w-[440px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Field' : 'New Field'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Token / field_name *</Label>
              <Input
                value={form.field_name}
                onChange={e => setForm(p => ({ ...p, field_name: e.target.value }))}
                placeholder="e.g. phone"
                disabled={editingSystem}
                className="mt-1 bg-background font-mono text-[12px] disabled:opacity-60"
              />
              {editingSystem && <p className="text-[11px] text-muted-foreground mt-1">System field token is locked. You can still change its label and values.</p>}
            </div>
            <div><Label className="text-[12px]">Label</Label><Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} className="mt-1 bg-background" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Type</Label>
                <SearchableSelect
                  value={form.field_type}
                  onValueChange={v => setForm(p => ({ ...p, field_type: v }))}
                  className="mt-1 bg-background"
                  disabled={editingSystem}
                  options={[
                    ...(editingSystem ? [{ value: 'system', label: 'system' }] : []),
                    ...['string', 'number', 'boolean', 'date', 'dropdown', 'Calculated'].map(t => ({ value: t, label: t })),
                  ]}
                />
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2 pb-1.5">
                  <Switch checked={form.required} onCheckedChange={v => setForm(p => ({ ...p, required: v }))} />
                  <Label className="text-[12px]">Required (gate)</Label>
                </div>
              </div>
            </div>
            {form.field_type === 'Calculated' && (
              <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/30 text-[12px] text-foreground">
                This creates the field, but the calculation logic (buckets, value maps, etc.) is configured on the{' '}
                <Link to="/calculated-fields" className="text-primary font-medium underline underline-offset-2">Calculated Fields</Link>{' '}
                page. Save here, then set up the transform there.
              </div>
            )}
            {showValues && (
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-[12px]">Dropdown Values <span className="text-muted-foreground text-[11px]">(also used as Triggers on Deliveries & Conversion Events)</span></Label>
                <DragDropContext onDragEnd={onOptionDragEnd}>
                  <Droppable droppableId="option-list">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                        {Array.isArray(form.options) && form.options.map((opt, i) => (
                          <Draggable key={i} draggableId={`opt-${i}`} index={i}>
                            {(dp, snap) => (
                              <div
                                ref={dp.innerRef}
                                {...dp.draggableProps}
                                className={`flex items-center gap-2 ${snap.isDragging ? 'opacity-90' : ''}`}
                              >
                                <div {...dp.dragHandleProps} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <Input
                                  value={opt}
                                  onChange={e => setForm(p => {
                                    const next = [...p.options];
                                    next[i] = e.target.value;
                                    return { ...p, options: next };
                                  })}
                                  placeholder={`Enter ${form.field_name ? form.field_name.replace(/_/g, ' ') : 'field'} value ${i + 1}`}
                                  className="bg-background font-mono text-[12px]"
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={() => setForm(p => ({ ...p, options: p.options.filter((_, idx) => idx !== i) }))}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
                <Button size="sm" variant="outline" onClick={() => setForm(p => ({ ...p, options: [...(p.options || []), ''] }))} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add Value
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button onClick={saveField} disabled={!form.field_name || saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="bg-popover border-border max-w-[400px]">
          <DialogHeader><DialogTitle>Delete field?</DialogTitle></DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Deleting <span className="font-mono text-foreground">{deleteTarget?.field_name}</span> will also add it to the ignore list and strip it from the LeadByte payload template, so it will never auto-regenerate or forward again.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} className="gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete & Ignore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border max-w-[400px]">
          <DialogHeader><DialogTitle>Delete {bulkDeletableIds.length} field{bulkDeletableIds.length !== 1 ? 's' : ''}?</DialogTitle></DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            The selected fields will be deleted, added to the ignore list, and stripped from the LeadByte payload template. System fields in your selection are skipped.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmBulkDelete} className="gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete {bulkDeletableIds.length}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detect from JSON Modal */}
      <Dialog open={detectOpen} onOpenChange={setDetectOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader><DialogTitle>Detect Fields from JSON</DialogTitle></DialogHeader>
          <div>
            <Label className="text-[12px]">Paste a sample inbound lead payload</Label>
            <Textarea value={sampleJson} onChange={e => setSampleJson(e.target.value)} className="mt-1 bg-background font-mono text-[12px] min-h-[180px]" placeholder='{"firstname":"John","phone":"5551234567",...}' />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetectOpen(false)}>Cancel</Button>
            <Button onClick={handleDetect} disabled={detecting || !sampleJson}>{detecting ? 'Detecting...' : 'Create Fields'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportExportFieldsDialog
        open={importExportOpen}
        onOpenChange={setImportExportOpen}
        fields={orderedFields}
      />

      <AutoDetectedFieldsDialog
        open={autoReviewOpen}
        onOpenChange={setAutoReviewOpen}
        autoFields={autoFields}
      />
    </div>
  );
}