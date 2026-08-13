import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, Upload, CheckSquare, Square, FileJson } from 'lucide-react';
import { toast } from 'sonner';

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Serialize a CustomField record to a fully round-trippable export object.
function toExportRecord(f) {
  return {
    field_name: f.field_name,
    label: f.label ?? '',
    field_type: f.field_type ?? 'string',
    source: f.source ?? 'inbound',
    sample_value: f.sample_value ?? '',
    options: parseJsonArray(f.options),
    include_in_leadbyte: f.include_in_leadbyte ?? false,
    leadbyte_field_name: f.leadbyte_field_name ?? '',
    auto_created: f.auto_created ?? false,
    sort_order: f.sort_order ?? 0,
    required: f.required ?? false,
    system_role: f.system_role ?? '',
  };
}

export default function ImportExportFieldsDialog({ open, onOpenChange, fields }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState(null); // null | 'export' | 'import'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMode(null);
      setSelectedIds(new Set(fields.map(f => f.id)));
    }
  }, [open, fields]);

  const allSelected = fields.length > 0 && selectedIds.size === fields.length;

  const toggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(fields.map(f => f.id)));
  const unselectAll = () => setSelectedIds(new Set());

  const doExport = () => {
    const chosen = fields.filter(f => selectedIds.has(f.id)).map(toExportRecord);
    if (chosen.length === 0) { toast.error('Select at least one field'); return; }
    const blob = new Blob([JSON.stringify(chosen, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-fields-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${chosen.length} field${chosen.length !== 1 ? 's' : ''}`);
    onOpenChange(false);
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const records = Array.isArray(parsed) ? parsed : [parsed];
      const existing = new Set(fields.map(f => f.field_name));
      let created = 0, updated = 0;
      for (const r of records) {
        if (!r.field_name) continue;
        const data = {
          field_name: r.field_name,
          label: r.label ?? '',
          field_type: r.field_type ?? 'string',
          source: r.source ?? 'inbound',
          sample_value: r.sample_value ?? '',
          options: Array.isArray(r.options) ? JSON.stringify(r.options) : (r.options ?? ''),
          include_in_leadbyte: r.include_in_leadbyte ?? false,
          leadbyte_field_name: r.leadbyte_field_name ?? '',
          auto_created: r.auto_created ?? false,
          sort_order: r.sort_order ?? 0,
          required: r.required ?? false,
          system_role: r.system_role ?? '',
        };
        const match = fields.find(f => f.field_name === r.field_name);
        if (match) { await base44.entities.CustomField.update(match.id, data); updated++; }
        else { await base44.entities.CustomField.create(data); created++; }
        existing.add(r.field_name);
      }
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success(`Imported: ${created} created, ${updated} updated`);
      onOpenChange(false);
    } catch (err) {
      toast.error('Invalid JSON file');
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'export' ? 'Export Fields' : mode === 'import' ? 'Import Fields' : 'Import / Export Fields'}
          </DialogTitle>
        </DialogHeader>

        {mode === null && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              onClick={() => setMode('export')}
              className="flex flex-col items-center gap-2 p-5 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors"
            >
              <Download className="w-6 h-6 text-primary" />
              <span className="text-[13px] font-medium text-foreground">Export</span>
              <span className="text-[11px] text-muted-foreground text-center">Download selected fields as JSON</span>
            </button>
            <button
              onClick={() => setMode('import')}
              className="flex flex-col items-center gap-2 p-5 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors"
            >
              <Upload className="w-6 h-6 text-primary" />
              <span className="text-[13px] font-medium text-foreground">Import</span>
              <span className="text-[11px] text-muted-foreground text-center">Upload a JSON file of fields</span>
            </button>
          </div>
        )}

        {mode === 'export' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAll} className="gap-1.5 h-7 text-[11px]"><CheckSquare className="w-3 h-3" /> Select All</Button>
              <Button size="sm" variant="outline" onClick={unselectAll} className="gap-1.5 h-7 text-[11px]"><Square className="w-3 h-3" /> Unselect All</Button>
              <span className="text-[12px] text-muted-foreground ml-auto">{selectedIds.size} / {fields.length} selected</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {fields.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">No fields to export.</div>}
              {fields.map(f => (
                <label key={f.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40 cursor-pointer">
                  <Checkbox checked={selectedIds.has(f.id)} onCheckedChange={() => toggle(f.id)} />
                  <span className="text-[13px] text-foreground flex-1">{f.label || f.field_name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{'{{' + f.field_name + '}}'}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {mode === 'import' && (
          <div className="py-2">
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={doImport} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="w-full flex flex-col items-center gap-2 p-8 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-accent/40 transition-colors disabled:opacity-50"
            >
              <FileJson className="w-8 h-8 text-muted-foreground" />
              <span className="text-[13px] font-medium text-foreground">{importing ? 'Importing…' : 'Select JSON file'}</span>
              <span className="text-[11px] text-muted-foreground">Matching field names are updated; new ones are created</span>
            </button>
          </div>
        )}

        <DialogFooter>
          {mode !== null && <Button variant="ghost" onClick={() => setMode(null)}>Back</Button>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {mode === 'export' && <Button onClick={doExport} disabled={selectedIds.size === 0} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Export JSON</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}