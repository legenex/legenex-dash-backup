// Central analytics engine for the Reports report-builder and Finances.
// Reads Lead + AdSpend records and computes every metric surfaced on cards/widgets.
// Pure functions, no fetching - callers pass in already-loaded records.

import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

export function money(v) {
  const n = num(v);
  const neg = n < 0;
  const s = `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return neg ? `-${s}` : s;
}
export function moneyShort(v) {
  const n = num(v);
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
export function pct(v) { return `${num(v).toFixed(1)}%`; }
export function int(v) { return num(v).toLocaleString(); }

// Report field aliases.
// Reports address leads by canonical report names, but live leads do not carry
// those names. There is no `cost` column on the Lead entity at all, and
// campaign / state / buyer / accident date only exist inside mapped_fields
// under supplier-shaped names. Each canonical name resolves through its alias
// list, first match wins, so cards, filters and group-by tables hit real data.
// Add an alias here rather than renaming lead fields: mapped_fields is owned by
// the inbound payload and processLead, not by reporting.
const FIELD_ALIASES = {
  cost: ['cost', 'cpl'],
  campaign: ['campaign', 'utm_campaign'],
  state: ['state', 'accident_state'],
  buyer: ['buyer', 'buyer_name'],
  accident_date: ['accident_date', 'incident_date'],
  phone_verified: ['hlr_status', 'phone_verified'],
};

// Parsed mapped_fields / raw_payload bags per lead. leadField is called many
// times per lead per render, so parsing the JSON strings every call is the
// difference between a fast board and a locked tab at 1000+ leads.
const bagCache = new WeakMap();
function leadBags(lead) {
  const cached = bagCache.get(lead);
  if (cached) return cached;
  const bags = [];
  for (const key of ['mapped_fields', 'raw_payload']) {
    try {
      const obj = JSON.parse(lead[key] || '{}');
      if (obj && typeof obj === 'object') bags.push(obj);
    } catch { /* ignore */ }
  }
  bagCache.set(lead, bags);
  return bags;
}

// Extract a value from a lead including alias resolution and
// mapped_fields / raw_payload fallbacks.
export function leadField(lead, field) {
  const names = FIELD_ALIASES[field] || [field];
  for (const name of names) {
    if (lead[name] != null && lead[name] !== '') return lead[name];
  }
  for (const bag of leadBags(lead)) {
    for (const name of names) {
      if (bag[name] != null && bag[name] !== '') return bag[name];
    }
  }
  return undefined;
}

// The lead's cost. The Lead entity has no cost column, so this resolves through
// the cost alias to mapped_fields.cpl, which arrives as a numeric string.
// Build the set of Internal supplier names, normalised for comparison.
// Pass this to leadCost / computeMetrics so an internal supplier never picks up
// a per-lead price.
export function internalSupplierSet(suppliers = []) {
  const set = new Set();
  for (const s of suppliers) {
    if (String(s?.supplier_type || '').toLowerCase() === 'internal' && s?.name) {
      set.add(String(s.name).trim().toLowerCase());
    }
  }
  return set;
}

// Application-wide default for the above.
//
// leadCost is called from roughly a dozen places (reports, portals, campaign
// and supplier groupings), and threading an explicit set through every one of
// them is how they drift apart. Any surface that loads the Supplier list
// registers it once here, and every call site is then correct by default while
// still allowing an explicit override.
let defaultInternalSuppliers = new Set();

export function registerInternalSuppliers(suppliers = []) {
  defaultInternalSuppliers = internalSupplierSet(suppliers);
  return defaultInternalSuppliers;
}

export function getInternalSuppliers() {
  return defaultInternalSuppliers;
}

// Per-lead acquisition cost.
//
// A supplier costs money one of two ways and NEVER both: an External supplier
// posts its price on the payload (cost or cpl in the mapped_fields bag), and an
// Internal supplier costs whatever ad spend is attributed to it. Counting a
// per-lead price for an Internal supplier would invent cost that does not
// exist: Legenex is internal with no mapped ad accounts, so its cost is zero
// even though its leads carry a cpl value.
//
// internalSuppliers is optional. Without it the caller has no supplier records
// to judge by, so the posted price is taken at face value.
export function leadCost(lead, internalSuppliers) {
  const internal = internalSuppliers || defaultInternalSuppliers;
  if (internal && internal.size > 0) {
    const sup = String(lead?.supplier_name ?? '').trim().toLowerCase();
    if (sup && internal.has(sup)) return 0;
  }
  return num(leadField(lead, 'cost'));
}

const S = (l) => String(l.final_status || '');

// Cost basis for every spend total in the app.
//
// syncMetaSpend writes rows at three levels: account, campaign and ad. The
// account row is a rollup of that day's campaign rows for the same ad account,
// verified exactly: 2026-07-22 on act_630657151370020 is 1294.69 + 522.57 at
// campaign level and 1817.26 at account level. So summing levels together
// multiplies spend two or three times over.
//
// But account rows only exist for days the sync has covered at account level.
// Filtering to account-only therefore silently drops every day that has
// campaign rows and no account rollup yet, which under-reports cost by weeks
// after a partial backfill.
//
// So: prefer the account row for a given ad account and day, and fall back to
// that day's campaign rows only where no account row exists. Correct whether
// the backfill has run or not, and it cannot double count, because the two
// branches are mutually exclusive per account-day.
//
// Rows written before levels existed carry no level at all and count as account.
export function spendRows(rows = []) {
  const accountKeys = new Set();
  const account = [];
  for (const r of rows) {
    if (!r.level || r.level === 'account') {
      account.push(r);
      accountKeys.add(`${r.ad_account_id || ''}|${String(r.date || '').slice(0, 10)}`);
    }
  }
  const fallback = rows.filter(
    (r) => r.level === 'campaign'
      && !accountKeys.has(`${r.ad_account_id || ''}|${String(r.date || '').slice(0, 10)}`),
  );
  return fallback.length ? account.concat(fallback) : account;
}

// Spend rows inside the report's window AND matching the report's filters.
//
// applyFilters only ever touches leads, and AdSpend rows carry their own date,
// so without this every report summed the entire spend history no matter which
// window was selected.
//
// It also has to honour the non-date filters. Previously only date_from/date_to
// were applied, so selecting a vertical narrowed the leads but left cost at the
// full month: picking WC gave 3 leads against ~$57k of spend, a CPL of ~$19,000
// and a hugely negative profit.
//
// AdSpend rows carry vertical, brand, supplier_name/supplier_key, platform and
// ad_account_id, so those filters apply directly. Filters that spend has no
// dimension for (buyer, and any lead-level attribute such as state or status)
// cannot narrow it, because ad spend is incurred upstream of the buyer a lead
// is later sold to. Those are ignored here rather than zeroing cost.
const SPEND_FILTERABLE = {
  vertical: (r) => r.vertical,
  brand: (r) => r.brand,
  platform: (r) => r.platform,
  supplier: (r) => r.supplier_name,
  supplier_name: (r) => r.supplier_name,
};

export function spendInWindow(rows = [], filters = {}) {
  const from = filters?.date_from || '';
  const to = filters?.date_to || '';
  let list = spendRows(rows);

  if (from || to) {
    list = list.filter((r) => {
      const d = String(r.date || '').slice(0, 10);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  for (const [field, get] of Object.entries(SPEND_FILTERABLE)) {
    const wanted = filterValues(filters?.[field]);
    if (wanted.length === 0) continue;
    list = list.filter((r) => {
      const have = String(get(r) ?? '').trim().toLowerCase();
      if (!have) return false;
      // Supplier names arrive as LEADFLOW / LeadFlow / Leadflow, so match
      // loosely rather than splitting one supplier into two.
      return wanted.some((w) => have === w || have.includes(w) || w.includes(have));
    });
  }

  return list;
}

// The lead's real event time. mapped_fields.timestamp is a naive local string
// like "2026-06-01 22:18:03" already in APP_TZ; interpret it as APP_TZ. If it
// is missing, fall back to the Base44 created_date (import time).
export function leadEventInstant(lead) {
  const ts = leadField(lead, 'timestamp');
  if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(ts.trim())) {
    const raw = ts.trim().replace(' ', 'T');
    // If the string already carries a timezone (trailing Z or ±HH:MM offset),
    // parse it as an absolute instant. Only naive wall-clock strings are
    // interpreted in APP_TZ.
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
    const d = hasZone ? new Date(raw) : fromZonedTime(raw, APP_TZ);
    if (!isNaN(d.getTime())) return d;
  }
  // created_date is stored without a timezone suffix; it is a UTC value, so
  // append Z when missing to avoid the browser parsing it as local time.
  const cd = lead.created_date;
  const norm = (typeof cd === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(cd)) ? cd + 'Z' : cd;
  const created = new Date(norm);
  return isNaN(created.getTime()) ? null : created;
}

// The lead's APP_TZ calendar day as "yyyy-MM-dd", or null if it has no valid date.
export function leadEventDayKey(lead) {
  const d = leadEventInstant(lead);
  if (!d || isNaN(d.getTime())) return null;
  return formatInTimeZone(d, APP_TZ, 'yyyy-MM-dd');
}

// Apply a filter object { field: value } to a list of leads.
// Filter values may be a single value or an array of them, since the filter
// bars are multi-select: picking two suppliers means "either of these", not
// "both at once". An empty array is the same as no filter.
function filterValues(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v) => v != null && v !== '' && v !== 'all').map((v) => String(v).toLowerCase());
}

export function applyFilters(leads, filters = {}) {
  const entries = Object.entries(filters).filter(([, v]) => {
    if (Array.isArray(v)) return v.some((x) => x != null && x !== '' && x !== 'all');
    return v != null && v !== '' && v !== 'all';
  });
  if (entries.length === 0) return leads;
  return leads.filter((l) =>
    entries.every(([field, value]) => {
      if (field === 'date_from') return leadEventInstant(l) >= fromZonedTime(String(value) + 'T00:00:00', APP_TZ);
      if (field === 'date_to') return leadEventInstant(l) <= fromZonedTime(String(value) + 'T23:59:59', APP_TZ);
      const wanted = filterValues(value);
      if (wanted.length === 0) return true;
      const lv = String(leadField(l, field) ?? '').toLowerCase();
      return wanted.includes(lv);
    })
  );
}

// Core aggregate over a set of leads + matching ad spend rows.
// internalSuppliers (optional) suppresses per-lead cost for Internal suppliers,
// whose cost comes from ad spend instead.
export function computeMetrics(leads, adSpendRows = [], internalSuppliers) {
  let revenue = 0, cost = 0, bookedRevenue = 0, verifiedIncome = 0, outstanding = 0, overdue = 0, shortPaid = 0;
  let sold = 0, unsold = 0, returns = 0, fakes = 0, duplicates = 0, dqs = 0, phoneVerified = 0;
  const total = leads.length;

  for (const l of leads) {
    const s = S(l);
    revenue += num(l.revenue);
    cost += leadCost(l, internalSuppliers);
    if (s === 'Sold') { sold++; bookedRevenue += num(l.revenue); }
    else if (s === 'Unsold') unsold++;
    else if (s === 'Returned') returns++;
    else if (s === 'Duplicate') duplicates++;
    else if (s === 'Disqualified' || s === 'Rejected') dqs++;
    if (leadField(l, 'is_fake') === true || leadField(l, 'fake') === 'Yes') fakes++;
    // Phone verification arrives as a match grade (Exact Match, Partial Match,
    // No Match), not a Yes/No, so count anything that is not an explicit miss.
    const pv = leadField(l, 'phone_verified');
    if (pv != null && !/^(no|none|false|no match|not verified)$/i.test(String(pv).trim())) phoneVerified++;
  }

  const adSpend = spendRows(adSpendRows).reduce((a, r) => a + num(r.spend), 0);
  // What the leads actually cost us. External suppliers post their price on the
  // lead as cpl; Meta-sourced suppliers cost whatever ad spend was attributed to
  // them. A supplier is one or the other, never both, so adding the two is safe
  // and matches how the supplier cost engine prices a supplier.
  const totalCost = cost + adSpend;
  // Profit subtracts the FULL cost, ad spend included.
  //
  // This was revenue minus lead cost only, which ignored ad spend entirely. On
  // a month with ~$58k of spend and ~$1k of posted lead cost, Reports showed a
  // profit of ~$80.7k while Overview (which does subtract spend) showed ~$22.8k
  // for the same window. Same word, two numbers, one of them meaningless.
  const profit = revenue - totalCost;
  const netRevenue = revenue - returns * (total ? revenue / Math.max(total, 1) : 0);
  const netProfit = netRevenue - totalCost;
  const cpl = total > 0 ? cost / total : 0;
  // CPL is cost per SOLD lead, not cost per lead received. We pay for traffic to
  // produce sold leads, so dividing by every lead (including DQs, which are the
  // majority) understates the real acquisition cost badly. cost_per_sold is kept
  // as an alias so saved report cards referencing it keep working.
  const blendedCpl = sold > 0 ? totalCost / sold : 0;
  const costPerSold = blendedCpl;
  const convRate = total > 0 ? (sold / total) * 100 : 0;
  const qpMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const roas = adSpend > 0 ? revenue / adSpend : 0;
  verifiedIncome = bookedRevenue;
  const revenueGap = bookedRevenue - verifiedIncome;

  return {
    revenue, net_revenue: netRevenue, cost, cpl, total_cost: totalCost, profit, net_profit: netProfit,
    qp_margin: qpMargin, total_leads: total, sold, unsold, returns, fakes, duplicates, dqs,
    conv_rate: convRate, booked_revenue: bookedRevenue, verified_income: verifiedIncome,
    revenue_gap: revenueGap, outstanding, overdue, short_paid: shortPaid,
    ad_spend: adSpend, blended_cpl: blendedCpl, cost_per_sold: costPerSold, roas,
    phone_verified: phoneVerified,
  };
}

// Per-lead acquisition cost, allocated.
//
// External suppliers post a price on each lead, so that value is the cost
// outright. A Meta sourced supplier costs a pool per supplier per day, which
// gets spread evenly across that supplier's leads on that day. Daily is the
// finest grain Meta reports spend at, and a daily allocation rolls up correctly
// to any period you slice afterwards, which a period-derived figure would not.
//
// Pass the full set of leads in the window, not a subset: the denominator has
// to be every lead that supplier sent that day or the allocation inflates.
// Returns a Map keyed by the lead object.
export function allocatedLeadCost(allLeads = [], adSpendRows = []) {
  const nkey = (v) => String(v ?? '').trim().toLowerCase();
  const pool = {};
  for (const r of spendRows(adSpendRows)) {
    const k = `${nkey(r.supplier_key ?? r.supplier_name)}|${String(r.date || '').slice(0, 10)}`;
    pool[k] = (pool[k] || 0) + num(r.spend);
  }
  const counts = {};
  for (const l of allLeads) {
    const k = `${nkey(l.supplier_name)}|${leadEventDayKey(l)}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  const out = new Map();
  for (const l of allLeads) {
    const k = `${nkey(l.supplier_name)}|${leadEventDayKey(l)}`;
    const share = pool[k] && counts[k] ? pool[k] / counts[k] : 0;
    out.set(l, leadCost(l) + share);
  }
  return out;
}

