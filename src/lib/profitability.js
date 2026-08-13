// Profitability engine for the Finances > Profitability tab.
// Pure functions, no React, no network. Callers pass records already filtered
// to the reporting window.
//
// CORE RULE: BankTransaction cash is the only source summed into any cost or
// revenue total. Synced AdSpend records are NEVER added into a cost total. They
// are used only for the variance and markup comparison in the ads object. This
// prevents double counting, because the Check a Case ad account is paid by the
// supplier LeadFlow and reaches the bank as a payment to LeadFlow, while own
// card accounts reach the bank as FACEBK charges.
import { costClassOf } from '@/lib/financeSettings';

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

// A transaction is excluded from every total when it is explicitly flagged, or
// its category resolves to the 'excluded' cost class. costClassOf returns
// 'excluded' for an empty category, so uncategorized transactions are excluded
// from every total by design.
function isExcluded(t, settings) {
  if (t?.excluded_from_pnl === true) return true;
  return costClassOf(t?.category, settings) === 'excluded';
}

// Sum of money out (abs of negative amounts) over a set of transactions.
const sumOut = (rows) => rows.reduce((a, t) => a + (num(t.amount) < 0 ? Math.abs(num(t.amount)) : 0), 0);

// Reduce adSpend rows to one spend figure per ad_account_id, counting only
// 'account' level rows to avoid triple counting the account/campaign/ad levels.
// When an account has no 'account' level rows, fall back to its 'campaign' rows.
function spendByAccount(adSpend = []) {
  const acctRows = {};
  const campRows = {};
  for (const r of adSpend) {
    const id = r?.ad_account_id;
    if (!id) continue;
    if (r.level === 'account') (acctRows[id] = acctRows[id] || []).push(r);
    else if (r.level === 'campaign') (campRows[id] = campRows[id] || []).push(r);
  }
  const ids = new Set([...Object.keys(acctRows), ...Object.keys(campRows)]);
  const out = {};
  ids.forEach((id) => {
    const rows = acctRows[id]?.length ? acctRows[id] : (campRows[id] || []);
    out[id] = rows.reduce((a, r) => a + num(r.spend), 0);
  });
  return out;
}

export function buildProfitability({ txns = [], leads = [], adSpend = [], mappings = [], settings } = {}) {
  // Uncategorized: transactions with no category at all.
  const uncatRows = txns.filter((t) => !t.category);
  const uncategorized = {
    count: uncatRows.length,
    out: uncatRows.reduce((a, t) => a + (num(t.amount) < 0 ? Math.abs(num(t.amount)) : 0), 0),
    in: uncatRows.reduce((a, t) => a + (num(t.amount) > 0 ? num(t.amount) : 0), 0),
  };

  // Non-excluded transactions feed every total.
  const live = txns.filter((t) => !isExcluded(t, settings));

  // One cost row per category (fixed / variable / drawings). Amount is money out.
  const rowMap = {};
  for (const t of live) {
    const cls = costClassOf(t.category, settings);
    if (!['fixed', 'variable', 'drawings'].includes(cls)) continue;
    const amt = num(t.amount);
    if (amt >= 0) continue;
    const key = t.category;
    if (!rowMap[key]) {
      const cat = (settings?.categories || []).find((c) => c.key === key);
      rowMap[key] = { key, label: cat?.label || key, group: cat?.group || 'Other', cost_class: cls, amount: 0, count: 0 };
    }
    rowMap[key].amount += Math.abs(amt);
    rowMap[key].count += 1;
  }
  const costRows = Object.values(rowMap)
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const fixed = costRows.filter((r) => r.cost_class === 'fixed').reduce((a, r) => a + r.amount, 0);
  const variable = costRows.filter((r) => r.cost_class === 'variable').reduce((a, r) => a + r.amount, 0);
  const drawings = costRows.filter((r) => r.cost_class === 'drawings').reduce((a, r) => a + r.amount, 0);

  const revenueBank = live
    .filter((t) => costClassOf(t.category, settings) === 'revenue' && num(t.amount) > 0)
    .reduce((a, t) => a + num(t.amount), 0);
  const revenueBooked = leads.reduce((a, l) => a + num(l.revenue), 0);

  const totals = { fixed, variable, drawings, revenueBank, revenueBooked, costTotal: fixed + variable };

  // Ad reconciliation. Cash figures come from bank only; synced figures come
  // only from AdSpend and are never added to any cost total above.
  const spendMap = spendByAccount(adSpend);
  const mapByAccount = {};
  (mappings || []).forEach((m) => { if (m?.ad_account_id) mapByAccount[m.ad_account_id] = m; });

  let syncedOwnCard = 0;
  let syncedSupplier = 0;
  let syncedUnmapped = 0;
  Object.entries(spendMap).forEach(([id, spend]) => {
    const m = mapByAccount[id];
    if (!m) { syncedUnmapped += spend; return; }
    if (m.payer === 'own_card') syncedOwnCard += spend;
    else if (m.payer === 'supplier') syncedSupplier += spend;
    else syncedUnmapped += spend;
  });

  const ownCardCash = sumOut(
    live.filter((t) => costClassOf(t.category, settings) === 'variable' && t.category === 'media'),
  );
  const supplierCash = sumOut(live.filter((t) => t.category === 'payouts'));

  const ads = {
    ownCardCash,
    syncedOwnCard,
    syncedSupplier,
    syncedUnmapped,
    supplierCash,
    ownCardVariance: ownCardCash - syncedOwnCard,
    supplierMarkup: supplierCash - syncedSupplier,
  };

  return { uncategorized, costRows, totals, leadCount: leads.length, ads };
}

