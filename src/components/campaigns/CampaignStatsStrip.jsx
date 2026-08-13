import React, { useMemo } from 'react';
import { campaignMetrics } from '@/lib/campaignMetrics';

const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;

// Stats strip for the campaign detail. Charts live only on the Overview page.
// Pure UI aggregation over records already loaded, no routing/billing logic.
export default function CampaignStatsStrip({ campaign, leads }) {
  const m = useMemo(() => campaignMetrics(campaign, leads), [campaign, leads]);

  const stats = [
    { label: 'Total', value: m.total },
    { label: 'Leads 14D', value: m.leads14d },
    { label: 'Acc %', value: pct(m.acceptedPct) },
    { label: 'DQ %', value: pct(m.dqPct) },
    { label: 'Returned %', value: pct(m.returnedPct) },
    { label: 'Revenue', value: money(m.revenue) },
    { label: 'Cost', value: money(m.cost) },
    { label: 'Profit', value: money(m.profit), accent: m.profit >= 0 },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px rounded-lg border border-border bg-border overflow-hidden">
      {stats.map((s) => (
        <div key={s.label} className="bg-card px-3 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
          <div className={`text-[15px] font-mono tabular-nums mt-0.5 ${s.accent === false ? 'text-primary' : 'text-foreground'}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}