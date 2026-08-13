import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, Upload, CheckSquare, Square, FileJson } from 'lucide-react';
import { toast } from 'sonner';

// Built-in fields that must never be written back on import (they are managed by the platform).
const READONLY_FIELDS = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample']);

// Strip platform-managed fields, leaving a clean, fully round-trippable record.
function toExportRecord(rec) {
  const out = {};
  Object.keys(rec).forEach((k) => {
    if (READONLY_FIELDS.has(k)) return;
    out[k] = rec[k];
  });
  return out;
}

function toImportData(rec) {
  const out = {};
  Object.keys(rec).forEach((k) => {
    if (READONLY_FIELDS.has(k)) return;
    out[k] = rec[k];
  });
  return out;
}

/**
 * Generic Import / Export dialog for any entity list.
 *
 * Props:
 * - open, onOpenChange
 * - entityName: string (base44 entity name, e.g. 'Supplier')
 * - records: array of the current records
 * - matchKey: field used to detect existing records on import (e.g. 'name', 'company_name')
 * - labelKey: field used for the display label in the export list
 * - exportPrefix: filename prefix, e.g. 'suppliers'
 * - queryKeys: array of react-query keys to invalidate after import
 * - title: dialog title (default 'Import / Export')
 */
export default function ImportExportDialog({
  open,
  onOpenChange,
  entityName,
  records = [],
  matchKey,
  labelKey,
  exportPrefix,
  queryKeys = [],
  title = 'Import / Export',
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState(null); // null | 'export' | 'import'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMode(null);
      setSelectedIds(new Set(records.map((r) => r.id)));
    }
  }, [open, records]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(records.map((r) => r.id)));
  const unselectAll = () => setSelectedIds(new Set());

  const doExport = () => {
    const chosen = records.filter((r) => selectedIds.has(r.id)).map(toExportRecord);
    if (chosen.length === 0) { toast.error('Select at least one item'); return; }
    const blob = new Blob([JSON.stringify(chosen, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportPrefix}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${chosen.length} item${chosen.length !== 1 ? 's' : ''}`);
    onOpenChange(false);
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming = Array.isArray(parsed) ? parsed : [parsed];
      let created = 0, updated = 0, skipped = 0;
      for (const raw of incoming) {
        const data = toImportData(raw);
        const keyVal = matchKey ? data[matchKey] : undefined;
        const match = matchKey && keyVal != null
          ? records.find((r) => r[matchKey] === keyVal)
          : null;
        if (match) {
          await base44.entities[entityName].update(match.id, data);
          updated++;
        } else if (keyVal != null || !matchKey) {
          await base44.entities[entityName].create(data);
          created++;
        } else {
          skipped++;
        }
      }
      queryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success(`Imported: ${created} created, ${updated} updated${skipped ? `, ${skipped} skipped` : ''}`);
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
            {mode === 'export' ? 'Export' : mode === 'import' ? 'Import' : title}
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
              <span className="text-[11px] text-muted-foreground text-center">Download selected items as JSON</span>
            </button>
            <button
              onClick={() => setMode('import')}
              className="flex flex-col items-center gap-2 p-5 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors"
            >
              <Upload className="w-6 h-6 text-primary" />
              <span className="text-[13px] font-medium text-foreground">Import</span>
              <span className="text-[11px] text-muted-foreground text-center">Upload a JSON file</span>
            </button>
          </div>
        )}

        {mode === 'export' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAll} className="gap-1.5 h-7 text-[11px]"><CheckSquare className="w-3 h-3" /> Select All</Button>
              <Button size="sm" variant="outline" onClick={unselectAll} className="gap-1.5 h-7 text-[11px]"><Square className="w-3 h-3" /> Unselect All</Button>
              <span className="text-[12px] text-muted-foreground ml-auto">{selectedIds.size} / {records.length} selected</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {records.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nothing to export.</div>}
              {records.map((r) => (
                <label key={r.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40 cursor-pointer">
                  <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  <span className="text-[13px] text-foreground flex-1 truncate">{r[labelKey] || r[matchKey] || r.id}</span>
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
              <span className="text-[11px] text-muted-foreground text-center">Matching items are updated; new ones are created</span>
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