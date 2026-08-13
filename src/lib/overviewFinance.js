// Financial-truth aggregation for the main Overview dashboard.
// Reuses reconcile() / workbench() from financeMetrics so numbers match the Finances section.
import { reconcile, workbench, unmatched } from '@/lib/financeMetrics';
import { leadField, leadEventInstant, leadEventDayKey, spendRows, leadCost, internalSupplierSet } from '@/lib/reportMetrics';
import { formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';
import { format, isWithinInterval, startOfDay, subDays } from 'date-fns';

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
const inWin = (d, win) => d && isWithinInterval(new Date(d), { start: win.start, end: win.end });

// AdSpend.date is a plain yyyy-MM-dd spend day, not an instant. Passing it
// through new Date() parses it as UTC midnight, which sits BEFORE a window that
// starts at local midnight in APP_TZ, so the first day of every range was
// silently dropped from ad spend. Compare day keys as strings instead, which is
// what reportMetrics.spendInWindow already does.
const dayKey = (d) => formatInTimeZone(d, APP_TZ, 'yyyy-MM-dd');
const inWinDay = (d, win) => {
  const k = String(d || '').slice(0, 10);
  if (!k) return false;
  if (win?.start && k < dayKey(win.start)) return false;
  if (win?.end && k > dayKey(win.end)) return false;
  return true;
};

// The full financial picture for a period window.
export function financialTruth({ leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns }, win) {
  // Account-level rows only. Campaign and ad rows are a drill-down of the same
  // money, so summing all three levels counted Meta spend two or three times.
  const acctSpend = spendRows(adSpend || []);
  const wLeads = leads.filter(l => {
    const t = leadEventInstant(l);
    return t instanceof Date && !isNaN(t.getTime()) && t >= win.start && t <= win.end;
  });

  // Internal suppliers (LeadFlow, Legenex) cost ad spend, not a per-lead price,
  // so their leads must not contribute lead cost even when a cpl value rides
  // along on the payload.
  const internal = internalSupplierSet(suppliers);

  const reconRows = reconcile({ leads: wLeads, buyers, suppliers, invoices, payments, payouts, adSpend: acctSpend, internalSuppliers: internal });
  const wb = workbench(reconRows, invoices);

  // Revenue: booked (from leads) vs verified (matched income / payments received).
  const bookedRevenue = wLeads.reduce((a, l) => a + num(l.revenue), 0);
  const verifiedRevenue = payments.filter(p => inWin(p.paid_date, win)).reduce((a, p) => a + num(p.amount), 0);

  // Supplier cost: accrued (lead cost + tracked spend) vs paid (payout paid_amount).
  // Lead-level cost, which is what an EXTERNAL supplier charges per lead.
  //
  // This read l.cost directly, and the Lead schema has no `cost` column at all:
  // external suppliers post their price on the payload, so it lives in the
  // mapped_fields bag under cost or cpl. The term was therefore always exactly
  // zero, and Overview reported cost as ad spend alone, silently dropping every
  // external supplier (Legenex, Inbounds) and overstating profit by the same
  // amount. leadCost resolves the aliases and the bag, which is what every
  // report already uses.
  const accruedCost = wLeads.reduce((a, l) => a + leadCost(l, internal), 0);
  const trackedSpend = acctSpend.filter(a => inWinDay(a.date, win)).reduce((a, r) => a + num(r.spend), 0);
  const paidPayouts = payouts.reduce((a, p) => a + num(p.paid_amount), 0);

  // Ad spend: tracked (synced) vs paid (bank money-out categorised media).
  const paidSpend = txns.filter(t => t.category === 'media' && t.amount < 0).reduce((a, t) => a + Math.abs(num(t.amount)), 0);

  // Profit: reported (booked rev - accrued cost - tracked spend) vs cash (verified in - paid out).
  const reportedProfit = bookedRevenue - accruedCost - trackedSpend;
  const cashProfit = verifiedRevenue - paidPayouts - paidSpend;

  // Cost is the true acquisition cost: supplier lead cost plus attributed ad
  // spend. A supplier is one or the other, never both, so nothing double
  // counts. CPL is that cost over leads in the same window, which is the only
  // basis that rolls up correctly to any period.
  const totalCost = accruedCost + trackedSpend;
  // CPL is cost per SOLD lead, not per lead received. Dividing by every lead
  // (DQs are the majority) understates what a sold lead actually costs.
  const soldCount = wLeads.filter((l) => String(l.final_status || '') === 'Sold').length;
  const blendedCpl = soldCount > 0 ? totalCost / soldCount : 0;

  const kpis = {
    revenue: { headline: bookedRevenue, sub: verifiedRevenue, gap: bookedRevenue - verifiedRevenue },
    profit: { headline: reportedProfit, sub: cashProfit, gap: reportedProfit - cashProfit },
    adSpend: { headline: trackedSpend, sub: paidSpend, gap: trackedSpend - paidSpend },
    supplierCost: { headline: totalCost, sub: paidPayouts, gap: totalCost - paidPayouts },
    cost: { headline: totalCost, sub: paidPayouts + paidSpend, gap: totalCost - (paidPayouts + paidSpend) },
    cpl: { headline: blendedCpl, sub: soldCount, gap: 0 },
  };

  // Small stat cards.
  const now = new Date();
  const in7 = invoices.filter(i => i.status !== 'paid' && i.status !== 'void' && i.period_end &&
    isWithinInterval(new Date(i.period_end), { start: now, end: subDays(now, -7) })).reduce((a, i) => a + num(i.amount), 0);
  const shortPaid = reconRows.filter(r => r.short > 0.01).reduce((a, r) => a + r.short, 0);
  // True CPL previously divided by paidSpend, which is bank money-out tagged as
  // media. That is cash flow, not cost, so it reported a near-zero CPL whenever
  // the media invoice had not cleared yet. Cost over leads is the definition.
  const trueCpl = blendedCpl;
  const cashMargin = verifiedRevenue > 0 ? Math.round((cashProfit / verifiedRevenue) * 100) : 0;
  const sourced = wLeads.filter(l => num(l.revenue) > 0).length;
  const dataQuality = wLeads.length > 0 ? Math.round((sourced / wLeads.length) * 100) : 100;

  const stats = {
    outstanding: bookedRevenue - verifiedRevenue,
    due7: in7,
    overdue: wb.overdue,
    shortPaid,
    trueCpl,
    cashMargin,
    dataQuality,
  };

  return { wLeads, reconRows, wb, kpis, stats, bookedRevenue, verifiedRevenue, trackedSpend };
}

// Action queue: open financial variances.
// Each item carries a label chip, counterparty, amount, and a one-line
// explanation of why it matters + what to do (the "AI-written" note).
export function actionQueue({ reconRows, wb }, txns) {
  const items = [];
  wb.openGaps.forEach(g => {
    const isBuyer = g.type === 'buyer';
    const short = g.short > 0;
    // Buyer owed but underpaid = payment overdue / short paid; supplier = cost gap.
    const label = isBuyer
      ? (short ? 'Payment overdue' : 'Short paid')
      : 'Supplier cost gap';
    items.push({
      key: `gap-${g.type}-${g.name}`,
      label,
      name: g.name,
      amount: Math.abs(g.short),
      note: `${g.name}: expected ${fmt(g.expected)}, settled ${fmt(g.paid)}`,
      why: isBuyer
        ? (short
          ? `${g.name} owes ${fmt(Math.abs(g.short))} against invoiced work, chase payment or issue a reminder.`
          : `${g.name} was overpaid by ${fmt(Math.abs(g.short))}, verify the deposit and apply a credit.`)
        : `Owed ${fmt(Math.abs(g.short))} to ${g.name} not yet cleared, schedule the payout to keep the source live.`,
    });
  });
  const unmatchedIn = unmatched(txns).filter(t => t.amount > 0);
  unmatchedIn.forEach(t => items.push({
    key: `unmatched-${t.id}`, label: 'Unmatched income', name: t.description || 'Bank deposit',
    amount: Math.abs(num(t.amount)),
    note: `${t.description || 'Bank deposit'} not matched to a buyer`,
    why: `${fmt(Math.abs(num(t.amount)))} landed in the bank but isn't tied to a buyer, match it so revenue is proven.`,
  }));
  reconRows.filter(r => r.type === 'buyer' && r.revenue > 0 && r.invoiced === 0).forEach(r => items.push({
    key: `missing-src-${r.name}`, label: 'Missing source', name: r.name, amount: r.revenue,
    note: `${r.name}: ${fmt(r.revenue)} booked with no invoice raised`,
    why: `${fmt(r.revenue)} booked from ${r.name} with no invoice behind it, raise one to make the revenue collectable.`,
  }));

  const totalAtRisk = items.reduce((a, i) => a + i.amount, 0);
  return { items: items.sort((a, b) => b.amount - a.amount), totalAtRisk };
}

// Leads-by-status donut (financial framing).
export function financeDonut(wLeads) {
  const by = (s) => wLeads.filter(l => l.final_status === s).length;
  const unmatchedLeads = wLeads.filter(l => !leadField(l, 'buyer_id')).length;
  // `tone` is the semantic status class (DESIGN-SYSTEM.md); consumers that draw
  // with CSS use it with bg-current so both themes resolve correctly. `color` is
  // retained for recharts consumers that need a literal fill.
  return [
    { name: 'Sold', value: by('Sold'), color: '#22C55E', tone: 'status-sold' },
    { name: 'Duplicate', value: by('Duplicate'), color: '#64748B', tone: 'status-duplicate' },
    { name: 'Returned', value: by('Returned'), color: '#06B6D4', tone: 'status-returned' },
    { name: 'Unsold', value: by('Unsold'), color: '#F59E0B', tone: 'status-unsold' },
    { name: 'Rejected', value: wLeads.filter(l => (l.leadbyte_record_status || '').toLowerCase() === 'rejected').length, color: '#EF4444', tone: 'status-rejected' },
    { name: 'Error', value: by('Error'), color: '#DC2626', tone: 'status-lead-error' },
    { name: 'Unmatched', value: unmatchedLeads, color: '#A855F7', tone: 'status-queued' },
  ].filter(d => d.value > 0);
}

// Daily booked revenue vs verified income vs ad spend.
export function dailyFinance({ wLeads, payments, adSpend }, win) {
  const days = [];
  const spanDays = Math.min(60, Math.round((win.end - win.start) / 86400000) + 1);
  for (let i = spanDays - 1; i >= 0; i--) {
    const day = startOfDay(subDays(win.end, i));
    const next = subDays(win.end, i - 1);
    const dayStr = format(day, 'MMM dd');
    const booked = wLeads.filter(l => { const d = leadEventInstant(l); return d >= day && d < next; }).reduce((a, l) => a + num(l.revenue), 0);
    const verified = (payments || []).filter(p => { const d = p.paid_date ? new Date(p.paid_date) : null; return d && d >= day && d < next; }).reduce((a, p) => a + num(p.amount), 0);
    const spend = spendRows(adSpend || []).filter(a => { const d = a.date ? new Date(a.date) : null; return d && d >= day && d < next; }).reduce((a, r) => a + num(r.spend), 0);
    days.push({ date: dayStr, Booked: Math.round(booked), Verified: Math.round(verified), Spend: Math.round(spend) });
  }
  return days;
}

// Top campaigns by cash profit (estimated vs verified).
export function topCampaigns(wLeads) {
  const groups = {};
  for (const l of wLeads) {
    const key = leadField(l, 'campaign') || l.supplier_name || 'Unattributed';
    if (!groups[key]) groups[key] = { name: key, leads: 0, estimated: 0, verified: 0 };
    groups[key].leads += 1;
    groups[key].estimated += num(l.revenue) - leadCost(l);
    if (l.final_status === 'Sold') groups[key].verified += num(l.revenue) - leadCost(l);
  }
  return Object.values(groups)
    .map(g => ({
      ...g,
      tag: g.estimated <= 0 ? 'Cut' : g.verified / (g.estimated || 1) > 0.7 ? 'Scale' : 'Watch',
      // Reported profit with no verified income behind it.
      falseProfit: g.estimated > 0 && g.verified <= 0.01,
    }))
    .sort((a, b) => b.estimated - a.estimated)
    .slice(0, 6);
}

// Buyer payment risk rows.
export function buyerRisk(reconRows) {
  return reconRows.filter(r => r.type === 'buyer').map(r => {
    const out = r.invoiced - r.paid;
    const status = out > 0.01 ? (r.flag ? 'Overdue' : 'Outstanding') : r.short < -0.01 ? 'Overpaid' : 'Settled';
    return { name: r.name, booked: r.revenue, out, short: r.short, status };
  }).sort((a, b) => b.out - a.out);
}

function fmt(v) { return `$${num(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
export { fmt as fmtMoney };