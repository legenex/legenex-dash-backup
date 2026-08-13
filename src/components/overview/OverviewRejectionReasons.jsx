import React, { useMemo } from 'react';

// Ranked list of the most common queue_reason values across Queued, Disqualified
// and Error leads in the period. Shows reason text, count and share of total.
// Capped at the top 8. Reads the passed period-filtered leads only.
const REASON_STATUSES = new Set(['Queued', 'Disqualified', 'Error']);

export default function OverviewRejectionReasons({ leads = [] }) {
  const { rows, total } = useMemo(() => {
    const reasons = {};
    let t = 0;
    for (const l of leads) {
      if (!REASON_STATUSES.has(l.final_status)) continue;
      const reason = (l.queue_reason && String(l.queue_reason).trim()) || l.final_status || 'Unknown';
      reasons[reason] = (reasons[reason] || 0) + 1;
      t++;
    }
    const list = Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count, pct: t > 0 ? Math.round((count / t) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return { rows: list, total: t };
  }, [leads]);

  if (rows.length === 0) {
    return <div className="h-[220px] flex items-center justify-center text-[13px] text-muted-foreground">No rejected leads in this period</div>;
  }

  return (
    <div className="p-4 space-y-2">
      {rows.map(row => (
        <div key={row.reason}>
          <div className="flex items-center justify-between text-[12px] mb-1">
            <span className="text-foreground truncate max-w-[220px]">{row.reason}</span>
            <span className="font-mono text-muted-foreground">{row.count} <span className="text-muted-foreground/60">({row.pct}%)</span></span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div className="h-full bg-primary/70 rounded-full" style={{ width: `${row.pct}%` }} />
          </div>
        </div>
      ))}
      <div className="text-[10px] text-muted-foreground pt-1">{total} rejected leads total</div>
    </div>
  );
}