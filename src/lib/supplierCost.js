// Supplier cost engine.
//
// Resolves, per lead, which SupplierSource priced it and what that lead cost,
// then aggregates cost / profit / CPL / money due per supplier over a date
// window. Pure functions: callers pass already-loaded Lead, Supplier,
// SupplierSource and AdSpend records.
//
// Source resolution order for a lead (mirrors the live pipeline, read only):
//   1. ssid on the payload wins: match the source whose source_code equals it.
//   2. no ssid: fall back to the source whose brand equals the lead supplier_brand.
//   3. neither matches: attribute to the supplier itself with no source.
//
// Cost by supplier_type:
//   External: cost from the matched source pricing (flat_cpl, rev_share % of the
//             lead revenue, or tiered rules), falling back to the lead
//             supplier_payout when the source has no pricing (none / no match).
//   Internal (LEADFLOW, LEGENEX): cost from mapped ad accounts via AdSpend,
//             never supplier_payout or CPL. Internal sources use pricing none.

import { leadField, leadEventInstant, spendRows } from '@/lib/reportMetrics';
import { parseRules, firstMatchIndex } from '@/components/operations/suppliers/tierRules';

function num(v) { const n = Number(v); return Number.isNaN(n) ? 0 : n; }
function norm(v) { return String(v ?? '').trim().toLowerCase(); }

// Local yyyy-MM-dd for comparing against AdSpend.date, which is already keyed to
// the spend day rather than an instant.
function toDayKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

