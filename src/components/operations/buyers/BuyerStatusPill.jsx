import React from 'react';

// Buyer lifecycle status pill. Colours use the app's design tokens so both
// themes work: draft = muted grey, launching = warning, active = positive,
// paused = warning with an outline, terminated = accent.
const STATUS_CLASS = {
  draft: 'bg-muted text-muted-foreground',
  launching: 'bg-status-unsold status-unsold',
  active: 'bg-status-sold status-sold',
  paused: 'bg-status-unsold status-unsold border border-[hsl(38_80%_57%)]/50',
  terminated: 'bg-primary/15 text-primary',
};

export default function BuyerStatusPill({ status }) {
  const key = String(status || 'draft').toLowerCase();
  const cls = STATUS_CLASS[key] || STATUS_CLASS.draft;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold px-2 py-0.5 text-[11px] capitalize ${cls}`}>
      {key}
    </span>
  );
}