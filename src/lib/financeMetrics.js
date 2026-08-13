// Reconciliation & finance aggregation for the Finances page.
import { leadField, leadCost, internalSupplierSet } from '@/lib/reportMetrics';

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

// Per-counterparty reconciliation rows for buyers and suppliers.
// Returns [{ name, type, leads, revenue, cost, profit, invoiced, paid, short, flag }]
export function reconcile({ leads, buyers, suppliers, invoices, payments, payouts, adSpend, internalSuppliers }) {
  // Internal suppliers cost ad spend, never a per-lead price. Derived here when
  // the caller has not already built it.
  const internal = internalSuppliers || internalSupplierSet(suppliers);
  const rows = [];

  // BUYERS: revenue side. invoiced = sum invoices, paid = sum payments.
  for (const b of buyers) {
    const bLeads = leads.filter(l => {
      const bid = leadField(l, 'buyer_id');
      return bid === b.company_name || bid === b.id;
    });
    const revenue = bLeads.reduce((a, l) => a + num(l.revenue), 0);
    const invoiced = invoices.filter(i => i.buyer_id === b.id).reduce((a, i) => a + num(i.amount), 0);
    const paid = payments.filter(p => p.buyer_id === b.id || p.buyer_name === b.company_name).reduce((a, p) => a + num(p.amount), 0);
    const flag = invoiced !== paid || (revenue > 0 && invoiced === 0);
    rows.push({
      name: b.company_name, type: 'buyer', leads: bLeads.length, revenue, cost: 0, profit: revenue,
      invoiced, paid, short: invoiced - paid, flag,
    });
  }

  // SUPPLIERS: cost side. invoiced = payouts issued, paid = payout paid_amount.
  for (const s of suppliers) {
    const sLeads = leads.filter(l => l.supplier_name === s.name);
    const cost = sLeads.reduce((a, l) => a + leadCost(l, internal), 0);
    const spend = (adSpend || []).filter(a => (!a.level || a.level === 'account') && a.supplier_name === s.name).reduce((a, r) => a + num(r.spend), 0);
    const trueCost = cost + spend;
    const sPayouts = payouts.filter(p => p.supplier_name === s.name);
    const invoiced = sPayouts.reduce((a, p) => a + num(p.amount), 0);
    const paid = sPayouts.reduce((a, p) => a + num(p.paid_amount), 0);
    const flag = invoiced !== paid || (trueCost > 0 && invoiced === 0);
    rows.push({
      name: s.name, type: 'supplier', leads: sLeads.length, revenue: 0, cost: trueCost, profit: -trueCost,
      invoiced, paid, short: invoiced - paid, flag,
    });
  }

  return rows;
}

// Workbench metric cards + open gaps list.
export function workbench(reconRows, invoices) {
  const now = new Date();
  const overdue = invoices
    .filter(i => i.status !== 'paid' && i.status !== 'void' && i.period_end && new Date(i.period_end) < now)
    .reduce((a, i) => a + num(i.amount), 0);

  const openGaps = reconRows
    .filter(r => r.flag && Math.abs(r.short) > 0.01 || (r.type === 'buyer' && r.revenue > 0 && r.invoiced === 0) || (r.type === 'supplier' && r.cost > 0 && r.invoiced === 0))
    .map(r => ({
      name: r.name,
      type: r.type,
      expected: r.type === 'buyer' ? (r.invoiced || r.revenue) : (r.invoiced || r.cost),
      paid: r.paid,
      short: (r.type === 'buyer' ? (r.invoiced || r.revenue) : (r.invoiced || r.cost)) - r.paid,
    }))
    .filter(g => Math.abs(g.short) > 0.01)
    .sort((a, b) => Math.abs(b.short) - Math.abs(a.short));

  const revenueGap = reconRows.filter(r => r.type === 'buyer').reduce((a, r) => a + Math.max(0, r.revenue - r.invoiced), 0);
  const totalAtRisk = openGaps.reduce((a, g) => a + Math.abs(g.short), 0);

  return { revenueGap, overdue, totalAtRisk, openGaps };
}

// Unmatched bank transactions (no matched entity).
export function unmatched(transactions) {
  return transactions.filter(t => !t.matched_entity_type);
}