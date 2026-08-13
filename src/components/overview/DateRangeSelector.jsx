import React from 'react';

export const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All Time' },
];

export const RANGE_LABELS = RANGES.reduce((m, r) => { m[r.value] = r.label; return m; }, {});

export default function DateRangeSelector({ value, onChange }) {
  return (
    <div className="inline-flex items-center bg-card border border-border rounded-lg p-0.5">
      {RANGES.map(r => {
        const active = r.value === value;
        return (
          <button
            key={r.value}
            onClick={() => onChange(r.value)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}