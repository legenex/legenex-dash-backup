// Portal-scoped metrics over a buyer's own leads + feedback within a period.
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

export function portalMetrics(leads) {
  let revenue = 0, cost = 0, sold = 0;
  for (const l of leads) {
    revenue += num(l.revenue);
    cost += leadCost(l);
    if (String(l.final_status) === 'Sold') sold++;
  }
  const total = leads.length;
  return {
    total,
    revenue,
    cost,
    sold,
    convRate: total > 0 ? (sold / total) * 100 : 0,
  };
}

// Groups leads into per-day rows (YYYY-MM-DD) with volume, revenue, cost and
// sold counts. Sorted most-recent first.
export function dailyBreakdown(leads) {
  const map = {};
  for (const l of leads) {
    const day = leadEventDayKey(l);
    if (!day) continue;
    if (!map[day]) map[day] = { day, total: 0, sold: 0, revenue: 0, cost: 0 };
    map[day].total++;
    if (String(l.final_status) === 'Sold') map[day].sold++;
    map[day].revenue += num(l.revenue);
    map[day].cost += leadCost(l);
  }
  return Object.values(map)
    .map(r => ({ ...r, convRate: r.total > 0 ? (r.sold / r.total) * 100 : 0 }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

export function feedbackSummary(feedback) {
  const map = {};
  for (const f of feedback) {
    const k = f.disposition || 'Other';
    map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map)
    .map(([disposition, count]) => ({ disposition, count }))
    .sort((a, b) => b.count - a.count);
}