import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { STANDARD_PERIODS } from '@/lib/periodRange';

// Shared date filter used across every Finances tab and Report.
// Presets: Today, Yesterday, This Month (default), Last Month, Last Year, Custom.
// Controlled via period + custom, mirroring the OverviewHeader API.
export default function DateRangeFilter({ period = 'this_month', custom, onPeriodChange, onCustomChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const current = STANDARD_PERIODS.find(p => p.value === period) || STANDARD_PERIODS[2];
  const pick = (v) => {
    onPeriodChange?.(v);
    if (v !== 'custom') setOpen(false);
  };

  const buttonLabel = period === 'custom' && custom?.from
    ? `${custom.from} to ${custom.to || '...'}`
    : current.label;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card text-[13px] text-foreground hover:bg-accent transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Date:</span>
        <span className="font-medium whitespace-nowrap">{buttonLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-lg border border-border bg-popover p-1 shadow-xl">
          {STANDARD_PERIODS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => pick(p.value)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-[13px] flex items-center justify-between hover:bg-accent transition-colors ${period === p.value ? 'text-primary font-medium' : 'text-foreground'}`}
            >
              {p.label}
              {period === p.value && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}

          {period === 'custom' && (
            <div className="mt-1 border-t border-border pt-2.5 px-1.5 pb-1.5 space-y-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Start</label>
                <input
                  type="date"
                  value={custom?.from || ''}
                  onChange={e => onCustomChange?.({ ...custom, from: e.target.value })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground/70">End</label>
                <input
                  type="date"
                  value={custom?.to || ''}
                  onChange={e => onCustomChange?.({ ...custom, to: e.target.value })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
