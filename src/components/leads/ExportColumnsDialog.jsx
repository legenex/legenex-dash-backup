import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download } from 'lucide-react';
import { LEAD_EXPORT_COLUMNS, DEFAULT_EXPORT_KEYS } from '@/lib/leadExportColumns';

// Column picker for the All Leads CSV export. Pre-checks default columns and
// exports the checked columns in catalog order.
export default function ExportColumnsDialog({ open, onOpenChange, count, onExport }) {
  const [selected, setSelected] = useState(() => new Set(DEFAULT_EXPORT_KEYS));

  // Reset to defaults each time the dialog opens.
  useEffect(() => {
    if (open) setSelected(new Set(DEFAULT_EXPORT_KEYS));
  }, [open]);

  const allChecked = selected.size === LEAD_EXPORT_COLUMNS.length;

  const toggle = (key, checked) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(LEAD_EXPORT_COLUMNS.map(c => c.key)));
  };

  const handleExport = () => {
    const keys = LEAD_EXPORT_COLUMNS.filter(c => selected.has(c.key)).map(c => c.key);
    onExport(keys);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Export Columns</DialogTitle>
          <DialogDescription>
            Choose the columns to include. Exporting {count} filtered lead{count === 1 ? '' : 's'}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="text-[12px] text-muted-foreground">{selected.size} selected</span>
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {allChecked ? 'Deselect All' : 'Select All'}
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto grid grid-cols-2 gap-x-4 gap-y-2 py-1">
          {LEAD_EXPORT_COLUMNS.map(col => (
            <label key={col.key} className="flex items-center gap-2 text-[13px] cursor-pointer">
              <Checkbox
                checked={selected.has(col.key)}
                onCheckedChange={v => toggle(col.key, v)}
              />
              <span className="truncate">{col.label}</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleExport} disabled={selected.size === 0} className="gap-1.5">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}