import { leadEventInstant, leadField } from '@/lib/reportMetrics';
// Per-campaign aggregate metrics for the Campaigns list table. A campaign is a
// vertical, so leads are matched to a campaign by their lead_vertical / vertical
// against the campaign's vertical code. Reads from records already loaded on the
// page, no extra fetch. Pure UI aggregation; touches no routing/billing logic.

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// Vertical lives in the mapped_fields bag, not in a lead column: both
// lead_vertical and vertical read null on every lead, so this used to group
// everything under the empty string. leadField resolves the bag.
function leadVertical(l) {
  return String(leadField(l, 'vertical') ?? '').toLowerCase();
}

// Returns metrics for one campaign: leads14d, total, accepted %, duplicate %,
// dq %, returned %, revenue, cost, profit, profit %.
export function campaignMetrics(campaign, leads, now = new Date()) {
  const code = String(campaign.vertical || '').toLowerCase();
  const rows = code ? leads.filter((l) => leadVertical(l) === code) : [];
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;

  let total = 0, leads14d = 0, accepted = 0, duplicate = 0, dq = 0, returned = 0;
  let revenue = 0, cost = 0;
  for (const l of rows) {
    total++;
    const created = (leadEventInstant(l) || new Date(l.processed_at || 0)).getTime();
    if (created >= cutoff) leads14d++;
    const s = String(l.final_status || '');
    if (s === 'Sold') accepted++;
    if (s === 'Duplicate') duplicate++;
    if (s === 'Disqualified' || s === 'Rejected') dq++;
    if (s === 'Returned' || l.buyer_returned) returned++;
    revenue += num(l.revenue);
    cost += num(l.supplier_payout);
  }
  const profit = revenue - cost;
  const p = (n) => (total > 0 ? (n / total) * 100 : 0);
  return {
    total,
    leads14d,
    acceptedPct: p(accepted),
    duplicatePct: p(duplicate),
    dqPct: p(dq),
    returnedPct: p(returned),
    revenue,
    cost,
    profit,
    profitPct: revenue > 0 ? (profit / revenue) * 100 : 0,
  };
}

// Count buyers + suppliers referenced by a campaign. Buyers come from the
// campaign's route group members; suppliers from supplier_ids on the campaign.
function parseIds(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
}

export function campaignCounts(campaign, groups, membersByGroup) {
  const supplierIds = parseIds(campaign.supplier_ids);
  const groupIds = groups.filter((g) => String(g.campaign_id) === String(campaign.id)).map((g) => g.id);
  const buyerSet = new Set();
  for (const gid of groupIds) {
    for (const m of membersByGroup[gid] || []) if (m.buyer_id) buyerSet.add(m.buyer_id);
  }
  return { buyers: buyerSet.size, suppliers: supplierIds.length };
}