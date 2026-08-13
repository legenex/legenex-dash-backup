// Ad Manager analytics engine.
//
// One rule governs this file: every number is derived from a real record. Meta
// reported figures come from AdSpend rows written by syncMetaSpend. Verified
// figures come from the Lead entity and the LeadByte sold result. Where a value
// cannot be derived, we return null and the UI renders it as unavailable. We
// never fabricate a value to fill a column.
//
// Pure functions only. Callers pass in already-loaded records.

import { formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';
import { leadField, leadEventInstant } from '@/lib/reportMetrics';

const n = (v) => { const x = Number(v); return isNaN(x) ? 0 : x; };
const norm = (v) => String(v ?? '').trim().toLowerCase();
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */
export const f0 = (v) => (v == null ? '-' : '$' + Math.round(n(v)).toLocaleString('en-US'));
export const f2 = (v) => (v == null ? '-' : '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const num = (v) => (v == null ? '-' : Math.round(n(v)).toLocaleString('en-US'));
export const pct = (v) => (v == null ? '-' : n(v).toFixed(2) + '%');
export const compact = (v) => {
  if (v == null) return '-';
  const x = n(v);
  if (x >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (x >= 1e3) return (x / 1e3).toFixed(1) + 'K';
  return String(Math.round(x));
};
export const roasText = (v) => (v == null ? '-' : n(v).toFixed(2) + 'x');

/* ------------------------------------------------------------------ */
/*  Benchmark bands                                                    */
/*  Thresholds live here so a single edit retunes every heat cell.     */
/* ------------------------------------------------------------------ */
// Tones reuse the app's existing status palette from index.css so the Ad
// Manager reads as native rather than as a bolt-on with its own colours.
export const TONE = { good: '#3DD68C', warn: '#E8A33D', bad: '#E5484D', neutral: '#8B95A8' };
export const BAND_TONE = {
  Excellent: TONE.good, Good: TONE.good, Healthy: TONE.good,
  Average: TONE.warn, Watch: TONE.warn,
  Poor: TONE.bad, Critical: TONE.bad,
};
export const cplTone = (v) => (v == null ? TONE.neutral : BAND_TONE[cplBand(v)]);
export const roasTone = (v) => (v == null ? TONE.neutral : BAND_TONE[roasBand(v)]);
export const cplBand = (v) => (v == null ? null : v <= 40 ? 'Excellent' : v <= 50 ? 'Good' : v <= 65 ? 'Average' : 'Poor');
export const roasBand = (v) => (v == null ? null : v >= 4 ? 'Excellent' : v >= 3 ? 'Good' : v >= 2.2 ? 'Average' : 'Poor');
export const ctrBand = (v) => (v == null ? null : v >= 2 ? 'Good' : v >= 1 ? 'Average' : 'Poor');
export const decisionOf = (roas) => (roas == null ? null : roas >= 4 ? 'Scale' : roas >= 2.5 ? 'Watch' : 'Kill');

// Deterministic opportunity score. Not a model output. Weighted blend of real
// ROAS, verified CPL and qualified volume, so the same inputs always score the
// same. Returns null when there is nothing verified to score.
export function opportunityScore({ roas, realCpl, qualified }) {
  if (roas == null || realCpl == null || !qualified) return null;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const roasPart = clamp(roas / 5) * 55;
  const cplPart = clamp((80 - realCpl) / 40) * 30;
  const volPart = clamp(qualified / 100) * 15;
  return Math.round(roasPart + cplPart + volPart);
}

/* ------------------------------------------------------------------ */
/*  Window helpers                                                     */
/* ------------------------------------------------------------------ */
const dayKey = (d) => formatInTimeZone(d, APP_TZ, 'yyyy-MM-dd');

// AdSpend.date is a plain yyyy-MM-dd string already keyed to the spend day, so
// a lexical compare against the window's APP_TZ day keys is exact.
export function spendInWindow(rows, win) {
  if (!win) return rows;
  const from = dayKey(win.start);
  const to = dayKey(win.end);
  return rows.filter((r) => {
    const d = String(r.date || '').slice(0, 10);
    return d >= from && d <= to;
  });
}

export function leadsInWindow(leads, win) {
  if (!win) return leads;
  return leads.filter((l) => {
    const d = leadEventInstant(l);
    return d && d >= win.start && d <= win.end;
  });
}

/* ------------------------------------------------------------------ */
/*  Platforms                                                          */
/*  Connected means a mapping exists or spend has landed. Everything    */
/*  else renders as a connect prompt rather than an empty chart.        */
/* ------------------------------------------------------------------ */
export const PLATFORM_LABELS = { meta: 'Meta', google_ads: 'Google', google: 'Google', tiktok: 'TikTok', taboola: 'Taboola' };
export const platformLabel = (p) => PLATFORM_LABELS[norm(p)] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Unknown');
const KNOWN_PLATFORMS = ['meta', 'google_ads', 'tiktok'];

export function platformsFrom(mappings = [], spendRows = []) {
  const mapped = uniq(mappings.filter((m) => m.enabled !== false).map((m) => norm(m.platform)));
  const withSpend = uniq(spendRows.map((r) => norm(r.platform)));
  const connected = new Set([...mapped, ...withSpend]);
  const ids = uniq([...KNOWN_PLATFORMS, ...connected]);
  return ids.map((id) => ({ id, label: platformLabel(id), connected: connected.has(id) }));
}

/* ------------------------------------------------------------------ */
/*  Verified truth from the Lead entity                                */
/* ------------------------------------------------------------------ */

// A lead is qualified once it passed the gates and was offered to buyers, which
// is exactly the set the gateway forwards. Queued, Duplicate, Error and
// Disqualified leads never reached a buyer, so they are cost without qualification.
export const QUALIFIED_STATUSES = ['Sold', 'Unsold', 'Returned'];
const isQualified = (l) => QUALIFIED_STATUSES.includes(String(l.final_status || ''));
const isSold = (l) => String(l.final_status || '') === 'Sold';

export function verifiedOf(leads = []) {
  let qualified = 0, sold = 0, revenue = 0;
  for (const l of leads) {
    if (isQualified(l)) qualified++;
    if (isSold(l)) { sold++; }
    revenue += n(l.revenue);
  }
  return { total: leads.length, qualified, sold, revenue };
}

// Fold reported spend and verified outcomes into one comparable object.
function combine({ spend, impressions, clicks, reportedLeads }, v) {
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
  const cpc = clicks > 0 ? spend / clicks : null;
  const reportedCpl = reportedLeads > 0 ? spend / reportedLeads : null;
  const realCpl = v.qualified > 0 ? spend / v.qualified : null;
  const costPerSold = v.sold > 0 ? spend / v.sold : null;
  const roas = spend > 0 ? v.revenue / spend : null;
  const cplGapPct = reportedCpl && realCpl ? (realCpl / reportedCpl - 1) * 100 : null;
  return {
    spend, impressions, clicks, reportedLeads, cpm, ctr, cpc, reportedCpl,
    qualified: v.qualified, sold: v.sold, revenue: v.revenue, totalLeads: v.total,
    realCpl, costPerSold, roas, cplGapPct,
    decision: decisionOf(roas),
    score: opportunityScore({ roas, realCpl, qualified: v.qualified }),
  };
}

const sumRows = (rows) => ({
  spend: rows.reduce((a, r) => a + n(r.spend), 0),
  impressions: rows.reduce((a, r) => a + n(r.impressions), 0),
  clicks: rows.reduce((a, r) => a + n(r.clicks), 0),
  reportedLeads: rows.reduce((a, r) => a + n(r.leads), 0),
});

/* ------------------------------------------------------------------ */
/*  Accounts                                                           */
/*                                                                     */
/*  Spend joins to leads on supplier. The AdSpendMapping for an ad      */
/*  account names the supplier that account's traffic arrives under,    */
/*  and Lead.supplier_name carries the same label from the gateway.     */
/*  The join is case-insensitive because suppliers post inconsistently. */
/* ------------------------------------------------------------------ */
export function buildAccounts({ spendRows = [], leads = [], mappings = [], platform = 'meta' }) {
  const rows = spendRows.filter((r) => norm(r.platform) === norm(platform));
  const acctRows = rows.filter((r) => !r.level || r.level === 'account');
  const mappingByAccount = {};
  for (const m of mappings) {
    if (norm(m.platform) === norm(platform) && m.enabled !== false && m.ad_account_id) mappingByAccount[m.ad_account_id] = m;
  }

  const leadsBySupplier = {};
  for (const l of leads) {
    const k = norm(l.supplier_name);
    if (!k) continue;
    (leadsBySupplier[k] ||= []).push(l);
  }

  const accountIds = uniq(acctRows.map((r) => r.ad_account_id));
  return accountIds.map((id) => {
    const mine = acctRows.filter((r) => r.ad_account_id === id);
    const mapping = mappingByAccount[id] || null;
    const supplierName = mapping?.supplier_name || mine.find((r) => r.supplier_name)?.supplier_name || '';
    const supplierKey = norm(supplierName);
    const acctLeads = supplierKey ? (leadsBySupplier[supplierKey] || []) : [];
    const name = mapping?.ad_account_name || mine.find((r) => r.cost_source)?.cost_source || id;

    return {
      id,
      platform: norm(platform),
      name,
      shortName: name.length > 16 ? name.slice(0, 15) + '.' : name,
      brand: mapping?.brand || '',
      vertical: mapping?.vertical || '',
      supplierName,
      supplierKey,
      mappingId: mapping?.id || '',
      mapped: !!mapping,
      lastSyncedAt: mapping?.last_synced_at || null,
      leads: acctLeads,
      ...combine(sumRows(mine), verifiedOf(acctLeads)),
    };
  }).sort((a, b) => b.spend - a.spend);
}

// Portfolio roll-up. Spend and impressions sum. Rates are recomputed from the
// summed base rather than averaged, so a small account cannot skew the blend.
export function portfolioOf(accounts = []) {
  const totals = {
    spend: accounts.reduce((a, x) => a + n(x.spend), 0),
    impressions: accounts.reduce((a, x) => a + n(x.impressions), 0),
    clicks: accounts.reduce((a, x) => a + n(x.clicks), 0),
    reportedLeads: accounts.reduce((a, x) => a + n(x.reportedLeads), 0),
  };
  const v = {
    total: accounts.reduce((a, x) => a + n(x.totalLeads), 0),
    qualified: accounts.reduce((a, x) => a + n(x.qualified), 0),
    sold: accounts.reduce((a, x) => a + n(x.sold), 0),
    revenue: accounts.reduce((a, x) => a + n(x.revenue), 0),
  };
  const allLeads = accounts.flatMap((a) => a.leads || []);
  return {
    id: 'all',
    name: 'All accounts',
    brand: 'All brands',
    isPortfolio: true,
    accountCount: accounts.length,
    accounts,
    leads: allLeads,
    ...combine(totals, v),
  };
}

/* ------------------------------------------------------------------ */
/*  Campaigns                                                          */
/*                                                                     */
/*  Meta campaign spend joins to leads on utm_campaign, which the       */
/*  funnels pass through verbatim as the Meta campaign name. Leads that */
/*  carry no matching utm_campaign stay out of the campaign table       */
/*  rather than being spread across campaigns.                          */
/* ------------------------------------------------------------------ */
export function buildCampaigns(account, spendRows = []) {
  if (!account) return [];
  const rows = spendRows.filter(
    (r) => r.level === 'campaign' && r.ad_account_id === account.id && norm(r.platform) === account.platform
  );
  const leadsByCampaign = {};
  for (const l of account.leads || []) {
    const k = norm(leadField(l, 'utm_campaign'));
    if (!k) continue;
    (leadsByCampaign[k] ||= []).push(l);
  }

  const ids = uniq(rows.map((r) => r.meta_campaign_id || r.meta_campaign_name));
  return ids.map((id) => {
    const mine = rows.filter((r) => (r.meta_campaign_id || r.meta_campaign_name) === id);
    const name = mine.find((r) => r.meta_campaign_name)?.meta_campaign_name || id;
    const campLeads = leadsByCampaign[norm(name)] || [];
    return {
      id,
      name,
      accountId: account.id,
      matched: campLeads.length > 0,
      leads: campLeads,
      ...combine(sumRows(mine), verifiedOf(campLeads)),
    };
  }).sort((a, b) => b.spend - a.spend);
}

// Ad sets and ads under one campaign, straight from ad-level rows. Verified
// outcomes are only attached where a creative has been tagged with the
// utm_content its funnel passes, otherwise those columns stay unavailable.
export function buildAdSets(campaign, spendRows = [], creativeMeta = []) {
  if (!campaign) return [];
  const adRows = spendRows.filter(
    (r) => r.level === 'ad' && r.ad_account_id === campaign.accountId &&
      (r.meta_campaign_id === campaign.id || r.meta_campaign_name === campaign.name)
  );
  const metaByAdId = {};
  for (const m of creativeMeta) if (m.ad_id) metaByAdId[m.ad_id] = m;

  const leadsByContent = {};
  for (const l of campaign.leads || []) {
    const k = norm(leadField(l, 'utm_content'));
    if (!k) continue;
    (leadsByContent[k] ||= []).push(l);
  }

  const setIds = uniq(adRows.map((r) => r.adset_id || r.adset_name));
  return setIds.map((sid) => {
    const setRows = adRows.filter((r) => (r.adset_id || r.adset_name) === sid);
    const adIds = uniq(setRows.map((r) => r.ad_id || r.ad_name));
    const ads = adIds.map((aid) => {
      const mine = setRows.filter((r) => (r.ad_id || r.ad_name) === aid);
      const first = mine[0] || {};
      const tag = metaByAdId[first.ad_id];
      const content = norm(tag?.utm_content);
      const adLeads = content ? (leadsByContent[content] || []) : [];
      return {
        id: aid,
        name: first.ad_name || aid,
        tagged: !!tag,
        matched: adLeads.length > 0,
        ...combine(sumRows(mine), verifiedOf(adLeads)),
      };
    }).sort((a, b) => b.spend - a.spend);

    const setLeads = ads.some((a) => a.matched)
      ? uniq(adIds).flatMap((aid) => {
          const first = setRows.find((r) => (r.ad_id || r.ad_name) === aid) || {};
          const content = norm(metaByAdId[first.ad_id]?.utm_content);
          return content ? (leadsByContent[content] || []) : [];
        })
      : [];

    return {
      id: sid,
      name: setRows.find((r) => r.adset_name)?.adset_name || sid,
      ads,
      ...combine(sumRows(setRows), verifiedOf(setLeads)),
    };
  }).sort((a, b) => b.spend - a.spend);
}

/* ------------------------------------------------------------------ */
/*  Breakouts                                                          */
/*                                                                     */
/*  Meta does not report spend by state, placement or hour unless the   */
/*  insights call requests those breakdowns, which syncMetaSpend does   */
/*  not do today. So leads, sold and revenue here are real, and the     */
/*  spend column is an allocation of the scope's real spend in          */
/*  proportion to qualified lead share. It is labelled as allocated     */
/*  everywhere it appears so it is never mistaken for reported spend.   */
/* ------------------------------------------------------------------ */
export const BREAKOUT_DIMS = [
  { id: 'state', label: 'By State', field: 'accident_state' },
  { id: 'placement', label: 'By Placement', field: 'utm_terms' },
  { id: 'hour', label: 'By Hour', field: null },
  { id: 'ad', label: 'By Ad', field: null },
];

function allocate(buckets, totalSpend) {
  const totalQualified = buckets.reduce((a, b) => a + b.qualified, 0);
  return buckets.map((b) => {
    const allocatedSpend = totalQualified > 0 ? (b.qualified / totalQualified) * totalSpend : 0;
    return {
      ...b,
      allocatedSpend,
      realCpl: b.qualified > 0 ? allocatedSpend / b.qualified : null,
      roas: allocatedSpend > 0 ? b.revenue / allocatedSpend : null,
    };
  }).sort((a, b) => b.allocatedSpend - a.allocatedSpend);
}

export function breakoutByField(scope, field) {
  const map = {};
  for (const l of scope.leads || []) {
    const raw = leadField(l, field);
    const key = raw == null || raw === '' ? '(not set)' : String(raw);
    (map[key] ||= { key, leads: 0, qualified: 0, sold: 0, revenue: 0 });
    map[key].leads += 1;
    if (isQualified(l)) map[key].qualified += 1;
    if (isSold(l)) map[key].sold += 1;
    map[key].revenue += n(l.revenue);
  }
  return allocate(Object.values(map), scope.spend);
}

export function breakoutByHour(scope) {
  const map = {};
  for (let h = 0; h < 24; h++) {
    map[h] = { key: `${String(h).padStart(2, '0')}:00`, hour: h, leads: 0, qualified: 0, sold: 0, revenue: 0 };
  }
  for (const l of scope.leads || []) {
    const d = leadEventInstant(l);
    if (!d) continue;
    const h = Number(formatInTimeZone(d, APP_TZ, 'H'));
    map[h].leads += 1;
    if (isQualified(l)) map[h].qualified += 1;
    if (isSold(l)) map[h].sold += 1;
    map[h].revenue += n(l.revenue);
  }
  return allocate(Object.values(map), scope.spend).sort((a, b) => a.hour - b.hour);
}

// By Ad uses reported spend directly, because ad-level spend is real.
export function breakoutByAd(scope, spendRows = [], creativeMeta = []) {
  const accountIds = scope.isPortfolio ? (scope.accounts || []).map((a) => a.id) : [scope.id];
  const adRows = spendRows.filter((r) => r.level === 'ad' && accountIds.includes(r.ad_account_id));
  const metaByAdId = {};
  for (const m of creativeMeta) if (m.ad_id) metaByAdId[m.ad_id] = m;

  const leadsByContent = {};
  for (const l of scope.leads || []) {
    const k = norm(leadField(l, 'utm_content'));
    if (!k) continue;
    (leadsByContent[k] ||= []).push(l);
  }

  const ids = uniq(adRows.map((r) => r.ad_id || r.ad_name));
  return ids.map((id) => {
    const mine = adRows.filter((r) => (r.ad_id || r.ad_name) === id);
    const first = mine[0] || {};
    const tag = metaByAdId[first.ad_id];
    const content = norm(tag?.utm_content);
    const adLeads = content ? (leadsByContent[content] || []) : [];
    return {
      key: first.ad_name || id,
      adId: first.ad_id || '',
      concept: tag?.concept || '',
      creator: tag?.creator || '',
      creativeType: tag?.creative_type || 'video',
      tagged: !!tag,
      matched: adLeads.length > 0,
      ...combine(sumRows(mine), verifiedOf(adLeads)),
    };
  }).sort((a, b) => b.spend - a.spend);
}

/* ------------------------------------------------------------------ */
/*  Creatives                                                          */
/*                                                                     */
/*  A creative is one permanent object across every campaign and        */
/*  account, keyed on the Meta ad id. Thumbstop and hold come from      */
/*  video metrics on the ad-level rows. Image ads report no video       */
/*  metrics, so those cells stay unavailable rather than showing zero.  */
/* ------------------------------------------------------------------ */
export function buildCreatives({ spendRows = [], leads = [], creativeMeta = [], platform = 'meta', accountIds = null }) {
  let adRows = spendRows.filter((r) => r.level === 'ad' && norm(r.platform) === norm(platform));
  if (accountIds) adRows = adRows.filter((r) => accountIds.includes(r.ad_account_id));

  const metaByAdId = {};
  for (const m of creativeMeta) if (m.ad_id) metaByAdId[m.ad_id] = m;

  const leadsByContent = {};
  for (const l of leads) {
    const k = norm(leadField(l, 'utm_content'));
    if (!k) continue;
    (leadsByContent[k] ||= []).push(l);
  }

  const ids = uniq(adRows.map((r) => r.ad_id).filter(Boolean));
  return ids.map((adId) => {
    const mine = adRows.filter((r) => r.ad_id === adId);
    const first = mine[0] || {};
    const tag = metaByAdId[adId];
    const content = norm(tag?.utm_content);
    const adLeads = content ? (leadsByContent[content] || []) : [];
    const base = sumRows(mine);
    const views3s = mine.reduce((a, r) => a + n(r.video_3s_views), 0);
    const thruplays = mine.reduce((a, r) => a + n(r.video_thruplays), 0);
    const isVideo = (tag?.creative_type || 'video') === 'video';
    const combined = combine(base, verifiedOf(adLeads));
    return {
      adId,
      name: first.ad_name || tag?.ad_name || adId,
      accountId: first.ad_account_id || '',
      campaignName: first.meta_campaign_name || '',
      concept: tag?.concept || '',
      hook: tag?.hook || '',
      creator: tag?.creator || '',
      utmContent: tag?.utm_content || '',
      creativeType: tag?.creative_type || 'video',
      tagged: !!tag,
      matched: adLeads.length > 0,
      thumbstop: isVideo && base.impressions > 0 && views3s > 0 ? (views3s / base.impressions) * 100 : null,
      holdRate: isVideo && base.impressions > 0 && thruplays > 0 ? (thruplays / base.impressions) * 100 : null,
      ...combined,
      band: roasBand(combined.roas),
    };
  }).sort((a, b) => b.spend - a.spend);
}

// Roll creatives up by a tagged dimension. Untagged creatives are excluded and
// reported separately so the operator knows the rollup is partial.
export function rollupCreatives(creatives = [], key) {
  const map = {};
  let untagged = 0;
  for (const c of creatives) {
    const v = c[key];
    if (!v) { untagged++; continue; }
    (map[v] ||= { key: v, ads: 0, spend: 0, qualified: 0, sold: 0, revenue: 0 });
    map[v].ads += 1;
    map[v].spend += n(c.spend);
    map[v].qualified += n(c.qualified);
    map[v].sold += n(c.sold);
    map[v].revenue += n(c.revenue);
  }
  const rows = Object.values(map).map((r) => ({
    ...r,
    realCpl: r.qualified > 0 ? r.spend / r.qualified : null,
    roas: r.spend > 0 ? r.revenue / r.spend : null,
  })).sort((a, b) => n(b.revenue) - n(a.revenue));
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  return { rows: rows.map((r) => ({ ...r, share: totalSpend > 0 ? (r.spend / totalSpend) * 100 : 0 })), untagged };
}

/* ------------------------------------------------------------------ */
/*  Sync roster                                                        */
/*  Grouped by business manager where a mapping names one, otherwise    */
/*  by the ad account itself. Health is derived from last_synced_at.    */
/* ------------------------------------------------------------------ */
export function buildSyncRoster({ accounts = [], mappings = [], platform = 'meta' }) {
  const byAccountId = {};
  for (const a of accounts) byAccountId[a.id] = a;

  const rows = mappings
    .filter((m) => norm(m.platform) === norm(platform))
    .map((m) => {
      const acct = byAccountId[m.ad_account_id];
      const last = m.last_synced_at ? new Date(m.last_synced_at) : null;
      const ageMin = last ? (Date.now() - last.getTime()) / 60000 : null;
      const status = !m.enabled ? 'Paused' : ageMin == null ? 'Never synced' : ageMin < 120 ? 'Synced' : 'Stale';
      return {
        id: m.id,
        accountId: m.ad_account_id,
        name: m.ad_account_name || acct?.name || m.ad_account_id,
        supplier: m.supplier_name || '',
        brand: m.brand || '',
        vertical: m.vertical || '',
        interval: m.sync_interval || '',
        status,
        lastSyncedAt: m.last_synced_at || null,
        ageMin,
        hasSpend: !!acct,
      };
    });

  // Ad accounts that have spend but no mapping cannot attribute to a supplier,
  // so they are surfaced as unmapped rather than silently dropped.
  const mappedIds = new Set(rows.map((r) => r.accountId));
  const unmapped = accounts.filter((a) => !mappedIds.has(a.id)).map((a) => ({
    id: 'unmapped_' + a.id,
    accountId: a.id,
    name: a.name,
    supplier: '',
    brand: '',
    vertical: '',
    interval: '',
    status: 'Unmapped',
    lastSyncedAt: null,
    ageMin: null,
    hasSpend: true,
  }));

  const all = [...rows, ...unmapped];
  const groups = {};
  for (const r of all) {
    const g = r.brand || 'Unassigned';
    (groups[g] ||= []).push(r);
  }
  return Object.entries(groups).map(([group, items]) => ({ group, items })).sort((a, b) => b.items.length - a.items.length);
}

/* ------------------------------------------------------------------ */
/*  Spend versus verified revenue series, for the portfolio chart       */
/* ------------------------------------------------------------------ */
export function portfolioSeries(accounts = []) {
  return accounts.map((a) => ({ name: a.shortName, spend: Math.round(a.spend), revenue: Math.round(a.revenue) }));
}

/* ------------------------------------------------------------------ */
/*  AI summary payload                                                 */
/*  Trimmed to aggregates. No PII, no raw leads, no lead ids.          */
/* ------------------------------------------------------------------ */
export function insightSummary(scope, campaigns = []) {
  const pick = (o) => ({
    name: o.name, spend: Math.round(o.spend), reported_cpl: o.reportedCpl, verified_cpl: o.realCpl,
    qualified: o.qualified, sold: o.sold, revenue: Math.round(o.revenue), roas: o.roas, decision: o.decision,
  });
  return {
    scope: scope.name,
    platform: platformLabel(scope.platform || 'meta'),
    spend: Math.round(scope.spend),
    impressions: scope.impressions,
    reported_leads: scope.reportedLeads,
    reported_cpl: scope.reportedCpl,
    verified_cpl: scope.realCpl,
    cpl_gap_pct: scope.cplGapPct,
    qualified: scope.qualified,
    sold: scope.sold,
    revenue: Math.round(scope.revenue),
    roas: scope.roas,
    accounts: (scope.accounts || []).map(pick),
    campaigns: campaigns.map(pick),
  };
}
