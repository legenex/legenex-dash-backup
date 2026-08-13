import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { METRIC_CATALOG } from '@/lib/reportMetrics';
import { Check } from 'lucide-react';

// Lets the user pick a metric (built-in or a custom field) to add as a card.
export default function MetricPicker({ open, onOpenChange, onPick, customFields = [] }) {
  const [q, setQ] = useState('');

  const builtins = METRIC_CATALOG.map(m => ({ key: m.key, label: m.label, kind: 'metric' }));
  const fields = customFields.map(f => ({ key: `field:${f.field_name}`, label: f.label || f.field_name, kind: 'field' }));
  const all = [...builtins, ...fields];
  const filtered = q ? all.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : all;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[460px]">
        <DialogHeader><DialogTitle>Add Metric Card</DialogTitle></DialogHeader>
        <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search metrics & fields…" className="bg-background text-[13px]" />
        <div className="max-h-[340px] overflow-y-auto -mx-1">
          {filtered.map(o => (
            <button
              key={o.key}
              onClick={() => { onPick(o); onOpenChange(false); setQ(''); }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] text-foreground hover:bg-accent/50 transition-colors text-left"
            >
              <span>{o.label}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                {o.kind === 'field' ? 'Custom Field' : 'Metric'}
                <Check className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">No matches</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}