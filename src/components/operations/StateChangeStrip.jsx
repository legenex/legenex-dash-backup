import React from 'react';
import { formatDistanceToNowStrict } from 'date-fns';

// Horizontally scrolling row of state-change chips, newest first. Closed chips
// use the accent colour, opened the positive token, repriced the warning token.
// Clicking a chip navigates to the active states page filtered to that state.

function chipTone(direction) {
  switch (direction) {
    case 'closed': return 'border-primary/40 bg-primary/10 text-primary';
    case 'opened': return 'border-[hsl(152_65%_54%/0.4)] bg-status-sold status-sold';
    case 'repriced': return 'border-[hsl(38_80%_57%/0.4)] bg-status-unsold status-unsold';
    default: return 'border-border bg-card text-foreground';
  }
}

function chipLabel(c) {
  const when = c.created_date ? formatDistanceToNowStrict(new Date(c.created_date)) + ' ago' : '';
  if (c.direction === 'repriced' && c.old_cpl != null && c.new_cpl != null) {
    return `${c.state} repriced ${Math.round(c.old_cpl)} to ${Math.round(c.new_cpl)}`;
  }
  return `${c.state} ${c.direction}${when ? ' ' + when : ''}`;
}

export default function StateChangeStrip({ changes = [], onSelect }) {
  if (!changes || changes.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground px-1">No state changes in the last 7 days.</p>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
      {changes.map((c, i) => (
        <button
          key={`${c.state}-${c.created_date}-${i}`}
          onClick={() => onSelect?.(c.state)}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-colors hover:opacity-90 ${chipTone(c.direction)}`}
          title={c.vertical ? `${c.vertical} - ${c.state}` : c.state}
        >
          {chipLabel(c)}
        </button>
      ))}
    </div>
  );
}