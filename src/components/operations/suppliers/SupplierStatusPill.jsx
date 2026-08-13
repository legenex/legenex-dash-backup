import React from 'react';

// Supplier lifecycle status pill. Colours use the app's design tokens so both
// themes work: new = muted grey, active = positive, paused = warning,
// terminated = accent.
const STATUS_CLASS = {
  new: 'bg-muted text-muted-foreground',
  active: 'bg-status-sold status-sold',
  paused: 'bg-status-unsold status-unsold border border-[hsl(38_80%_57%)]/50',
  terminated: 'bg-primary/15 text-primary',
};

export default function SupplierStatusPill({ status }) {
  const key = String(status || 'new').toLowerCase();
  const cls = STATUS_CLASS[key] || STATUS_CLASS.new;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold px-2 py-0.5 text-[11px] capitalize ${cls}`}>
      {key}
    </span>
  );
}