// Metric catalog: key -> { label, format }
// Naming note: `total_cost` and `blended_cpl` are the ones labelled plainly as
// Cost and CPL, because they are the true numbers (supplier lead cost plus
// attributed ad spend). `cost` and `cpl` are the supplier-lead-cost-only
// components, kept under explicit labels so nobody reads a $0 CPL on a Meta
// sourced supplier and thinks the leads were free.
export const METRIC_CATALOG = [
  { key: 'revenue', label: 'Revenue', format: 'money' },
  { key: 'net_revenue', label: 'Net Revenue', format: 'money' },
  { key: 'total_cost', label: 'Cost', format: 'money' },
  { key: 'blended_cpl', label: 'CPL', format: 'money' },
  { key: 'cost', label: 'Supplier Lead Cost', format: 'money' },
  { key: 'cpl', label: 'Supplier CPL', format: 'money' },
  { key: 'profit', label: 'Profit', format: 'money' },
  { key: 'net_profit', label: 'Net Profit', format: 'money' },
  { key: 'qp_margin', label: 'QP Margin %', format: 'pct' },
  { key: 'total_leads', label: 'Total Leads', format: 'int' },
  { key: 'sold', label: 'Sold', format: 'int' },
  { key: 'unsold', label: 'Unsold', format: 'int' },
  { key: 'returns', label: 'Returns', format: 'int' },
  { key: 'fakes', label: 'Fakes', format: 'int' },
  { key: 'duplicates', label: 'Duplicates', format: 'int' },
  { key: 'dqs', label: 'DQs', format: 'int' },
  { key: 'booked_revenue', label: 'Booked Revenue', format: 'money' },
  { key: 'verified_income', label: 'Verified Income', format: 'money' },
  { key: 'revenue_gap', label: 'Revenue Gap', format: 'money' },
  { key: 'outstanding', label: 'Outstanding', format: 'money' },
  { key: 'overdue', label: 'Overdue', format: 'money' },
  { key: 'short_paid', label: 'Short Paid', format: 'money' },
  { key: 'ad_spend', label: 'Ad Spend', format: 'money' },
  { key: 'cost_per_sold', label: 'Cost Per Sold', format: 'money' },
  { key: 'roas', label: 'ROAS', format: 'num' },
  { key: 'phone_verified', label: 'Phone Verified', format: 'int' },
];

