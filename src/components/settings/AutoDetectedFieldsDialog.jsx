import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// Review dialog for fields that were auto-detected from inbound leads.
// Lets the operator multi-select which detected fields to keep (confirm as
// permanent custom fields) or delete. Auto-detection no longer happens on
// intake, this only manages fields already flagged auto_created.
export default function AutoDetectedFieldsDialog({ open, onOpenChange, autoFields }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const allSelected = autoFields.length > 0 && selected.size === autoFields.length;

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(autoFields.map(f => f.id)));
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ['custom-fields'] });

  const addSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    await Promise.all(ids.map(id =>
      base44.entities.CustomField.update(id, { auto_created: false })
    ));
    setBusy(false);
    refresh();
    toast.success(`Added ${ids.length} field${ids.length !== 1 ? 's' : ''} as custom fields`);
    onOpenChange(false);
  };

  const deleteSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    await Promise.all(ids.map(id => base44.entities.CustomField.delete(id)));
    setBusy(false);
    refresh();
    toast.success(`Deleted ${ids.length} field${ids.length !== 1 ? 's' : ''}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Review Auto-Detected Fields
          </DialogTitle>
        </DialogHeader>

        <p className="text-[13px] text-muted-foreground">
          These fields were seen on inbound leads but aren't confirmed custom fields yet.
          Select which to keep as custom fields, or delete the rest.
        </p>

        <div className="flex items-center justify-between px-1 py-1">
          <label className="flex items-center gap-2 text-[12px] text-foreground cursor-pointer">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            {allSelected ? 'Deselect All' : 'Select All'}
          </label>
          <span className="text-[12px] text-muted-foreground">{selected.size} selected</span>
        </div>

        <div className="max-h-[320px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {autoFields.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground text-[13px]">No auto-detected fields.</div>
          )}
          {autoFields.map(f => (
            <label key={f.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 cursor-pointer">
              <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-foreground">{f.label || f.field_name}</span>
                  <span className="font-mono text-[11px] text-primary">{'{{' + f.field_name + '}}'}</span>
                  <Badge variant="outline" className="text-[10px]">{f.field_type}</Badge>
                </div>
                {f.sample_value && (
                  <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5" title={f.sample_value}>= {f.sample_value}</div>
                )}
              </div>
            </label>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={deleteSelected} disabled={busy || selected.size === 0} className="gap-1.5 text-destructive">
            <Trash2 className="w-3.5 h-3.5" /> Delete Selected
          </Button>
          <Button onClick={addSelected} disabled={busy || selected.size === 0} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add as Custom Fields
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}