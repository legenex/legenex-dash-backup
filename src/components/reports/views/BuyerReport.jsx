import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import {
  applyFilters, spendInWindow, allocatedLeadCost, leadField, money, pct, int,
} from '@/lib/reportMetrics';
import { ReportKpi, THead, TRow, AINote } from '@/components/reports/reportViewAtoms';

const TEMPLATE = '1.6fr repeat(7, 1fr)';
const COLS = ['Buyer', 'Leads', 'Sold', 'Cost', 'CPL', 'Revenue', 'Profit', 'Margin'];

function norm(v) { return String(v ?? '').trim().toLowerCase(); }
function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

// Buyer Performance.
//
// Cost on a buyer row is the acquisition cost of the leads that buyer received,
// allocated per lead: a posted price for external suppliers, an even share of
// that supplier's daily ad spend for Meta sourced ones. That is what makes a
// buyer CPL comparable to the price the buyer pays, which is the whole point of
// the report.
//
// The allocation denominator is every lead in the period, not just this buyer's,
// so the shares stay honest. Suppliers are deliberately absent from the filter
// set here: filtering by supplier would change which leads count toward a buyer
// without changing what that buyer was actually sold.
export default function BuyerReport({ leads, adSpend, buyers = [], filters }) {
  const { rows, totals, selected } = useMemo(() => {
    const scoped = applyFilters(leads, filters);
    const spend = spendInWindow(adSpend, filters);
    const costOf = allocatedLeadCost(scoped, spend);

    const names = new Map();
    const add = (name) => {
      const key = norm(name);
      if (!key) return;
      if (!names.has(key)) names.set(key, String(name).trim());
    };
    for (const l of scoped) add(leadField(l, 'buyer'));
    if (filters?.buyer) add(filters.buyer);

    const rows = [...names.entries()].map(([key, label]) => {
      const buyerLeads = scoped.filter((l) => norm(leadField(l, 'buyer')) === key);
      let revenue = 0;
      let cost = 0;
      let sold = 0;
      let returned = 0;
      for (const l of buyerLeads) {
        revenue += num(l.revenue);
        cost += costOf.get(l) || 0;
        const s = String(l.final_status || '');
        if (s === 'Sold') sold++;
        if (s === 'Returned') returned++;
      }
      const record = buyers.find((b) => norm(b.company_name) === key);
      return {
        key,
        label,
        status: record?.status || '',
        leads: buyerLeads.length,
        sold,
        returned,
        cost,
        cpl: buyerLeads.length > 0 ? cost / buyerLeads.length : 0,
        revenue,
        profit: revenue - cost,
        margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const totals = rows.reduce((a, r) => ({
      leads: a.leads + r.leads,
      sold: a.sold + r.sold,
      returned: a.returned + r.returned,
      cost: a.cost + r.cost,
      revenue: a.revenue + r.revenue,
    }), { leads: 0, sold: 0, returned: 0, cost: 0, revenue: 0 });

    return { rows, totals, selected: filters?.buyer || '' };
  }, [leads, adSpend, buyers, filters]);

  const cpl = totals.leads > 0 ? totals.cost / totals.leads : 0;
  const profit = totals.revenue - totals.cost;
  const margin = totals.revenue > 0 ? (profit / totals.revenue) * 100 : 0;
  const thinnest = rows.reduce((b, r) => (r.revenue > 0 && (b === null || r.margin < b.margin) ? r : b), null);

  const exportCsv = () => {
    const header = COLS.join(',');
    const lines = rows.map((r) => [
      `"${r.label}"`, r.leads, r.sold, r.cost.toFixed(2), r.cpl.toFixed(2),
      r.revenue.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1),
    ].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'buyer-performance.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <ReportKpi label="Revenue" value={money(totals.revenue)} hint={selected || 'all buyers'} />
        <ReportKpi label="Cost" value={money(totals.cost)} hint="allocated acquisition" />
        <ReportKpi label="CPL" value={money(cpl)} hint={totals.leads > 0 ? `over ${int(totals.leads)} leads` : 'no leads'} />
        <ReportKpi label="Profit" value={money(profit)} tone={profit > 0 ? 'good' : 'risk'} />
        <ReportKpi label="Margin" value={totals.revenue > 0 ? pct(margin) : '-'} />
        <ReportKpi
          label="Returns"
          value={int(totals.returned)}
          tone={totals.returned > 0 ? 'risk' : undefined}
          hint={`${int(totals.sold)} sold`}
        />
      </div>

      <AINote>
        {totals.leads === 0
          ? 'No buyer activity in this period, so cost and CPL have no denominator.'
          : `${money(totals.revenue)} booked against ${money(totals.cost)} of allocated cost, a ${totals.revenue > 0 ? pct(margin) : '0%'} margin${thinnest ? `; ${thinnest.label} is the thinnest at ${pct(thinnest.margin)}` : ''}.`}
      </AINote>

      <div className="rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold text-foreground">Margin &amp; CPL by Buyer</h3>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 h-7 text-[11px]">
            <Download className="w-3 h-3" /> Export
          </Button>
        </div>
        <THead cols={COLS} template={TEMPLATE} />
        <div className="max-h-[560px] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground">
              No buyer activity in this period.
            </div>
          ) : rows.map((r) => (
            <TRow
              key={r.key}
              template={TEMPLATE}
              highlight={norm(r.label) === norm(selected)}
              cells={[
                <span key="b" className="flex items-center gap-2 truncate">
                  {r.label}
                  {r.status && (
                    <span className="text-[8.5px] font-semibold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
                      {r.status}
                    </span>
                  )}
                </span>,
                int(r.leads),
                int(r.sold),
                money(r.cost),
                money(r.cpl),
                money(r.revenue),
                money(r.profit),
                r.revenue > 0 ? pct(r.margin) : '-',
              ]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