export const DEFAULT_CARD_METRICS = METRIC_CATALOG.filter(m => m.key !== 'phone_verified').map(m => m.key);

export function formatMetric(value, format) {
  switch (format) {
    case 'money': return money(value);
    case 'pct': return pct(value);
    case 'int': return int(value);
    case 'num': return num(value).toFixed(2);
    default: return String(value ?? '-');
  }
}

// Turn the report date filter into a series window. Returns null when no
// explicit range is applied, so callers fall back to their trailing default.
export function seriesWindow(filters = {}) {
  return filters?.date_from && filters?.date_to
    ? { from: filters.date_from, to: filters.date_to }
    : null;
}

const MAX_SERIES_DAYS = 366;

// Trailing `days` calendar days in APP_TZ, ending today.
function trailingDayKeys(days) {
  const keys = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    keys.push(formatInTimeZone(d, APP_TZ, 'yyyy-MM-dd'));
  }
  return keys;
}

// Day keys for the series. An explicit window wins so the chart and the daily
// table follow the selected date filter instead of always showing today back.
// Anchored at midday so stepping a day at a time can never drift across a
// boundary. Falls back to the trailing window if the range is unusable.
function seriesDayKeys(days, window) {
  if (!window?.from || !window?.to) return trailingDayKeys(days);
  const start = fromZonedTime(`${window.from}T12:00:00`, APP_TZ);
  const end = fromZonedTime(`${window.to}T12:00:00`, APP_TZ);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return trailingDayKeys(days);
  const keys = [];
  for (let d = start; d <= end && keys.length < MAX_SERIES_DAYS; d = new Date(d.getTime() + 86400000)) {
    keys.push(formatInTimeZone(d, APP_TZ, 'yyyy-MM-dd'));
  }
  return keys;
}

