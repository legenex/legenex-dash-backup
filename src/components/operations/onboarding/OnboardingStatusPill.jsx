import React from 'react';

// Onboarding lifecycle status pill. Colours use the app's design tokens so both
// light and dark themes work: submitted = muted grey, in_progress = warning
// token, blocked = accent token, complete = positive token, cancelled = muted
// with strikethrough.
const STATUS_CLASS = {
  submitted: 'bg-muted text-muted-foreground',
  in_progress: 'bg-status-unsold status-unsold',
  blocked: 'bg-primary/15 text-primary',
  complete: 'bg-status-sold status-sold',
  cancelled: 'bg-muted text-muted-foreground line-through',
};

const STATUS_LABEL = {
  submitted: 'submitted',
  in_progress: 'in progress',
  blocked: 'blocked',
  complete: 'complete',
  cancelled: 'cancelled',
};

export default function OnboardingStatusPill({ status }) {
  const key = String(status || 'submitted').toLowerCase();
  const cls = STATUS_CLASS[key] || STATUS_CLASS.submitted;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold px-2 py-0.5 text-[11px] ${cls}`}>
      {STATUS_LABEL[key] || key}
    </span>
  );
}