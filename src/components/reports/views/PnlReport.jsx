import React, { useMemo } from 'react';
import { TrendingUp, ArrowDown, Scale } from 'lucide-react';
import { applyFilters, computeMetrics, money, spendInWindow } from '@/lib/reportMetrics';
import { internalSupplierSet } from '@/lib/reportMetrics';
import { ReportKpi, AINote } from '@/components/reports/reportViewAtoms';

const GREEN = '#3DD68C';
const RED = '#E5484D';

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

const PnlLine = ({ item }) => {
  const isIn = item.kind === 'in' || item.kind === 'net';
  const isOut = item.kind === 'out';
  const isTotal = item.kind === 'total';
  const Icon = isIn ? TrendingUp : isOut ? ArrowDown : Scale;
  const iconColor = isIn ? GREEN : isOut ? RED : undefined;
  const valueColor = isIn ? GREEN : isOut ? RED : 'hsl(var(--foreground))';
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border ${isTotal || item.kind === 'net' ? 'bg-background/40' : ''}`}>
      <div className={`flex items-center gap-2 ${isOut ? 'pl-4' : ''}`}>
        <Icon className="w-3.5 h-3.5" style={{ color: iconColor || 'hsl(var(--muted-foreground))' }} />
        <span className={`text-[12px] ${isTotal || item.kind === 'net' ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{item.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-0.5 w-10 rounded-full opacity-60" style={{ background: valueColor }} />
        <span className="text-[12.5px] font-mono tabular-nums font-semibold" style={{ color: valueColor }}>{money(item.value)}</span>
      </div>
    </div>
  );
};

export default function PnlReport({ leads, adSpend, bankTx, suppliers = [], filters }) {
  const { m, lines, grossProfit, netProfit, verified, gap } = useMemo(() => {
    const f = applyFilters(leads, filters);
    // Spend carries its own date, so it has to be windowed separately or the
    // statement charges a month of revenue against the whole spend history.
    const m = computeMetrics(f, spendInWindow(adSpend, filters), internalSupplierSet(suppliers));

    const techTotal = Math.abs(bankTx.filter(t => t.category === 'tech').reduce((a, t) => a + num(t.amount), 0));
    const otherTotal = Math.abs(bankTx.filter(t => ['other', 'media', 'personal'].includes(t.category)).reduce((a, t) => a + num(t.amount), 0));
    const verified = bankTx.filter(t => t.category === 'revenue').reduce((a, t) => a + num(t.amount), 0);

    const grossProfit = m.net_revenue - m.cost - m.ad_spend;
    const netProfit = grossProfit - techTotal - otherTotal;
    const gap = m.booked_revenue - verified;

    const lines = [
      { label: 'Booked Revenue', value: m.booked_revenue, kind: 'in' },
      { label: 'Returns & Short-Pays', value: -(m.booked_revenue - m.net_revenue), kind: 'out' },
      { label: 'Net Revenue', value: m.net_revenue, kind: 'total' },
      { label: 'Supplier Lead Cost', value: -(m.cost), kind: 'out' },
      { label: 'Ad Spend', value: -(m.ad_spend), kind: 'out' },
      { label: 'Total Lead Cost', value: -(m.total_cost), kind: 'total' },
      { label: 'Gross Profit', value: grossProfit, kind: 'total' },
      { label: 'Tech & Tools', value: -techTotal, kind: 'out' },
      { label: 'Other Operating', value: -otherTotal, kind: 'out' },
      { label: 'Net Profit', value: netProfit, kind: 'net' },
    ];

    return { m, lines, grossProfit, netProfit, verified, gap };
  }, [leads, adSpend, bankTx, filters]);

  const grossMargin = m.net_revenue > 0 ? `${((grossProfit / m.net_revenue) * 100).toFixed(1)}%` : '-';
  const cashConversion = bankTx.length && m.booked_revenue > 0 ? `${((verified / m.booked_revenue) * 100).toFixed(1)}%` : '-';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <ReportKpi label="Net Revenue" value={money(m.net_revenue)} hint="after returns" />
        <ReportKpi label="Cost" value={money(m.total_cost)} hint="lead cost + ad spend" />
        <ReportKpi label="CPL" value={money(m.blended_cpl)} hint={m.total_leads > 0 ? `over ${m.total_leads} leads` : 'no leads'} />
        <ReportKpi label="Gross Margin" value={grossMargin} hint={m.net_revenue > 0 ? undefined : 'no revenue basis'} />
        <ReportKpi label="Net Profit" value={money(netProfit)} tone={netProfit > 0 ? 'good' : undefined} hint={`bank-verified: ${money(verified)}`} />
        <ReportKpi
          label="Cash Conversion"
          value={cashConversion}
          tone={bankTx.length === 0 ? 'risk' : undefined}
          hint={bankTx.length === 0 ? 'bank feed offline' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
        <div className="rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-[13px] font-semibold text-foreground">Profit & Loss Statement</h3>
            <span className="text-[8.5px] font-semibold tracking-[0.08em] uppercase px-2 py-0.5 rounded tag-neutral">accrual - this period</span>
          </div>
          {lines.map((item) => <PnlLine key={item.label} item={item} />)}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-[13px] font-semibold text-foreground">Accrual vs Cash</h3>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-[12px] text-muted-foreground">Booked (accrual)</span>
              <span className="text-[12.5px] font-mono tabular-nums text-foreground">{money(m.booked_revenue)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-[12px] text-muted-foreground">Verified (bank)</span>
              <span className="text-[12.5px] font-mono tabular-nums" style={{ color: GREEN }}>{money(verified)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/40">
              <span className="text-[12px] font-semibold text-foreground">Gap</span>
              <span className="text-[12.5px] font-mono tabular-nums font-semibold" style={{ color: RED }}>{money(gap)}</span>
            </div>
            <p className="px-4 py-2.5 text-[10.5px] text-muted-foreground">
              P&L is accrual-based. Cash truth requires the Mercury bank feed.
            </p>
          </div>

          <AINote>
            {bankTx.length === 0
              ? `Net profit is ${money(netProfit)} on ${money(m.net_revenue)} net revenue; no bank feed connected, so cash conversion is unverified.`
              : `Net profit is ${money(netProfit)} on ${money(m.net_revenue)} net revenue; ${money(verified)} of ${money(m.booked_revenue)} booked is bank-verified, leaving a ${money(gap)} gap.`}
          </AINote>
        </div>
      </div>
    </div>
  );
}