// Build a daily time series of revenue/spend/profit for the sparkline + bar chart.
// `window` is an optional { from, to } of yyyy-MM-dd APP_TZ day keys. When it is
// supplied it defines the buckets and `days` is ignored.
export function dailySeries(leads, adSpendRows = [], days = 14, window = null) {
  const map = {};
  for (const key of seriesDayKeys(days, window)) {
    map[key] = { date: key, revenue: 0, cost: 0, spend: 0, leads: 0, sold: 0 };
  }
  for (const l of leads) {
    const key = leadEventDayKey(l);
    if (!key || !map[key]) continue;
    map[key].revenue += num(l.revenue);
    map[key].cost += leadCost(l);
    map[key].leads += 1;
    if (S(l) === 'Sold') map[key].sold += 1;
  }
  for (const r of spendRows(adSpendRows)) {
    const key = (r.date || '').slice(0, 10);
    if (map[key]) map[key].spend += num(r.spend);
  }
  return Object.values(map).map(r => ({ ...r, profit: r.revenue - r.cost - r.spend }));
}

// Group-by aggregation used by tables (by campaign / state / buyer / supplier / utm etc).
export function groupBy(leads, field, adSpendRows = []) {
  const map = {};
  for (const l of leads) {
    const raw = leadField(l, field);
    const key = raw == null || raw === '' ? '(none)' : String(raw);
    if (!map[key]) map[key] = { key, leads: 0, sold: 0, revenue: 0, cost: 0 };
    map[key].leads += 1;
    map[key].revenue += num(l.revenue);
    map[key].cost += leadCost(l);
    if (S(l) === 'Sold') map[key].sold += 1;
  }
  // fold matching ad spend into cost for supplier grouping (true CPL)
  if (field === 'supplier_name') {
    for (const r of spendRows(adSpendRows)) {
      const key = r.supplier_name || '(none)';
      if (map[key]) map[key].cost += num(r.spend);
    }
  }
  return Object.values(map)
    .map(r => ({
      ...r,
      profit: r.revenue - r.cost,
      cpl: r.sold ? r.cost / r.sold : 0,
      convRate: r.leads ? (r.sold / r.leads) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function statusBreakdown(leads) {
  const map = {};
  for (const l of leads) {
    const s = S(l) || 'Processing';
    map[s] = (map[s] || 0) + 1;
  }
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}