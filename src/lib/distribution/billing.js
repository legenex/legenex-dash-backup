// Pure billing-line calculation and return adjustment. Wallet debit/credit moved
// to walletLedger.js (versioned CAS ledger) so there is ONE wallet implementation.
// Sandbox only in dev; no live charge, invoice, or webhook is performed here.

// Compute reconciled billing line items. Groups accepted leads by dimension and
// subtracts approved returns EXACTLY ONCE (returns are matched by lead id).
// leads: [{ id, vertical, state, campaign_id, supplier_id, source_code, price }]
// approvedReturns: [{ lead_id }]  (only approved)
// dims: array of field names to group by, e.g. ['vertical','state'].
export function computeBillingLines(leads, approvedReturns = [], dims = ['vertical', 'state']) {
  const returned = new Set((approvedReturns || []).map((r) => r.lead_id));
  const groups = new Map();
  for (const lead of leads || []) {
    const key = dims.map((d) => String(lead[d] ?? '')).join('|');
    if (!groups.has(key)) {
      const dimVals = {};
      dims.forEach((d) => { dimVals[d] = lead[d] ?? null; });
      groups.set(key, { ...dimVals, lead_count: 0, returns: 0, gross: 0, unit_prices: [] });
    }
    const g = groups.get(key);
    g.lead_count += 1;
    g.unit_prices.push(Number(lead.price) || 0);
    if (returned.has(lead.id)) g.returns += 1;
    else g.gross = round2(g.gross + (Number(lead.price) || 0));
  }
  return [...groups.values()].map((g) => ({
    ...g,
    billable_leads: g.lead_count - g.returns,
    unit_price: g.unit_prices.length ? round2(g.unit_prices.reduce((a, b) => a + b, 0) / g.unit_prices.length) : 0,
    amount: g.gross,
  })).map(({ unit_prices, ...rest }) => rest);
}

// Apply a return adjustment idempotently. Returns whether it changed anything.
// processedReturnIds is a Set of return ids already applied.
export function applyReturnAdjustment(processedReturnIds, returnId) {
  if (processedReturnIds.has(returnId)) return { applied: false, duplicate: true };
  processedReturnIds.add(returnId);
  return { applied: true };
}

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
