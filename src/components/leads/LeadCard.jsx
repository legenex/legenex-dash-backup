import React from 'react';
import StatusPill from '@/components/shared/StatusPill';

// Compact relative age, e.g. 4h, 3d, 2w. The long form ("about 4 hours ago")
// forced the row onto two lines, which is what made the mobile list bulky.
function shortAge(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.round(days / 30)}mo`;
}

// Mobile-only lead row. One line: name, age, status, revenue. Rows sit inside
// the list card in LeadsTable, separated by a border, matching the list-row
// pattern in DESIGN-SYSTEM.md rather than a stack of individual cards.
export default function LeadCard({ lead, onOpen }) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
  const revenue = Number(lead.revenue) || 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(lead)}
      className="w-full text-left px-3 py-2 flex items-center gap-2 border-b border-border last:border-b-0 active:bg-accent/50 transition-colors"
    >
      <span className="text-[13.5px] font-medium text-foreground truncate min-w-0 flex-1">{name}</span>
      <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{shortAge(lead.created_date)}</span>
      {lead.final_status && (
        <span className="shrink-0">
          <StatusPill status={lead.final_status} />
        </span>
      )}
      <span className="text-[12px] font-mono text-foreground shrink-0 tabular-nums w-[58px] text-right">
        ${revenue.toFixed(2)}
      </span>
    </button>
  );
}
