import React, { useState } from 'react';
import { PERIODS } from '@/lib/periodRange';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';

// Period chooser rendered as tabs. Custom opens a small from/to popover.
export default function PeriodTabs({ value, onChange, custom, onCustomChange, extra }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(custom || { from: '', to: '' });

  return (
    <div className="inline-flex items-center gap-1.5 sm:gap-2 flex-wrap">
      <div className="inline-flex items-center bg-card border border-border rounded-lg p-0.5">
        {PERIODS.map(p => {
          const active = p.value === value;
          if (p.value === 'custom') {
            return (
              <Popover key={p.value} open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <button
                    onClick={() => onChange('custom')}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-[12px] font-medium rounded-md transition-colors inline-flex items-center gap-1.5 ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" /> Custom
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-popover border-border" align="end">
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[11px] text-muted-foreground">From</label>
                      <Input type="date" value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} className="mt-1 bg-background text-[12px]" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">To</label>
                      <Input type="date" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} className="mt-1 bg-background text-[12px]" />
                    </div>
                    <Button size="sm" className="w-full" onClick={() => { onCustomChange?.(draft); onChange('custom'); setOpen(false); }}>Apply</Button>
                  </div>
                </PopoverContent>
              </Popover>
            );
          }
          return (
            <button
              key={p.value}
              onClick={() => onChange(p.value)}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-[12px] font-medium rounded-md transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {extra}
    </div>
  );
}