// The ssid the inbound lead carried, from any of the common aliases.
export function leadSsid(lead) {
  for (const k of ['ssid', 'sid', 'supplier_sid', 'source_code', 'source_id']) {
    const v = leadField(lead, k);
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// The supplier_brand the inbound lead carried.
export function leadBrand(lead) {
  for (const k of ['supplier_brand', 'brand']) {
    const v = leadField(lead, k);
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// Pick the SupplierSource that priced this lead, from that supplier's own
// sources. Returns null when none resolve (supplier level attribution).
export function resolveSource(lead, sources) {
  const active = (sources || []).filter((s) => s.active !== false);
  if (active.length === 0) return null;

  const ssid = norm(leadSsid(lead));
  if (ssid) {
    const byCode = active.find((s) => norm(s.source_code) === ssid);
    if (byCode) return byCode;
  }

  const brand = norm(leadBrand(lead));
  if (brand) {
    const byBrand = active.find((s) => norm(s.brand) === brand);
    if (byBrand) return byBrand;
  }

  // A supplier with a single source does not need a source_code, per the
  // SupplierSource schema. Without this fallback a one-source supplier whose
  // leads carry no ssid resolved to nothing and lost its configured pricing.
  if (active.length === 1) return active[0];

  return null;
}

// Flat sample object for tiered rule evaluation: exposes the fields a rule can
// condition on (state, plus any mapped field), all as strings.
function ruleSample(lead) {
  const sample = {};
  for (const f of ['state', 'accident_state', 'vertical', 'lead_type', 'lead_status']) {
    const v = leadField(lead, f);
    if (v != null) sample[f] = String(v);
  }
  // state alias so a rule on `state` still matches accident_state
  if (sample.state == null && sample.accident_state != null) sample.state = sample.accident_state;
  return sample;
}

// Price one lead from a source's pricing. Returns a number, or null when the
// source has no usable price (falls through to supplier_payout).
//
// The model values here must match the SupplierSource schema enum exactly:
// none | flat_cpl | profit_pct | revenue_pct | tiered. An earlier version
// branched on 'rev_share' and read source.rev_share_pct, neither of which
// exists, so every Revenue % and Profit % source returned null and silently
// fell back to the lead's reported supplier_payout instead of its configured
// rate.
function priceFromSource(lead, source, context = {}) {
  if (!source) return null;
  const model = source.pricing_model;
  if (model === 'flat_cpl') {
    return source.flat_cpl == null ? null : num(source.flat_cpl);
  }
  if (model === 'revenue_pct') {
    if (source.revenue_pct == null) return null;
    return num(lead.revenue) * num(source.revenue_pct) / 100;
  }
  if (model === 'profit_pct') {
    if (source.profit_pct == null) return null;
    // Profit is revenue minus the cost of acquiring that lead. For an Internal
    // supplier that cost is its share of mapped ad spend, which the caller
    // passes in as context.leadAcquisitionCost. Without it, profit collapses to
    // revenue and this would silently behave like revenue_pct, so return null
    // rather than report a number that looks right and is not.
    if (context.leadAcquisitionCost == null) return null;
    const profit = num(lead.revenue) - num(context.leadAcquisitionCost);
    return profit * num(source.profit_pct) / 100;
  }
  if (model === 'tiered') {
    const rules = parseRules(source.tier_rules);
    if (rules.length === 0) return null;
    const idx = firstMatchIndex(rules, ruleSample(lead));
    if (idx < 0) return null;
    return num(rules[idx].price);
  }
  // model === 'none' or unset
  return null;
}

// Cost of a single lead for an External supplier: source price, else the lead's
// reported cpl/cost, else the lead's reported supplier_payout as a last resort.
export function externalLeadCost(lead, source, context = {}) {
  const priced = priceFromSource(lead, source, context);
  if (priced != null) return priced;
  // External suppliers post their own lead price on the payload, usually as
  // cpl. leadField resolves cost/cpl through FIELD_ALIASES and the
  // mapped_fields bag, so this is the normal path for a source with no
  // configured pricing.
  const posted = leadField(lead, 'cost');
  if (posted != null && String(posted).trim() !== '') return num(posted);
  return num(lead.supplier_payout);
}

// ---------------------------------------------------------------------------
// Payout: what the supplier is OWED. This is not cost.
//
// Cost is what acquiring the leads cost us (ad spend for Internal, the leads'
// own cpl for External). Payout is what we hand the supplier under their payout
// type. For a flat-CPL external source the two coincide, because the price we
// pay per lead is both. For a profit-share supplier they are entirely
// different: LeadFlow's cost is its ad spend, and on top of that it is owed a
// percentage of the profit that spend produced.
//
// Profit-share is a WINDOW-level calculation, never per-lead: profit is window
// revenue minus window cost, so the payout for 1-15 July is 30% of that
// window's profit and nothing else.
// ---------------------------------------------------------------------------

// Resolve the payout rule in force, preferring the source's own model and
// falling back to the supplier-level payout_type.
function payoutRule(supplier, source) {
  const model = source?.pricing_model;
  if (model === 'flat_cpl' && source.flat_cpl != null) return { kind: 'flat', value: num(source.flat_cpl) };
  if (model === 'revenue_pct' && source.revenue_pct != null) return { kind: 'revenue_pct', value: num(source.revenue_pct) };
  if (model === 'profit_pct' && source.profit_pct != null) return { kind: 'profit_pct', value: num(source.profit_pct) };
  if (model === 'tiered') return { kind: 'tiered', value: 0 };

  const t = supplier?.payout_type || 'None';
  const v = num(supplier?.payout_value);
  if (t === 'Flat CPL') return { kind: 'flat', value: v };
  if (t === 'Revenue %') return { kind: 'revenue_pct', value: v };
  if (t === 'Profit %') return { kind: 'profit_pct', value: v };
  return { kind: 'none', value: 0 };
}

// What a supplier is owed for one window.
//
// pricedLeads carries the per-lead acquisition cost already resolved by the
// caller. revenue and cost are the window totals, so profit_pct lands on the
// same basis the report displays.
export function supplierPayoutForWindow(supplier, sources, pricedLeads, revenue, cost) {
  // Group by the source that priced each lead so a supplier holding sources on
  // different payout types settles correctly.
  const groups = new Map();
  for (const p of pricedLeads) {
    const key = p.sourceId || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const byId = new Map((sources || []).map((s) => [s.id, s]));
  const totalLeads = pricedLeads.length;
  let payout = 0;

  for (const [sourceId, rows] of groups) {
    const source = sourceId ? byId.get(sourceId) : null;
    const rule = payoutRule(supplier, source);
    const groupRevenue = rows.reduce((a, p) => a + num(p.lead.revenue), 0);
    // Internal cost is a single spend pool rather than a per-lead figure, so a
    // group's share of it is proportional to its share of the leads.
    const groupCost = totalLeads > 0 ? cost * (rows.length / totalLeads) : 0;

    if (rule.kind === 'flat') payout += rule.value * rows.length;
    else if (rule.kind === 'revenue_pct') payout += groupRevenue * rule.value / 100;
    else if (rule.kind === 'profit_pct') payout += (groupRevenue - groupCost) * rule.value / 100;
    else if (rule.kind === 'tiered') payout += rows.reduce((a, p) => a + num(p.cost), 0);
    // 'none': the supplier posts what it is owed on the lead itself.
    else payout += rows.reduce((a, p) => a + num(p.lead.supplier_payout), 0);
  }

  return payout;
}

// Sum of mapped ad spend for an Internal supplier within the loaded AdSpend
// rows. AdSpend.supplier_key is the lowercased supplier_name.
//
// A supplier can have several ad accounts across several platforms, so the cost
// basis is the per-account daily total, summed across all of that supplier's
// accounts. spendRows resolves that: it takes the account rollup where one
// exists and reconstructs it from that day's campaign rows where it does not,
// keyed per ad account per day, so a partial backfill neither double counts nor
// loses a day. Campaign and ad rows are never a cost basis in their own right;
// they exist for ad performance reporting.
export function internalSupplierSpend(supplierName, adSpendRows, window) {
  const key = norm(supplierName);
  // AdSpend.date is a plain yyyy-MM-dd spend day. Without this the window only
  // filtered leads, so selecting a single day still reported the supplier's
  // entire spend history as that day's cost.
  const from = window?.start ? toDayKey(window.start) : null;
  const to = window?.end ? toDayKey(window.end) : null;
  let spend = 0;
  for (const r of spendRows(adSpendRows || [])) {
    const d = String(r.date || '').slice(0, 10);
    if (from && d < from) continue;
    if (to && d > to) continue;
    const rk = r.supplier_key != null ? norm(r.supplier_key) : norm(r.supplier_name);
    if (rk && (rk === key || rk.includes(key) || key.includes(rk))) spend += num(r.spend);
  }
  return spend;
}

// Filter leads to a { start, end } window using the lead's real event time.
// A null window returns all leads.
export function leadsInWindow(leads, window) {
  if (!window || (!window.start && !window.end)) return leads;
  return leads.filter((l) => {
    const inst = leadEventInstant(l);
    if (!inst) return false;
    if (window.start && inst < window.start) return false;
    if (window.end && inst > window.end) return false;
    return true;
  });
}

// Days elapsed for a Net term. Prepaid / Manual accrue immediately.
function termDays(terms) {
  switch (terms) {
    case 'Net 7': return 7;
    case 'Net 15': return 15;
    case 'Net 30': return 30;
    case 'Net 60': return 60;
    default: return 0; // Prepaid, Manual, or none: no deferral
  }
}

// Money Due: accrued unpaid cost. A lead's cost becomes due once its term has
// elapsed since the lead's event time. Prepaid / Manual / no term: due at once.
// This never reads or writes any billing record.
export function moneyDue(pricedLeads, supplier, now = new Date()) {
  const days = termDays(supplier?.payment_terms);
  let due = 0;
  for (const p of pricedLeads) {
    if (days === 0) { due += p.cost; continue; }
    const inst = leadEventInstant(p.lead);
    if (!inst) { due += p.cost; continue; }
    const ageDays = (now.getTime() - inst.getTime()) / 86400000;
    if (ageDays >= days) due += p.cost;
  }
  return due;
}

// Supplier names arrive from inbound payloads in whatever case the supplier
// uses (LEADFLOW), while the record may read LeadFlow or Leadflow. Compare on a
// normalised form so attribution does not silently split into two suppliers.
export function sameSupplier(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// Full metric bundle for one supplier over a window.
// sourcesBySupplier: { [supplierId]: SupplierSource[] }.
export function supplierCostMetrics(supplier, allLeads, sourcesBySupplier, adSpendRows, window, now = new Date()) {
  const sources = sourcesBySupplier[supplier.id] || [];
  const rows = leadsInWindow(
    allLeads.filter((l) => sameSupplier(l.supplier_name, supplier.name)),
    window,
  );
  const isInternal = supplier.supplier_type === 'Internal';

  let revenue = 0;
  let sold = 0;
  const pricedLeads = [];

  for (const lead of rows) {
    revenue += num(lead.revenue);
    if (String(lead.final_status || '') === 'Sold') sold++;
    // The source is resolved for every supplier, Internal included. Internal
    // cost still comes from ad spend rather than the source, but the source is
    // what carries the payout rule, so skipping it left a profit-share Internal
    // supplier with no payout at all.
    const source = resolveSource(lead, sources);
    const cost = isInternal ? 0 : externalLeadCost(lead, source);
    pricedLeads.push({ lead, cost, sourceId: source?.id || null });
  }

  let cost;
  if (isInternal) {
    cost = internalSupplierSpend(supplier.name, adSpendRows, window);
  } else {
    cost = pricedLeads.reduce((a, p) => a + p.cost, 0);
  }

  const leads = rows.length;
  const profit = revenue - cost;
  // CPL is cost per SOLD lead, matching every other CPL in the app. Dividing by
  // all leads received (DQs are usually the majority) reports a number that
  // looks like an acquisition cost but is not one, and it disagreed with the
  // CPL on Overview and Reports for the same supplier and window.
  const cpl = sold > 0 ? cost / sold : 0;
  // What the supplier is owed, which is a different number from what the leads
  // cost. Computed on the window totals so a profit share reflects exactly the
  // date range on screen.
  const payout = supplierPayoutForWindow(supplier, sources, pricedLeads, revenue, cost);
  // Internal cost is a single spend pool, not per-lead, so distribute it across
  // priced leads for Money Due term accrual; External uses per-lead cost.
  const dueLeads = isInternal
    ? pricedLeads.map((p, i) => ({ lead: p.lead, cost: leads > 0 ? cost / leads : 0 }))
    : pricedLeads;
  const due = moneyDue(dueLeads, supplier, now);

  return { leads, sold, revenue, cost, profit, cpl, payout, moneyDue: due, sourceCount: sources.length };
}

// A short human summary of a supplier's payout: its sources' pricing, or the
// supplier-level payout_type when it has no sources.
export function payoutSummary(supplier, sources) {
  const list = sources || [];
  if (list.length === 0) {
    const t = supplier?.payout_type && supplier.payout_type !== 'None' ? supplier.payout_type : 'None';
    if (t === 'Flat CPL' && supplier?.payout_value != null) return `Flat $${num(supplier.payout_value).toFixed(2)}`;
    if ((t === 'Revenue %' || t === 'Profit %') && supplier?.payout_value != null) return `${t} ${num(supplier.payout_value)}%`;
    return t;
  }
  const models = list.map((s) => s.pricing_model).filter(Boolean);
  const uniq = [...new Set(models)];
  if (uniq.length === 1) return `${list.length} src · ${uniq[0]}`;
  return `${list.length} src · mixed`;
}