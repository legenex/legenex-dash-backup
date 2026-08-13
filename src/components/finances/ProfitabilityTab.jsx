import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { isWithinInterval } from 'date-fns';
import {
  ResponsiveContainer, ComposedChart, LineChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceDot, ReferenceLine, Legend,
} from 'recharts';
import { AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/finances/financeAtoms';
import { money, spendRows } from '@/lib/reportMetrics';
import { buildProfitability, breakeven, breakevenCurve, monthlySeries } from '@/lib/profitability';

const VIEWS = [
  { key: 'breakdown', label: 'Breakdown', icon: BarChart3 },
  { key: 'breakeven', label: 'Breakeven', icon: TrendingUp },
];

const CLASS_ORDER = ['variable', 'fixed', 'drawings'];
const CLASS_LABEL = { variable: 'Variable', fixed: 'Fixed', drawings: 'Drawings' };

// Small stat card matching the finance dark styling.
const Stat = ({ label, value, sub, tone }) => {
  const valueClass = tone === 'good' ? 'status-sold' : tone === 'risk' ? 'text-primary' : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)]">
      <div className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70 truncate">{label}</div>
      <div className={`text-[16px] sm:text-[18px] lg:text-[20px] font-bold font-mono tabular-nums mt-1.5 truncate ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  );
};

const classBadge = (cls) => (
  <Badge variant="outline" className="text-[10px] capitalize text-muted-foreground border-border">{CLASS_LABEL[cls] || cls}</Badge>
);

export default function ProfitabilityTab({ win, leads = [], adSpend = [], settings }) {
  const [view, setView] = useState('breakdown');
  const [basis, setBasis] = useState('bank'); // 'bank' | 'booked'

  const { data: mappings = [] } = useQuery({ queryKey: ['adspend-mappings'], queryFn: () => base44.entities.AdSpendMapping.list() });
  const { data: allTxns = [] } = useQuery({ queryKey: ['bank-txns'], queryFn: () => base44.entities.BankTransaction.list('-date', 500) });

  const inWin = (d) => { if (!d) return false; try { return isWithinInterval(new Date(d), { start: win.start, end: win.end }); } catch { return false; } };

  const txns = useMemo(() => allTxns.filter((t) => inWin(t.date)), [allTxns, win]);
  const winLeads = useMemo(() => leads.filter((l) => inWin(l.created_date)), [leads, win]);
  const winAdSpend = useMemo(() => spendRows(adSpend).filter((a) => inWin(a.date)), [adSpend, win]);

  const model = useMemo(
    () => buildProfitability({ txns, leads: winLeads, adSpend: winAdSpend, mappings, settings }),
    [txns, winLeads, winAdSpend, mappings, settings],
  );
  const series = useMemo(() => monthlySeries({ txns, settings }), [txns, settings]);

  const { uncategorized, costRows, totals, ads, leadCount } = model;
  const net = totals.revenueBank - totals.costTotal;

  // Cost table grouped by class, with subtotals.
  const grouped = CLASS_ORDER.map((cls) => ({
    cls,
    rows: costRows.filter((r) => r.cost_class === cls),
    subtotal: costRows.filter((r) => r.cost_class === cls).reduce((a, r) => a + r.amount, 0),
  }));
  const costGrandTotal = totals.costTotal; // fixed + variable only, drawings excluded from the % base

  // Breakeven inputs from the selected basis.
  const beRevenue = basis === 'bank' ? totals.revenueBank : totals.revenueBooked;
  const otherRevenue = basis === 'bank' ? totals.revenueBooked : totals.revenueBank;
  const be = useMemo(
    () => breakeven({ fixed: totals.fixed, variable: totals.variable, revenue: beRevenue, leadCount }),
    [totals.fixed, totals.variable, beRevenue, leadCount],
  );
  const curve = useMemo(() => {
    if (!be.ok) return [];
    return breakevenCurve({
      fixed: totals.fixed,
      revenuePerLead: be.revenuePerLead,
      variablePerLead: be.variablePerLead,
      breakevenLeads: be.breakevenLeads,
      leadCount,
    });
  }, [be, totals.fixed, leadCount]);

  const axisStyle = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
  const tooltipStyle = {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 11,
    color: 'hsl(var(--foreground))',
  };

  return (
    <div className="space-y-4">
      {/* Uncategorized banner */}
      {uncategorized.count > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-border status-warn-bg p-3.5">
          <AlertTriangle className="w-4 h-4 status-unsold shrink-0 mt-0.5" />
          <div className="text-[12.5px] text-foreground">
            <span className="font-semibold">{uncategorized.count} uncategorized transactions</span> totalling{' '}
            <span className="font-mono">{money(uncategorized.out)}</span> out are excluded from every number on this page.
            The breakeven is understated until they are cleared.{' '}
            <a href="/finances?tab=bank" className="text-primary underline underline-offset-2">Categorize them in the Bank Feed.</a>
          </div>
        </div>
      )}

      {/* View pills */}
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors ${view === v.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              <Icon className="w-3.5 h-3.5" /> {v.label}
            </button>
          );
        })}
      </div>

      {view === 'breakdown' && (
        <div className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Revenue (bank)" value={money(totals.revenueBank)} sub={`Booked lead revenue ${money(totals.revenueBooked)}`} tone="good" />
            <Stat label="Fixed Costs" value={money(totals.fixed)} />
            <Stat label="Variable Costs" value={money(totals.variable)} />
            <Stat label="Net" value={money(net)} tone={net >= 0 ? 'good' : 'risk'} sub="Revenue (bank) minus fixed and variable" />
          </div>

          {/* Cost table */}
          <Panel className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border/60 text-[13px] font-semibold text-foreground">Cost Breakdown</div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead>
                <tr className="border-b border-border/60 bg-background/40 text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70">
                  <th className="text-left px-4 py-2.5">Category</th>
                  <th className="text-left px-4 py-2.5">Group</th>
                  <th className="text-left px-4 py-2.5">Class</th>
                  <th className="text-right px-4 py-2.5">Count</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-left px-4 py-2.5 w-[140px]">% of cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {costRows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-[12px]">No categorized cash costs in this period.</td></tr>
                )}
                {grouped.map(({ cls, rows, subtotal }) => {
                  if (rows.length === 0) return null;
                  return (
                    <React.Fragment key={cls}>
                      {cls === 'drawings' && (
                        <tr className="bg-background/60">
                          <td colSpan={6} className="px-4 py-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground/70 border-t border-border">
                            Below the line, excluded from breakeven
                          </td>
                        </tr>
                      )}
                      {rows.map((r) => {
                        const pctOfTotal = costGrandTotal > 0 && cls !== 'drawings' ? (r.amount / costGrandTotal) * 100 : 0;
                        return (
                          <tr key={r.key} className="hover:bg-accent/30">
                            <td className="px-4 py-2 text-foreground font-medium">{r.label}</td>
                            <td className="px-4 py-2 text-muted-foreground">{r.group}</td>
                            <td className="px-4 py-2">{classBadge(r.cost_class)}</td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">{r.count}</td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">{money(r.amount)}</td>
                            <td className="px-4 py-2">
                              {cls === 'drawings' ? (
                                <span className="text-[10px] text-muted-foreground/60">n/a</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pctOfTotal)}%` }} />
                                  </div>
                                  <span className="text-[10px] font-mono text-muted-foreground w-9 text-right">{pctOfTotal.toFixed(0)}%</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-background/40 font-semibold">
                        <td className="px-4 py-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground" colSpan={4}>{CLASS_LABEL[cls]} subtotal</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">{money(subtotal)}</td>
                        <td />
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </Panel>

          {/* Ad cost reconciliation */}
          <Panel className="p-4 space-y-3">
            <div className="text-[13px] font-semibold text-foreground">Ad Cost Reconciliation</div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead>
                <tr className="border-b border-border/60 text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70">
                  <th className="text-left px-2 py-2">Source</th>
                  <th className="text-right px-2 py-2">Cash (bank)</th>
                  <th className="text-right px-2 py-2">Synced spend</th>
                  <th className="text-right px-2 py-2">Variance / markup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr>
                  <td className="px-2 py-2 text-foreground">Own card</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-foreground">{money(ads.ownCardCash)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">{money(ads.syncedOwnCard)}</td>
                  <td className={`px-2 py-2 text-right font-mono tabular-nums ${ads.ownCardVariance >= 0 ? 'text-foreground' : 'text-primary'}`}>{money(ads.ownCardVariance)}</td>
                </tr>
                <tr>
                  <td className="px-2 py-2 text-foreground">Supplier billed</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-foreground">{money(ads.supplierCash)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">{money(ads.syncedSupplier)}</td>
                  <td className={`px-2 py-2 text-right font-mono tabular-nums ${ads.supplierMarkup >= 0 ? 'status-sold' : 'text-primary'}`}>{money(ads.supplierMarkup)}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <p className="text-[11px] text-muted-foreground/80">
              Synced spend is never added to cost. It is only compared against cash. The supplier row shows what LeadFlow spent on Meta against what you paid LeadFlow, so a positive markup is your margin on their media.
            </p>
            {ads.syncedUnmapped > 0 && (
              <div className="flex items-center gap-2 text-[11.5px] status-unsold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{money(ads.syncedUnmapped)} of synced spend is on an unmapped ad account. Map the account in Ad Manager so it lands on the right row.</span>
              </div>
            )}
          </Panel>

          {/* Monthly trend */}
          <Panel className="p-4">
            <div className="text-[13px] font-semibold text-foreground mb-3">Monthly Trend</div>
            {series.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-[12px]">No categorized cash in this period to chart.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => money(v)} width={70} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [money(v), n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="variable" stackId="cost" name="Variable" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="fixed" stackId="cost" name="Fixed" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="drawings" name="Drawings" fill="hsl(var(--muted-foreground))" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>
      )}

      {view === 'breakeven' && (
        <div className="space-y-4">
          {/* Basis toggle */}
          <Panel className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70">Revenue basis</div>
                <div className="flex gap-1.5 mt-2">
                  {[
                    { key: 'bank', label: 'Verified cash in (bank)' },
                    { key: 'booked', label: 'Booked lead revenue' },
                  ].map((b) => (
                    <button
                      key={b.key}
                      onClick={() => setBasis(b.key)}
                      className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${basis === b.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70">Other basis</div>
                <div className="text-[15px] font-mono tabular-nums text-muted-foreground mt-1">{money(otherRevenue)}</div>
              </div>
            </div>
          </Panel>

          {!be.ok ? (
            <Panel className="p-6 text-center space-y-4">
              <AlertTriangle className="w-6 h-6 status-unsold mx-auto" />
              <div className="text-[13px] text-foreground max-w-md mx-auto">{be.reason}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto text-left">
                <Stat label="Fixed" value={money(totals.fixed)} />
                <Stat label="Variable" value={money(totals.variable)} />
                <Stat label="Revenue" value={money(beRevenue)} />
                <Stat label="Leads" value={leadCount.toLocaleString()} />
              </div>
            </Panel>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Stat label="Breakeven Revenue" value={money(be.breakevenRevenue)} />
                <Stat label="Breakeven Leads" value={Math.ceil(be.breakevenLeads).toLocaleString()} />
                <Stat label="Contribution / Lead" value={money(be.contributionPerLead)} />
                <Stat label="Contribution Margin" value={`${(be.cmRatio * 100).toFixed(1)}%`} />
                <Stat label="Current Profit" value={money(be.currentProfit)} tone={be.currentProfit >= 0 ? 'good' : 'risk'} />
              </div>

              <Panel className="p-4">
                <div className="text-[13px] font-semibold text-foreground mb-3">Breakeven Curve</div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={curve} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="leads" tick={axisStyle} axisLine={false} tickLine={false} label={{ value: 'Leads', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => money(v)} width={72} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [money(v), n]} labelFormatter={(l) => `${l} leads`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cost" name="Total Cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <ReferenceDot x={Math.round(be.breakevenLeads)} y={be.breakevenRevenue} r={5} fill="hsl(var(--chart-5))" stroke="hsl(var(--background))" label={{ value: 'Breakeven', position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))' }} />
                    <ReferenceLine x={leadCount} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: 'You are here', position: 'insideTopRight', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  </LineChart>
                </ResponsiveContainer>
              </Panel>

              <p className="text-[12.5px] text-muted-foreground">
                At the current mix you need <span className="text-foreground font-semibold">{Math.ceil(be.breakevenLeads).toLocaleString()} leads</span> or{' '}
                <span className="text-foreground font-semibold">{money(be.breakevenRevenue)}</span> revenue in this period to cover{' '}
                <span className="text-foreground font-semibold">{money(totals.fixed)}</span> of fixed cost. You are currently{' '}
                <span className={be.surplusLeads >= 0 ? 'status-sold font-semibold' : 'text-primary font-semibold'}>
                  {Math.abs(Math.round(be.surplusLeads)).toLocaleString()} leads {be.surplusLeads >= 0 ? 'above' : 'below'}
                </span>{' '}
                that line.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}