import React from 'react';
import { APPLY_STATES } from './applyConstants';

// A compact grid of toggleable state chips. Selected states highlight in the
// primary accent. Used on the coverage step of the public onboarding flow.
export default function StateMultiSelect({ selected = [], onChange, error }) {
  const set = new Set(selected);

  const toggle = (code) => {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(Array.from(next));
  };

  const allSelected = selected.length === APPLY_STATES.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Target states<span className="text-primary ml-0.5">*</span>
        </label>
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : [...APPLY_STATES])}
          className="text-[12px] font-medium text-primary hover:underline"
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
        {APPLY_STATES.map((code) => {
          const on = set.has(code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              className={`h-9 rounded-md border text-[12px] font-semibold font-mono transition-colors ${
                on
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {code}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[12px] text-muted-foreground">
        {selected.length} selected
      </div>
      {error && <div className="mt-1 text-[12px] text-primary">{error}</div>}
    </div>
  );
}