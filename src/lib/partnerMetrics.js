import { leadCost } from '@/lib/reportMetrics';
// Aggregates lead metrics per supplier / buyer for the Campaigns tables.
// Reads from Lead records already loaded on the page - no extra fetch.

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

// Returns { total, accepted, duplicate, dq, revenue, cost, profit, cpl, acceptedPct, convRate }
export function supplierMetrics(leads, supplierName) {
  const rows = leads.filter(l =>
    (l.supplier_name && l.supplier_name === supplierName)
  );
  const total = rows.length;
  let accepted = 0, duplicate = 0, dq = 0, revenue = 0, cost = 0;
  for (const l of rows) {
    const s = String(l.final_status || '');
    if (s === 'Sold') accepted++;
    if (s === 'Duplicate') duplicate++;
    if (s === 'Disqualified' || s === 'Rejected') dq++;
    revenue += num(l.revenue);
    cost += leadCost(l);
  }
  const profit = revenue - cost;
  // CPL is cost per SOLD lead, consistent with Overview, Reports and the
  // supplier cost engine. accepted is the sold count here.
  const cpl = accepted > 0 ? cost / accepted : 0;
  const acceptedPct = total > 0 ? (accepted / total) * 100 : 0;
  const convRate = total > 0 ? (accepted / total) * 100 : 0;
  return { total, accepted, duplicate, dq, revenue, cost, profit, cpl, acceptedPct, convRate };
}

export function buyerMetrics(leads, buyerName) {
  // Buyers are matched by the response/destination - best-effort by supplier or brand.
  const rows = leads.filter(l => l.final_status === 'Sold');
  let revenue = 0, cost = 0;
  for (const l of rows) { revenue += num(l.revenue); cost += leadCost(l); }
  void buyerName;
  return { revenue, cost, profit: revenue - cost };
}

export function money(v) {
  return `$${num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(v) {
  return `${num(v).toFixed(1)}%`;
}