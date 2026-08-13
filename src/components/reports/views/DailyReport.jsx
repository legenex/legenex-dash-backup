import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { dailySeries, applyFilters, money, seriesWindow, spendInWindow } from '@/lib/reportMetrics';
import { ReportKpi, THead, TRow, AINote } from '@/components/reports/reportViewAtoms';

const TEMPLATE = '1.3fr repeat(7, 1fr)';
const COLS = ['Date', 'Leads', 'Sold', 'Revenue', 'Cost', 'Spend', 'CPL', 'Profit'];

// A day's true cost is what the leads cost plus what the ads cost, and CPL is
// that over the leads received. Cost alone hides the ad side entirely on a Meta
// sourced day, where the per-lead posted cost is zero.
const dayCost = (r) => r.cost + r.spend;
const dayCpl = (r) => (r.leads > 0 ? dayCost(r) / r.leads : 0);

function fmtDay(key) {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

export default function DailyReport({ leads, adSpend, filters }) {
  // The table covers the selected date range. Without this it always showed the
  // trailing 14 days from today and went blank for any other period.
  const rows = useMemo(
    () => dailySeries(applyFilters(leads, filters), spendInWindow(adSpend, filters), 14, seriesWindow(filters)),
    [leads, adSpend, filters]
  );

  const stats = useMemo(() => {
    const n = rows.length || 1;
    const totalLeads = rows.reduce((a, r) => a + r.leads, 0);
    const totalSold = rows.reduce((a, r) => a + r.sold, 0);
    const totalProfit = rows.reduce((a, r) => a + r.profit, 0);
    const activeCount = rows.filter(r => r.leads > 0).length;
    const silent = rows.length - activeCount;
    const best = rows.reduce((b, r) => (r.leads > (b?.leads ?? -1) ? r : b), null);
    const totalCost = rows.reduce((a, r) => a + dayCost(r), 0);
    return {
      totalLeads, totalSold, totalProfit, activeCount, silent, totalCost,
      cpl: totalLeads > 0 ? totalCost / totalLeads : 0,
      avgLeads: totalLeads / n,
      avgProfit: totalProfit / n,
      best,
    };
  }, [rows]);

  const bestDate = stats.best ? fmtDay(stats.best.date) : '-';
  const bestLeads = stats.best?.leads ?? 0;

  const exportCsv = () => {
    const header = COLS.join(',');
    const lines = [...rows].reverse().map(r =>
      [fmtDay(r.date), r.leads, r.sold, r.revenue.toFixed(2), r.cost.toFixed(2), r.spend.toFixed(2), dayCpl(r).toFixed(2), r.profit.toFixed(2)].join(',')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'daily-metrics.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <ReportKpi label="Cost" value={money(stats.totalCost)} hint="lead cost + ad spend" />
        <ReportKpi label="CPL" value={money(stats.cpl)} hint={stats.totalLeads > 0 ? `over ${stats.totalLeads} leads` : 'no leads'} />
        <ReportKpi
          label="Best Day"
          value={bestDate}
          hint={`${bestLeads} leads${stats.activeCount === 1 ? ' - only active day' : ''}`}
        />
        <ReportKpi
          label="Daily Avg Leads"
          value={stats.avgLeads.toFixed(2)}
          hint={`over ${rows.length} days`}
        />
        <ReportKpi
          label="Active Days"
          value={`${stats.activeCount}/${rows.length}`}
          tone={stats.activeCount * 2 < rows.length ? 'risk' : undefined}
          hint={`${stats.silent} silent days`}
        />
        <ReportKpi
          label="Daily Avg Profit"
          value={money(stats.avgProfit)}
          tone={stats.avgProfit > 0 ? 'good' : undefined}
          hint={stats.totalSold === 0 ? 'no sold leads' : undefined}
        />
      </div>

      <AINote>
        {`${stats.silent} of ${rows.length} days are silent; ${bestDate} is the latest ingestion signal.`}
      </AINote>

      <div className="rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold text-foreground">Daily Metrics</h3>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 h-7 text-[11px]">
            <Download className="w-3 h-3" /> Export
          </Button>
        </div>
        <THead cols={COLS} template={TEMPLATE} />
        <div className="max-h-[520px] overflow-y-auto">
          {[...rows].reverse().map((r) => (
            <TRow
              key={r.date}
              template={TEMPLATE}
              highlight={r.leads > 0}
              cells={[
                <span key="d" className="flex items-center gap-2">
                  {fmtDay(r.date)}
                  {r.leads > 0 && (
                    <span className="text-[8.5px] font-semibold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded"
                      style={{ color: '#3DD68C', background: 'rgba(61,214,140,0.12)' }}>active</span>
                  )}
                </span>,
                r.leads,
                r.sold,
                money(r.revenue),
                money(r.cost),
                money(r.spend),
                money(dayCpl(r)),
                money(r.profit),
              ]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}