import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { PERIODS, PERIOD_LABELS } from '@/lib/periodRange';

// Reusable period selector matching the Overview style: pill presets
// (Today, Yesterday, Last 7, This Month, Last Month, Last 60) plus a Custom
// visual date range picker, plus a compact dropdown. This Month is the default.
//
// Controlled via `period` + `custom` ({ from, to }) with onPeriodChange /
// onCustomChange callbacks, mirroring resolvePeriod's contract in periodRange.
export default function LeadsPeriodFilter({
  period = 'this_month',
  custom,
  onPeriodChange,
  onCustomChange,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (v) => {
    onPeriodChange?.(v);
    if (v !== 'custom') setOpen(false);
  };

  const buttonLabel = period === 'custom' && custom?.from
    ? `${custom.from} to ${custom.to || '...'}`
    : (PERIOD_LABELS[period] || 'This Month');

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {/* Pill presets */}
      <div className="inline-flex items-center bg-card border border-border rounded-lg p-0.5">
        {PERIODS.map((p) => {
          const active = p.value === period;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => pick(p.value)}
              className={`px-2.5 py-1.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Compact dropdown mirror + custom range picker */}
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card text-[13px] text-foreground hover:bg-accent transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium whitespace-nowrap">{buttonLabel}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-lg border border-border bg-popover p-1 shadow-xl">
            {PERIODS.map((p) => (
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
                    onChange={(e) => onCustomChange?.({ ...custom, from: e.target.value })}
                    className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground/70">End</label>
                  <input
                    type="date"
                    value={custom?.to || ''}
                    onChange={(e) => onCustomChange?.({ ...custom, to: e.target.value })}
                    className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}