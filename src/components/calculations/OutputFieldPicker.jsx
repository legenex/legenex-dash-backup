import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * OutputFieldPicker
 *  - value: selected field_name (token)
 *  - onValueChange(field) => passes the FULL field object {field_name, label} so caller can sync label
 *  - fields: current custom fields list
 *  - placeholder, className
 *
 * Includes an inline "Create new field" action that creates a Calculated field and selects it
 * without leaving the parent modal.
 */
export function OutputFieldPicker({ value, onValueChange, fields = [], placeholder = 'Select field…', className }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');

  const selectableFields = fields.filter(f => f.field_type !== 'Calculated');
  const selected = fields.find(f => f.field_name === value);

  const display = selected ? (selected.label || selected.field_name) : (value || placeholder);

  // Default label template: replace _ with space and Title Case each word.
  const toLabel = (name) => name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const resetCreate = () => { setNewFieldName(''); setNewFieldLabel(''); setShowCreate(false); setSaving(false); };

  const close = () => { setOpen(false); setSearch(''); resetCreate(); };

  // Open the create form, prefilling the token from the search text and the
  // label from the default template so the user need not retype them.
  const openCreate = () => {
    const name = search.trim().replace(/\s/g, '_');
    setNewFieldName(name);
    setNewFieldLabel(name ? toLabel(name) : '');
    setShowCreate(true);
  };

  const handleCreate = async () => {
    const name = newFieldName.trim().replace(/\s/g, '_');
    if (!name) { toast.error('Field name required'); return; }
    const existing = fields.find(f => f.field_name === name);
    if (existing) {
      onValueChange({ field_name: existing.field_name, label: existing.label || existing.field_name });
      toast.success('Field already exists - selected');
      close();
      return;
    }
    try {
      setSaving(true);
      const label = newFieldLabel.trim() || toLabel(name);
      const created = await base44.entities.CustomField.create({
        field_name: name,
        label,
        field_type: 'Calculated',
        source: 'inbound',
        include_in_leadbyte: true,
        leadbyte_field_name: name,
        auto_created: true,
        sort_order: fields.length,
      });
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      onValueChange({ field_name: created.field_name, label: created.label });
      toast.success('Calculated field created');
      close();
    } catch (e) {
      toast.error('Failed to create field: ' + (e?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetCreate(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-left',
            className
          )}
        >
          <span className={cn('truncate', !selected && !value && 'text-muted-foreground')}>{display}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="p-0"
        // Rendered inline rather than portalled to document.body. This picker
        // opens from inside a Dialog, and the dialog's scroll lock cancels
        // wheel events outside its own DOM subtree, which left this list
        // draggable by the scrollbar grip but dead to mouse wheel and trackpad.
        portal={false}
        style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '16rem' }}
        onOpenAutoFocus={(e) => { /* keep focus on input via Command */ }}
      >
        <Command shouldFilter={true} className="h-auto overflow-visible">
          <CommandInput placeholder="Search fields…" value={search} onValueChange={setSearch} className="h-9" />
          <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain">
            <CommandEmpty>No fields found.</CommandEmpty>
            <CommandGroup>
              {selectableFields.map((f) => (
                <CommandItem
                  key={f.id || f.field_name}
                  value={f.label || f.field_name}
                  onSelect={() => { onValueChange({ field_name: f.field_name, label: f.label || f.field_name }); close(); }}
                  className="gap-2"
                >
                  <Check className={cn('h-4 w-4 shrink-0', value === f.field_name ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{f.label || f.field_name}</span>
                  <span className="ml-auto flex items-center gap-1 shrink-0">
                    {f.required && (
                      <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded">req</span>
                    )}
                    <span className="text-[9px] text-muted-foreground bg-muted px-1 py-0.5 rounded">{f.field_type || 'string'}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={openCreate}
                className="gap-2 text-primary"
                value={`__create_${search}`}
              >
                <Plus className="h-4 w-4" />
                <span>Create new field{search ? ` "${search.replace(/\s/g, '_')}"` : ''}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>

        {showCreate && (
          <div className="border-t border-border p-3 space-y-2 bg-muted/30">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">New Calculated Field</div>
            <div>
              <Label className="text-[11px]">Field name (token)</Label>
              <Input
                autoFocus
                value={newFieldName}
                onChange={e => {
                  const next = e.target.value.replace(/\s/g, '_');
                  // Keep the label mirroring the token until the user has typed
                  // their own label.
                  if (newFieldLabel === toLabel(newFieldName)) setNewFieldLabel(toLabel(next));
                  setNewFieldName(next);
                }}
                placeholder="calculated_field"
                className="mt-1 bg-background font-mono text-[12px] h-8"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              />
            </div>
            <div>
              <Label className="text-[11px]">Label</Label>
              <Input
                value={newFieldLabel}
                onChange={e => setNewFieldLabel(e.target.value)}
                placeholder="Calculated Field Label"
                className="mt-1 bg-background h-8"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={resetCreate}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !newFieldName.trim()} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Create & Select
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default OutputFieldPicker;