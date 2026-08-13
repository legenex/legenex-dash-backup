import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import {
  applyFilters, computeMetrics, spendInWindow, leadField, money, pct, int,
} from '@/lib/reportMetrics';
import { internalSupplierSet } from '@/lib/reportMetrics';
import { ReportKpi, THead, TRow, AINote } from '@/components/reports/reportViewAtoms';
import { resolveSource, supplierPayoutForWindow } from '@/lib/supplierCost';

const TEMPLATE = '1.6fr repeat(8, 1fr)';
const COLS = ['Supplier', 'Leads', 'Sold', 'Cost', 'CPL', 'Revenue', 'Profit', 'Margin', 'Payout'];

function norm(v) { return String(v ?? '').trim().toLowerCase(); }

// Supplier Performance.
//
// A supplier costs us money one of two ways and never both: an external
// supplier posts its price on each lead (mapped_fields.cpl), and a Meta sourced
// supplier costs whatever ad spend was attributed to it during the period. Cost
// here is the sum of the two so a single column is true for both kinds, and CPL
// is that cost over the leads received, which is the only CPL that means
// anything on a Meta sourced supplier.
//
// Cost and Payout are different numbers and both matter. Cost is what acquiring
// the leads cost us. Payout is what the supplier is OWED under their payout
// type: a flat-CPL source is owed what its leads cost, so the two match, but a
// profit-share supplier like LeadFlow is owed a percentage of (revenue minus
// cost) ON TOP of the ad spend, so they diverge entirely.
//
// Buyers are deliberately absent from this report. Who bought a lead does not
// change what the lead cost to acquire, so a buyer filter here would silently
// shrink the denominator of CPL and produce a number that is not a CPL.
export default function SupplierReport({ leads, adSpend, suppliers = [], supplierSources = [], filters }) {
  const { rows, totals, selected } = useMemo(() => {
    const scoped = applyFilters(leads, filters);
    const spend = spendInWindow(adSpend, filters);

    // Every supplier that either sent a lead or cost money in the period, plus
    // any configured supplier the filter explicitly selected, so choosing a
    // silent supplier shows a zero row rather than an empty table.
    const names = new Map();
    const add = (name) => {
      const key = norm(name);
      if (!key) return;
      if (!names.has(key)) names.set(key, String(name).trim());
    };
    for (const l of scoped) add(l.supplier_name || leadField(l, 'supplier_name'));
    for (const r of spend) add(r.supplier_name);
    if (filters?.supplier_name) add(filters.supplier_name);

    const rows = [...names.entries()].map(([key, label]) => {
      const supLeads = scoped.filter((l) => norm(l.supplier_name || leadField(l, 'supplier_name')) === key);
      const supSpend = spend.filter((r) => norm(r.supplier_key || r.supplier_name) === key);
      const m = computeMetrics(supLeads, supSpend, internalSupplierSet(suppliers));
      const record = suppliers.find((s) => norm(s.name) === key);
      // Payout uses the supplier's own sources, since the payout rule lives on
      // the source (falling back to the supplier-level payout_type). Profit
      // share is computed on the window totals, never per lead, so it always
      // reflects the date range on screen.
      const sources = record ? supplierSources.filter((s) => s.supplier_id === record.id) : [];
      const pricedLeads = supLeads.map((lead) => ({
        lead,
        cost: 0,
        sourceId: resolveSource(lead, sources)?.id || null,
      }));
      const payout = record
        ? supplierPayoutForWindow(record, sources, pricedLeads, m.revenue, m.total_cost)
        : 0;
      return {
        key,
        label,
        type: record?.supplier_type || '',
        leads: m.total_leads,
        sold: m.sold,
        cost: m.total_cost,
        cpl: m.blended_cpl,
        revenue: m.revenue,
        profit: m.revenue - m.total_cost,
        margin: m.revenue > 0 ? ((m.revenue - m.total_cost) / m.revenue) * 100 : 0,
        payout,
      };
    }).sort((a, b) => b.cost - a.cost);

    const totals = rows.reduce((a, r) => ({
      leads: a.leads + r.leads,
      sold: a.sold + r.sold,
      cost: a.cost + r.cost,
      revenue: a.revenue + r.revenue,
      payout: a.payout + r.payout,
    }), { leads: 0, sold: 0, cost: 0, revenue: 0, payout: 0 });

    return { rows, totals, selected: filters?.supplier_name || '' };
  }, [leads, adSpend, suppliers, supplierSources, filters]);

  const blendedCpl = totals.leads > 0 ? totals.cost / totals.leads : 0;
  const profit = totals.revenue - totals.cost;
  const margin = totals.revenue > 0 ? (profit / totals.revenue) * 100 : 0;
  const dearest = rows.reduce((b, r) => (r.leads > 0 && r.cpl > (b?.cpl ?? -1) ? r : b), null);

  const exportCsv = () => {
    const header = COLS.join(',');
    const lines = rows.map((r) => [
      `"${r.label}"`, r.leads, r.sold, r.cost.toFixed(2), r.cpl.toFixed(2),
      r.revenue.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1), r.payout.toFixed(2),
    ].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'supplier-performance.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-2 lg:gap-3">
        <ReportKpi label="Cost" value={money(totals.cost)} hint={selected || 'all suppliers'} />
        <ReportKpi label="CPL" value={money(blendedCpl)} hint={totals.leads > 0 ? `over ${int(totals.leads)} leads` : 'no leads'} />
        <ReportKpi label="Revenue" value={money(totals.revenue)} />
        <ReportKpi label="Profit" value={money(profit)} tone={profit > 0 ? 'good' : 'risk'} />
        <ReportKpi label="Margin" value={totals.revenue > 0 ? pct(margin) : '-'} />
        <ReportKpi label="Payout" value={money(totals.payout)} hint="owed to suppliers" />
        <ReportKpi label="Suppliers" value={int(rows.length)} hint={`${int(totals.sold)} sold`} />
      </div>

      <AINote>
        {totals.leads === 0
          ? 'No supplier leads in this period, so cost and CPL have no denominator.'
          : `${money(totals.cost)} acquired ${int(totals.leads)} leads at ${money(blendedCpl)} CPL${dearest ? `; ${dearest.label} is the most expensive at ${money(dearest.cpl)}` : ''}.`}
      </AINote>

      <div className="rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold text-foreground">Cost, CPL &amp; Payout by Supplier</h3>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 h-7 text-[11px]">
            <Download className="w-3 h-3" /> Export
          </Button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <THead cols={COLS} template={TEMPLATE} />
            <div className="max-h-[560px] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground">
              No supplier activity in this period.
            </div>
          ) : rows.map((r) => (
            <TRow
              key={r.key}
              template={TEMPLATE}
              highlight={norm(r.label) === norm(selected)}
              cells={[
                <span key="s" className="flex items-center gap-2 truncate">
                  {r.label}
                  {r.type && (
                    <span className="text-[8.5px] font-semibold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
                      {r.type}
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
                money(r.payout),
              ]}
            />
          ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
