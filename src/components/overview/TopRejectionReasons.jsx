import React from 'react';

// Non-sold leads grouped by rejection reason.
// Reason = queue_reason when present, otherwise the final_status name.
export default function TopRejectionReasons({ leads }) {
  const reasons = {};
  for (const l of leads) {
    if (l.final_status === 'Sold') continue;
    const reason = (l.queue_reason && String(l.queue_reason).trim()) || l.final_status || 'Unknown';
    if (!reasons[reason]) reasons[reason] = { count: 0, suppliers: new Set() };
    reasons[reason].count++;
    if (l.supplier_name) reasons[reason].suppliers.add(l.supplier_name);
  }

  const totalNonSold = Object.values(reasons).reduce((s, r) => s + r.count, 0);

  const rows = Object.entries(reasons)
    .map(([reason, v]) => ({
      reason,
      count: v.count,
      suppliers: [...v.suppliers].sort(),
      pct: totalNonSold > 0 ? Math.round((v.count / totalNonSold) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="bg-card border border-border rounded-[10px] overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="text-[13px] font-semibold text-foreground">Top Rejection Reasons</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">Non-sold leads grouped by reason - ranked by volume. Fix the top source first.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Reason</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-20">Count</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-24">% of Non-Sold</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Source Suppliers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-[13px]">No non-sold leads in this range</td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.reason} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{row.reason}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-right">{row.count}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-right text-muted-foreground">{row.pct}%</td>
                  <td className="px-4 py-3 text-[12px]">
                    <div className="flex flex-wrap gap-1">
                      {row.suppliers.map(s => (
                        <span key={s} className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground text-[11px]">{s}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}