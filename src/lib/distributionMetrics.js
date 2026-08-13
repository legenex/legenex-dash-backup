// Operational metrics for the Distribution dashboard. No revenue/profit/CPL anywhere.
import { format, eachDayOfInterval, isWithinInterval, differenceInCalendarDays } from 'date-fns';
import { leadEventInstant } from '@/lib/reportMetrics';

const inWin = (d, win) => { const dt = new Date(d); return isWithinInterval(dt, { start: win.start, end: win.end }); };

function isRejected(l) {
  return (l.leadbyte_record_status || '').toLowerCase() === 'rejected';
}

// Count of CAPI conversion events fired for a lead (proxy for conversions).
function convCount(l) {
  if (l.conv_value && Number(l.conv_value) > 0) return 1;
  if (!l.capi_log) return 0;
  try { return JSON.parse(l.capi_log).length ? 1 : 0; } catch { return 0; }
}

export function operationalMetrics(allLeads, allErrors, win) {
  const leads = allLeads.filter(l => inWin(l.created_date, win));
  const errors = (allErrors || []).filter(e => inWin(e.created_date, win));

  const by = (s) => leads.filter(l => l.final_status === s).length;
  const total = leads.length;
  const sold = by('Sold');
  const disqualified = by('Disqualified');
  const unsold = by('Unsold');
  const returns = by('Returned');
  const duplicates = by('Duplicate');
  const queued = by('Queued');
  const rejections = leads.filter(isRejected).length;
  const errorCount = leads.filter(l => l.final_status === 'Error').length + errors.length;
  const conversions = leads.reduce((a, l) => a + convCount(l), 0);

  const pct = (n) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

  return {
    leads, total, sold, disqualified, unsold, returns, duplicates, queued, rejections,
    errors: errorCount, conversions,
    pctSold: pct(sold), pctDq: pct(disqualified), pctUnsold: pct(unsold),
    pctReturn: pct(returns), pctRejection: pct(rejections), pctError: pct(errorCount),
    convRate: pct(conversions),
  };
}

// Donut segments for leads-by-status in the window.
export function statusDonut(m) {
  return [
    { name: 'Sold', value: m.sold, color: '#22C55E' },
    { name: 'Unsold', value: m.unsold, color: '#F59E0B' },
    { name: 'Disqualified', value: m.disqualified, color: '#EF4444' },
    { name: 'Queued', value: m.queued, color: '#A855F7' },
    { name: 'Returned', value: m.returns, color: '#06B6D4' },
    { name: 'Duplicate', value: m.duplicates, color: '#64748B' },
  ].filter(d => d.value > 0);
}

// Leads-over-time series. Buckets by day; caps at ~60 buckets.
export function leadsOverTime(leads, win) {
  const days = eachDayOfInterval({ start: win.start, end: win.end });
  const fmt = days.length > 31 ? 'MMM dd' : 'MMM dd';
  return days.map(day => {
    const dayStr = format(day, fmt);
    const dl = leads.filter(l => {
      const d = leadEventInstant(l);
      if (!d) return false;
      return d >= new Date(day.getFullYear(), day.getMonth(), day.getDate()) &&
        d < new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    });
    return {
      date: dayStr,
      Total: dl.length,
      Sold: dl.filter(l => l.final_status === 'Sold').length,
      Disqualified: dl.filter(l => l.final_status === 'Disqualified').length,
      Error: dl.filter(l => l.final_status === 'Error').length,
    };
  });
}

// Per-supplier operational summary (no money) for anomaly context in AI insights.
export function supplierBreakdown(leads) {
  const names = [...new Set(leads.map(l => l.supplier_name).filter(Boolean))];
  return names.map(name => {
    const sl = leads.filter(l => l.supplier_name === name);
    const dq = sl.filter(l => l.final_status === 'Disqualified').length;
    const err = sl.filter(l => l.final_status === 'Error').length;
    return {
      supplier: name, total: sl.length,
      sold: sl.filter(l => l.final_status === 'Sold').length,
      disqualified: dq, errors: err,
      dq_rate: sl.length ? Math.round((dq / sl.length) * 100) : 0,
      error_rate: sl.length ? Math.round((err / sl.length) * 100) : 0,
    };
  }).sort((a, b) => b.total - a.total);
}

export function windowLengthDays(win) {
  return differenceInCalendarDays(win.end, win.start) + 1;
}