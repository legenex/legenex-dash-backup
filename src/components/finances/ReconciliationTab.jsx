import React, { useMemo, useState } from 'react';
import { reconInsights } from '@/functions/reconInsights';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { money, int } from '@/lib/reportMetrics';
import { reconcile, workbench } from '@/lib/financeMetrics';
import { Panel, PanelHeader, THead, rise } from '@/components/finances/financeAtoms';
import { StatChip, CashChart } from '@/components/finances/financeUi';

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

// Build a 14-day Cash In vs Cash Out series from bank transactions.
function cashSeries(txns, days = 14) {
  const map = {};
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map[key] = { date: key, in: 0, out: 0 };
  }
  for (const t of txns) {
    const key = String(t.date || '').slice(0, 10);
    if (!map[key]) continue;
    const amt = num(t.amount);
    if (amt >= 0) map[key].in += amt; else map[key].out += Math.abs(amt);
  }
  return Object.values(map);
}

export default function ReconciliationTab({ data, onResolve }) {
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [cat, setCat] = useState('cash');

  const txns = data.txns || [];
  const hasBank = txns.length > 0;

  const rows = useMemo(() => reconcile(data), [data]);
  const wb = useMemo(() => workbench(rows, data.invoices), [rows, data.invoices]);

  // Real cash figures from the bank feed.
  const moneyIn = txns.filter(t => num(t.amount) > 0).reduce((a, t) => a + num(t.amount), 0);
  const moneyOut = txns.filter(t => num(t.amount) < 0).reduce((a, t) => a + num(t.amount), 0);
  const verifiedCashIn = txns.filter(t => t.category === 'revenue' && num(t.amount) > 0).reduce((a, t) => a + num(t.amount), 0);
  const bankBalance = moneyIn + moneyOut;

  const resolvedCount = num(data.resolved);
  const openedCount = wb.openGaps.length + resolvedCount;
  const resolveRate = openedCount > 0 ? Math.round((resolvedCount / openedCount) * 100) : 0;

  // Pinned metrics.
  const pinned = [
    { label: 'Verified Cash In', value: money(verifiedCashIn), tone: 'good', pct: moneyIn > 0 ? (verifiedCashIn / moneyIn) * 100 : 0, sub: 'Bank-confirmed income' },
    { label: 'Revenue Gap', value: money(wb.revenueGap), tone: wb.revenueGap > 0 ? 'risk' : 'good', pct: wb.revenueGap > 0 ? 100 : 0, sub: 'Booked minus invoiced' },
    { label: 'Total At Risk', value: money(wb.totalAtRisk), tone: wb.totalAtRisk > 0 ? 'risk' : 'good', pct: wb.totalAtRisk > 0 ? 100 : 0, sub: `${wb.openGaps.length} open gap${wb.openGaps.length !== 1 ? 's' : ''}` },
    { label: 'Resolve Rate', value: `${resolveRate}%`, tone: resolveRate >= 50 ? 'good' : 'warn', pct: resolveRate, sub: `${resolvedCount}/${openedCount} closed` },
  ];

  // Category chips -> metric cards.
  const receivables = data.invoices.filter(i => i.status !== 'paid' && i.status !== 'void').reduce((a, i) => a + num(i.amount), 0);
  const collected = data.payments.reduce((a, p) => a + num(p.amount), 0);
  const payablesOwing = data.payouts.reduce((a, p) => a + Math.max(0, num(p.amount) - num(p.paid_amount)), 0);
  const payablesPaid = data.payouts.reduce((a, p) => a + num(p.paid_amount), 0);

  const CATEGORIES = [
    { key: 'cash', label: 'Cash Position', count: 4 },
    { key: 'receivables', label: 'Receivables', count: 3 },
    { key: 'payables', label: 'Payables', count: 2 },
    { key: 'recon', label: 'Reconciliation', count: 3 },
  ];

  const CARDS = {
    cash: [
      { label: 'Money In', value: money(moneyIn), tone: 'good' },
      { label: 'Money Out', value: money(moneyOut), tone: 'risk' },
      { label: 'Net Cash', value: money(bankBalance), tone: bankBalance >= 0 ? 'good' : 'risk' },
      { label: 'Bank Balance', value: hasBank ? money(bankBalance) : '--', tone: undefined },
    ],
    receivables: [
      { label: 'Outstanding', value: money(receivables), tone: receivables > 0 ? 'warn' : 'good' },
      { label: 'Overdue', value: money(wb.overdue), tone: wb.overdue > 0 ? 'risk' : 'good' },
      { label: 'Collected', value: money(collected), tone: 'good' },
    ],
    payables: [
      { label: 'Owing', value: money(payablesOwing), tone: payablesOwing > 0 ? 'warn' : 'good' },
      { label: 'Paid', value: money(payablesPaid), tone: 'good' },
    ],
    recon: [
      { label: 'Unmatched In', value: money(data.unmatchedIn || 0), tone: (data.unmatchedIn || 0) > 0 ? 'warn' : 'good' },
      { label: 'Open Gaps', value: int(wb.openGaps.length), tone: wb.openGaps.length > 0 ? 'risk' : 'good' },
      { label: 'Total At Risk', value: money(wb.totalAtRisk), tone: wb.totalAtRisk > 0 ? 'risk' : 'good' },
    ],
  };

  const getInsights = async () => {
    setLoading(true);
    try {
      const res = await reconInsights({ gaps: wb.openGaps });
      setInsights(res?.data?.insights || 'No insights available.');
    } catch { toast.error('Could not generate insights'); }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      {/* 1) Pinned metrics board */}
      <Panel className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {pinned.map((p, i) => <StatChip key={p.label} {...p} i={i} />)}
        </div>

        {/* Category toggle chips */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${cat === c.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              {c.label} <span className="opacity-60">{c.count}</span>
            </button>
          ))}
        </div>

        {/* Active category cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {CARDS[cat].map((m, i) => <StatChip key={m.label} {...m} i={i} />)}
        </div>

        {!hasBank && (
          <div className="text-[11.5px] text-muted-foreground/70 mt-3">All metrics flat, no bank feed connected yet.</div>
        )}
      </Panel>

      {/* 2) Cash In vs Cash Out chart */}
      <Panel>
        <PanelHeader title="Cash In vs Cash Out" />
        <div className="p-4">
          <CashChart data={cashSeries(txns)} empty={!hasBank} />
        </div>
      </Panel>

      {/* 3) Open Gaps by Counterparty + AI insights */}
      <Panel className="overflow-hidden">
        <PanelHeader title="Open Gaps by Counterparty">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={getInsights} disabled={loading}>
            <Sparkles className="w-3.5 h-3.5 text-primary" /> {loading ? 'Analyzing...' : 'Generate AI Insights'}
          </Button>
        </PanelHeader>
        {insights && (
          <div className="px-4 pt-3 text-[13px] text-muted-foreground prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{insights}</ReactMarkdown>
          </div>
        )}
        {wb.openGaps.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px] status-sold px-4 py-6"><CheckCircle2 className="w-4 h-4" /> No open gaps, everything reconciles.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead><THead cols={['Counterparty', 'Type', 'Expected', 'Paid', 'Short', 'Action']} alignRight={[2, 3, 4]} /></thead>
            <tbody className="divide-y divide-border/60">
              {wb.openGaps.map((g, i) => (
                <motion.tr key={i} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                  <td className="px-4 py-2.5 text-foreground">{g.name}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{g.type}</Badge></td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(g.expected)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(g.paid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-destructive">{money(g.short)}</td>
                  <td className="px-4 py-2.5 text-right"><Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onResolve?.(g)}>Resolve</Button></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Panel>

      {/* 4) Counterparty Reconciliation table */}
      <Panel className="overflow-hidden">
        <PanelHeader title="Counterparty Reconciliation" />
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead><THead cols={['Name', 'Type', 'Leads', 'Revenue', 'Cost', 'Profit', 'Invoiced', 'Paid', 'Flag']} alignRight={[2, 3, 4, 5, 6, 7]} center={[8]} /></thead>
          <tbody className="divide-y divide-border/60">
            {rows.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No counterparties yet</td></tr>}
            {rows.map((r, i) => (
              <motion.tr key={i} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                <td className="px-4 py-2.5 text-foreground">{r.name}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{r.type}</Badge></td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{int(r.leads)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.revenue)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.cost)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.profit)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.invoiced)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.paid)}</td>
                <td className="px-4 py-2.5 text-center">{r.flag ? <AlertTriangle className="w-3.5 h-3.5 text-destructive inline" /> : <CheckCircle2 className="w-3.5 h-3.5 status-sold inline" />}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>
    </div>
  );
}