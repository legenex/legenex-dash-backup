// Supplier-portal-scoped metrics over a supplier's own leads within a period.
// Every number here is the supplier's own, never buyer identities or other
// suppliers' data.
import { resolvePeriod } from '@/lib/periodRange';
import { leadCost, leadEventInstant, leadEventDayKey } from '@/lib/reportMetrics';

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

export function filterByPeriod(records, period, custom) {
  const { start, end } = resolvePeriod(period, custom);
  return records.filter(r => {
    const d = leadEventInstant(r);
    if (!d) return false;
    return d >= start && d <= end;
  });
}

// Maps a lead's final_status to the supplier-facing bucket.
// accepted = Sold, duplicate = Duplicate, dq = Disqualified,
// rejected = Rejected/Unsold, error = Error.
export function statusBucket(finalStatus) {
  const s = String(finalStatus || '');
  if (s === 'Sold') return 'accepted';
  if (s === 'Duplicate') return 'duplicate';
  if (s === 'Disqualified') return 'dq';
  if (s === 'Rejected' || s === 'Unsold' || s === 'Returned') return 'rejected';
  if (s === 'Error') return 'error';
  return 'other';
}

export function supplierPortalMetrics(leads) {
  const total = leads.length;
  let accepted = 0, duplicate = 0, dq = 0, rejected = 0, error = 0, revenue = 0, cost = 0;
  for (const l of leads) {
    const b = statusBucket(l.final_status);
    if (b === 'accepted') accepted++;
    else if (b === 'duplicate') duplicate++;
    else if (b === 'dq') dq++;
    else if (b === 'rejected') rejected++;
    else if (b === 'error') error++;
    revenue += num(l.revenue);
    cost += leadCost(l);
  }
  const profit = revenue - cost;
  return {
    total,
    accepted,
    duplicate,
    dq,
    rejected,
    error,
    revenue,
    cost,
    profit,
    // CPL is cost per SOLD lead, consistent with Overview, Reports, the
    // supplier cost engine and the buyer portal. accepted is the sold count.
    cpl: accepted > 0 ? cost / accepted : 0,
    acceptedPct: total > 0 ? (accepted / total) * 100 : 0,
    duplicatePct: total > 0 ? (duplicate / total) * 100 : 0,
    dqPct: total > 0 ? (dq / total) * 100 : 0,
    convRate: total > 0 ? (accepted / total) * 100 : 0,
  };
}

// Groups a supplier's own leads into per-day rows (YYYY-MM-DD) with volume,
// accepted count, revenue and cost. Sorted most-recent first.
export function dailyBreakdown(leads) {
  const map = {};
  for (const l of leads) {
    const day = leadEventDayKey(l);
    if (!day) continue;
    if (!map[day]) map[day] = { day, total: 0, accepted: 0, revenue: 0, cost: 0 };
    map[day].total++;
    if (statusBucket(l.final_status) === 'accepted') map[day].accepted++;
    map[day].revenue += num(l.revenue);
    map[day].cost += leadCost(l);
  }
  return Object.values(map)
    .map(r => ({ ...r, acceptedPct: r.total > 0 ? (r.accepted / r.total) * 100 : 0 }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

// Aggregates ad spend rows into totals + per-campaign breakdown for internal
// Facebook-connected suppliers.
export function adReportSummary(adReporting, leadCount) {
  if (!adReporting?.enabled) return null;
  const rows = adReporting.spend || [];
  let spend = 0, impressions = 0, clicks = 0, leads = 0;
  const byCampaign = {};
  for (const r of rows) {
    spend += num(r.spend);
    impressions += num(r.impressions);
    clicks += num(r.clicks);
    leads += num(r.leads);
    const key = r.meta_campaign_id || r.ad_account_id || 'Unmapped';
    if (!byCampaign[key]) byCampaign[key] = { key, spend: 0, impressions: 0, clicks: 0, leads: 0 };
    byCampaign[key].spend += num(r.spend);
    byCampaign[key].impressions += num(r.impressions);
    byCampaign[key].clicks += num(r.clicks);
    byCampaign[key].leads += num(r.leads);
  }
  const effLeads = leads || leadCount || 0;
  // NOTE: this is the AD PLATFORM's own CPL, spend over the lead count Meta
  // reports for the campaign. It is deliberately not cost-per-sold: it measures
  // the ad account, not our pipeline, and is what you would compare against
  // Ads Manager. Our cost-per-sold CPL is the one above.
  const campaigns = Object.values(byCampaign).map(c => ({
    ...c,
    cpl: c.leads > 0 ? c.spend / c.leads : 0,
  })).sort((a, b) => b.spend - a.spend);
  return {
    spend,
    impressions,
    clicks,
    leads,
    cpl: effLeads > 0 ? spend / effLeads : 0,
    campaigns,
    hasData: rows.length > 0,
  };
}

export function money(v) {
  return `$${num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(v) {
  return `${num(v).toFixed(1)}%`;
}