// Breakeven analysis. Returns { ok: false, reason } when it cannot be computed
// honestly, otherwise the full result set.
export function breakeven({ fixed = 0, variable = 0, revenue = 0, leadCount = 0 } = {}) {
  if (leadCount <= 0) {
    return { ok: false, reason: 'No leads in this period, so revenue per lead cannot be derived.' };
  }
  if (revenue <= 0) {
    return { ok: false, reason: 'No revenue in this period on this basis.' };
  }
  const revenuePerLead = revenue / leadCount;
  const variablePerLead = variable / leadCount;
  const contributionPerLead = revenuePerLead - variablePerLead;
  if (contributionPerLead <= 0) {
    return {
      ok: false,
      reason: 'Variable cost per lead meets or exceeds revenue per lead, so there is no volume that breaks even. Cut variable cost or raise price.',
    };
  }
  const cmRatio = contributionPerLead / revenuePerLead;
  const breakevenLeads = fixed / contributionPerLead;
  const breakevenRevenue = cmRatio > 0 ? fixed / cmRatio : 0;
  const currentProfit = revenue - variable - fixed;
  const surplusLeads = leadCount - breakevenLeads;
  return {
    ok: true,
    revenuePerLead,
    variablePerLead,
    contributionPerLead,
    cmRatio,
    breakevenLeads,
    breakevenRevenue,
    currentProfit,
    surplusLeads,
  };
}

// Points for the breakeven chart: revenue and total cost as a function of leads.
export function breakevenCurve({ fixed = 0, revenuePerLead = 0, variablePerLead = 0, breakevenLeads = 0, leadCount = 0 } = {}) {
  const maxLeads = Math.max(breakevenLeads, leadCount) * 1.6;
  const steps = 24;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const leads = (maxLeads / steps) * i;
    out.push({
      leads: Math.round(leads),
      revenue: leads * revenuePerLead,
      cost: fixed + leads * variablePerLead,
    });
  }
  return out;
}

// Monthly trend of revenue and cost classes, built from non-excluded txns.
export function monthlySeries({ txns = [], settings } = {}) {
  const live = txns.filter((t) => !isExcluded(t, settings));
  const map = {};
  for (const t of live) {
    const month = String(t.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (!map[month]) map[month] = { month, revenue: 0, fixed: 0, variable: 0, drawings: 0 };
    const cls = costClassOf(t.category, settings);
    const amt = num(t.amount);
    if (cls === 'revenue' && amt > 0) map[month].revenue += amt;
    else if (amt < 0 && ['fixed', 'variable', 'drawings'].includes(cls)) map[month][cls] += Math.abs(amt);
  }
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}