import React from 'react';
import { Link } from 'react-router-dom';

// Horizontal strip of counts per final_status for the period. Each count links
// to the matching Leads view. Reads the passed leads only, never fabricates rows.
const STATUSES = [
  { key: 'Processing', label: 'Processing', cls: 'status-processing', to: '/leads' },
  { key: 'Sold', label: 'Sold', cls: 'status-sold', to: '/leads/sold' },
  { key: 'Unsold', label: 'Unsold', cls: 'status-unsold', to: '/leads/unsold' },
  { key: 'Disqualified', label: 'Disqualified', cls: 'status-disqualified', to: '/leads/disqualified' },
  { key: 'Queued', label: 'Queued', cls: 'status-queued', to: '/leads/queued' },
  { key: 'Returned', label: 'Returned', cls: 'status-returned', to: '/leads' },
  { key: 'Duplicate', label: 'Duplicate', cls: 'status-duplicate', to: '/leads' },
  { key: 'Error', label: 'Error', cls: 'status-error', to: '/leads' },
];

export default function PipelineHealthStrip({ leads = [] }) {
  const counts = {};
  for (const l of leads) {
    const s = l.final_status || 'Processing';
    counts[s] = (counts[s] || 0) + 1;
  }

  if (leads.length === 0) {
    return (
      <div className="p-5 text-center text-[13px] text-muted-foreground">No leads in this period</div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 p-4">
      {STATUSES.map(s => (
        <Link
          key={s.key}
          to={s.to}
          className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-3 py-3 hover:bg-accent/40 transition-colors"
        >
          <span className={`text-[20px] font-semibold font-mono ${s.cls}`}>{counts[s.key] || 0}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 text-center">{s.label}</span>
        </Link>
      ))}
    </div>
  );
}