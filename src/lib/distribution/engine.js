// Pure, runtime-agnostic lead distribution routing engine.
//
// Every export here is a PURE function: no I/O, no Date.now, no globals beyond
// standard JS (and Web Crypto for the async idempotency key, available in Deno,
// Node 20+, and browsers). All time and data is passed in, so the same inputs
// always produce the same outputs. This is what makes the engine unit-testable
// and safe to run in the simulator with zero side effects.
//
// See docs/lead-distribution/ROUTING-SPEC.md for the model this implements.

// Stable reason codes (extend-only). Ordered by the fixed eligibility sequence.
export const REASON = {
  ELIGIBLE: 'ELIGIBLE',
  BUYER_LIFECYCLE_INELIGIBLE: 'BUYER_LIFECYCLE_INELIGIBLE',
  MEMBER_INACTIVE: 'MEMBER_INACTIVE',
  OUTSIDE_SCHEDULE: 'OUTSIDE_SCHEDULE',
  FILTER_STATE: 'FILTER_STATE',
  FILTER_ZIP: 'FILTER_ZIP',
  FILTER_COUNTY: 'FILTER_COUNTY',
  FILTER_VERTICAL: 'FILTER_VERTICAL',
  FILTER_BRAND: 'FILTER_BRAND',
  FILTER_SUPPLIER: 'FILTER_SUPPLIER',
  FILTER_SOURCE: 'FILTER_SOURCE',
  FILTER_LEAD_TYPE: 'FILTER_LEAD_TYPE',
  FILTER_ACCIDENT_DATE: 'FILTER_ACCIDENT_DATE',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  QUALIFICATION_FAILED: 'QUALIFICATION_FAILED',
  SUPPRESSED: 'SUPPRESSED',
  CAP_TOTAL: 'CAP_TOTAL',
  CAP_HOURLY: 'CAP_HOURLY',
  CAP_DAILY: 'CAP_DAILY',
  CAP_WEEKLY: 'CAP_WEEKLY',
  CAP_MONTHLY: 'CAP_MONTHLY',
  LOW_BALANCE: 'LOW_BALANCE',
  OVER_CREDIT_LIMIT: 'OVER_CREDIT_LIMIT',
  DESTINATION_UNHEALTHY: 'DESTINATION_UNHEALTHY',
  BELOW_RESERVE: 'BELOW_RESERVE',
  NO_ELIGIBLE_MEMBER: 'NO_ELIGIBLE_MEMBER',
};

// TrustedForm: GATE-ONLY validation. Never generate or fabricate a certificate.
const TRUSTEDFORM_RE = /^https?:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}(\?.*)?$/;
export function isValidTrustedForm(url) {
  return typeof url === 'string' && TRUSTEDFORM_RE.test(url.trim());
}

// Required-field gate. Returns the list of missing (empty/absent) fields.
export function missingRequiredFields(data, required) {
  const d = data || {};
  return (required || []).filter((f) => {
    const v = d[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

// Case-insensitive membership. An empty/absent filter list means "no restriction".
function passesListFilter(filterList, value) {
  if (!Array.isArray(filterList) || filterList.length === 0) return true;
  const v = String(value ?? '').trim().toLowerCase();
  return filterList.some((f) => String(f).trim().toLowerCase() === v);
}

// True when `dateVal` parses to a time within the trailing `months` window ending
// at nowMs. A configured window with an absent/unparseable date fails closed (an
// unknown accident date must not qualify for a date-gated destination). Uses the
// same ~30-day month approximation as conditions.js so filters and qualification
// rules agree.
function withinTrailingMonths(dateVal, months, nowMs) {
  const t = Date.parse(String(dateVal ?? '').trim());
  if (Number.isNaN(t)) return false;
  const cutoff = nowMs - Number(months) * 30 * 86400000;
  return t >= cutoff && t <= nowMs;
}

// Which cap window, if any, is exhausted. caps = { daily:{limit,count}, ... }.
// A window with no limit (null/undefined) is unlimited. Reserving one lead means
// count + 1 must be <= limit.
const CAP_WINDOWS = [
  ['total', REASON.CAP_TOTAL],
  ['hourly', REASON.CAP_HOURLY],
  ['daily', REASON.CAP_DAILY],
  ['weekly', REASON.CAP_WEEKLY],
  ['monthly', REASON.CAP_MONTHLY],
];
export function exhaustedCap(caps) {
  const c = caps || {};
  for (const [key, reason] of CAP_WINDOWS) {
    const w = c[key];
    if (w && w.limit != null && Number(w.count || 0) + 1 > Number(w.limit)) {
      return reason;
    }
  }
  return null;
}

// Fixed-order member eligibility. `member` carries a snapshot of buyer + caps +
// wallet + health so this stays pure. Returns { eligible, reason }.
export function evaluateMember(member, lead, opts = {}) {
  const m = member || {};
  const l = lead || {};
  const buyer = m.buyer || {};

  // 1. member active, then buyer lifecycle by ALLOWLIST (fail closed).
  if (m.active === false) return fail(REASON.MEMBER_INACTIVE);
  // Eligible ONLY when the buyer is explicitly active on BOTH fields. Everything
  // else - paused, terminated, draft, suspended, unknown status, contradictory
  // fields, or a missing buyer - is ineligible. Never trust a single field and
  // never default-allow an unrecognized state.
  const status = String(buyer.status || '').toLowerCase();
  const lifecycleOk = status === 'active' && buyer.active === true;
  if (!lifecycleOk) return fail(REASON.BUYER_LIFECYCLE_INELIGIBLE);

  // 2. schedule (caller passes a resolved boolean for the member's tz window).
  if (m.withinSchedule === false) return fail(REASON.OUTSIDE_SCHEDULE);

  // 3. attribute filters. State, lead type, and accident-date recency are
  // promoted to first-class filters here (fast fail with a clear reason code)
  // rather than living in the free-form condition tree.
  const f = m.filters || {};
  if (!passesListFilter(f.states, l.state)) return fail(REASON.FILTER_STATE);
  if (!passesListFilter(f.lead_types, l.lead_type)) return fail(REASON.FILTER_LEAD_TYPE);
  if (f.accident_within_months != null && opts.nowMs != null
    && !withinTrailingMonths(l.accident_date, f.accident_within_months, opts.nowMs)) {
    return fail(REASON.FILTER_ACCIDENT_DATE);
  }
  if (!passesListFilter(f.zips, l.zip)) return fail(REASON.FILTER_ZIP);
  if (!passesListFilter(f.counties, l.county)) return fail(REASON.FILTER_COUNTY);
  if (!passesListFilter(f.verticals, l.vertical)) return fail(REASON.FILTER_VERTICAL);
  if (!passesListFilter(f.brands, l.brand)) return fail(REASON.FILTER_BRAND);
  if (!passesListFilter(f.suppliers, l.supplier)) return fail(REASON.FILTER_SUPPLIER);
  if (!passesListFilter(f.sources, l.source)) return fail(REASON.FILTER_SOURCE);

  // Per-destination required fields: the buyer will not accept a lead missing
  // any of these, so gate before spending an attempt on it.
  if (Array.isArray(f.required_fields) && f.required_fields.length > 0
    && missingRequiredFields(l, f.required_fields).length > 0) {
    return fail(REASON.MISSING_REQUIRED_FIELDS);
  }

  // 4. buyer-specific qualification rules (condition tree). Optional injected
  // evaluator keeps this module free of a hard import cycle; when a member
  // carries `conditions`, the caller passes opts.evalConditions.
  if (m.conditions && typeof opts.evalConditions === 'function') {
    if (!opts.evalConditions(m.conditions, l)) return fail(REASON.QUALIFICATION_FAILED);
  }

  // 5. suppression.
  if (Array.isArray(m.suppression) && matchesSuppression(m.suppression, l)) {
    return fail(REASON.SUPPRESSED);
  }

  // 6. caps.
  const cap = exhaustedCap(m.caps);
  if (cap) return fail(cap);

  // 7. financial eligibility.
  const price = resolvePrice(m);
  // Balance gating is OPT-IN. The snapshot sets enforce:false when the buyer has
  // no explicit credit_limit, and such a buyer is never blocked on money here.
  // An absent enforce flag (direct callers, simulator fixtures) still gates, so
  // this narrows nothing that was previously configured deliberately.
  const wallet = m.wallet;
  if (wallet && wallet.enforce !== false) {
    if (wallet.mode === 'prepaid' && Number(wallet.balance || 0) < price) {
      return fail(REASON.LOW_BALANCE);
    }
    if (wallet.mode === 'postpaid') {
      const projected = Number(wallet.outstanding || 0) + price;
      if (wallet.creditLimit != null && projected > Number(wallet.creditLimit)) {
        return fail(REASON.OVER_CREDIT_LIMIT);
      }
    }
  }

  // 8. destination health (circuit breaker).
  if (m.health && m.health.state === 'open') return fail(REASON.DESTINATION_UNHEALTHY);

  // 9. auction reserve (only meaningful for auction groups).
  if (opts.enforceReserve && m.reservePrice != null && price < Number(m.reservePrice)) {
    return fail(REASON.BELOW_RESERVE);
  }

  return { eligible: true, reason: REASON.ELIGIBLE };
}

function fail(reason) { return { eligible: false, reason }; }

function matchesSuppression(list, lead) {
  const email = String(lead.email || '').trim().toLowerCase();
  const phone = String(lead.mobile || lead.phone || '').replace(/\D/g, '');
  return list.some((s) => {
    const v = String(s || '').trim().toLowerCase();
    return (email && v === email) || (phone && v.replace(/\D/g, '') === phone);
  });
}

export function resolvePrice(member) {
  const m = member || {};
  if (m.priceMode === 'auction' && m.bid != null) return Number(m.bid);
  if (m.price != null) return Number(m.price);
  if (m.fixedPrice != null) return Number(m.fixedPrice);
  return 0;
}

// --- Deterministic selection methods (operate on already-eligible members) ---

export function selectPriority(members) {
  if (!members.length) return null;
  return [...members].sort((a, b) =>
    (a.priority ?? Infinity) - (b.priority ?? Infinity) || String(a.id).localeCompare(String(b.id)),
  )[0];
}

// Deterministic weighted pick, seeded by a stable string (the idempotency key),
// so shadow replays and tests are reproducible.
export function selectWeighted(members, seed) {
  if (!members.length) return null;
  const weights = members.map((m) => Math.max(0, Number(m.weight ?? 1)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return selectPriority(members);
  const r = (hashToUnit(String(seed || '')) * total);
  let acc = 0;
  for (let i = 0; i < members.length; i++) {
    acc += weights[i];
    if (r < acc) return members[i];
  }
  return members[members.length - 1];
}

// Round robin is pure: given the current cursor it returns the chosen member and
// the next cursor. Ineligible members are already filtered out by the caller.
export function selectRoundRobin(members, cursor) {
  if (!members.length) return { member: null, nextCursor: cursor || 0 };
  const ordered = [...members].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const idx = ((Number(cursor) || 0) % ordered.length + ordered.length) % ordered.length;
  return { member: ordered[idx], nextCursor: (idx + 1) % ordered.length };
}

export function selectAuction(members) {
  if (!members.length) return null;
  return [...members].sort((a, b) =>
    resolvePrice(b) - resolvePrice(a) ||
    (a.priority ?? Infinity) - (b.priority ?? Infinity) ||
    String(a.id).localeCompare(String(b.id)),
  )[0];
}

export function selectHybrid(members, weights = {}) {
  if (!members.length) return null;
  const priceW = weights.price ?? 0.5;
  const prioW = weights.priority ?? 0.5;
  const prices = members.map(resolvePrice);
  const maxPrice = Math.max(1, ...prices);
  const priorities = members.map((m) => m.priority ?? 1);
  const maxPrio = Math.max(1, ...priorities);
  const scored = members.map((m, i) => ({
    m,
    // higher price is better; lower priority number is better -> invert priority
    score: priceW * (prices[i] / maxPrice) + prioW * (1 - (priorities[i] - 1) / maxPrio),
  }));
  scored.sort((a, b) => b.score - a.score || String(a.m.id).localeCompare(String(b.m.id)));
  return scored[0].m;
}

// Waterfall across ordered groups. Returns { winner, group, price, trace }.
// `rrCursors` maps groupId -> cursor for round_robin (pure; caller persists the
// returned nextCursor). Records a full candidate trace for explainability.
export function routeWaterfall(groups, lead, ctx = {}) {
  const trace = [];
  const orderedGroups = [...(groups || [])].sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
  );
  const rrOut = {};

  for (const group of orderedGroups) {
    if (group.active === false) continue;
    const evaluated = (group.members || []).map((m) => {
      const res = evaluateMember(m, lead, {
        enforceReserve: group.method === 'auction',
        evalConditions: ctx.evalConditions,
        nowMs: ctx.nowMs,
      });
      return { memberId: m.id, eligible: res.eligible, reason: res.reason, price: resolvePrice(m) };
    });
    trace.push({ groupId: group.id, method: group.method, candidates: evaluated });

    const eligible = (group.members || []).filter(
      (m) => evaluated.find((e) => e.memberId === m.id)?.eligible,
    );
    if (!eligible.length) continue;

    let winner = null;
    switch (group.method) {
      case 'weighted':
        winner = selectWeighted(eligible, ctx.idempotencyKey);
        break;
      case 'round_robin': {
        const rr = selectRoundRobin(eligible, (ctx.rrCursors || {})[group.id]);
        winner = rr.member;
        rrOut[group.id] = rr.nextCursor;
        break;
      }
      case 'auction':
        winner = selectAuction(eligible);
        break;
      case 'hybrid':
        winner = selectHybrid(eligible, group.weights);
        break;
      case 'priority':
      default:
        winner = selectPriority(eligible);
    }

    if (winner) {
      return {
        winner,
        groupId: group.id,
        method: group.method,
        configHash: group.configHash || null,
        price: resolvePrice(winner),
        fallthroughPath: orderedGroups.slice(0, orderedGroups.indexOf(group)).map((g) => g.id),
        rrCursors: rrOut,
        trace,
      };
    }
  }

  return { winner: null, reason: REASON.NO_ELIGIBLE_MEMBER, rrCursors: rrOut, trace };
}

// --- Cap window start (UTC-based; tz offset in minutes optional) ---
// Returns an ISO string for the start of the given window containing `nowMs`.
export function capWindowStart(nowMs, window, tzOffsetMinutes = 0) {
  const local = new Date(nowMs + tzOffsetMinutes * 60000);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const d = local.getUTCDate();
  let startLocalMs;
  switch (window) {
    case 'hourly':
      startLocalMs = Date.UTC(y, mo, d, local.getUTCHours());
      break;
    case 'weekly': {
      const dow = local.getUTCDay(); // 0=Sun
      startLocalMs = Date.UTC(y, mo, d) - dow * 86400000;
      break;
    }
    case 'monthly':
      startLocalMs = Date.UTC(y, mo, 1);
      break;
    case 'daily':
    default:
      startLocalMs = Date.UTC(y, mo, d);
  }
  return new Date(startLocalMs - tzOffsetMinutes * 60000).toISOString();
}

// --- Idempotency key (async, Web Crypto). Stable for identical inputs. ---
export async function idempotencyKey({ supplierKeyId, dedupFields = {}, campaignId = '' }) {
  const keys = Object.keys(dedupFields).sort();
  const stable = keys.map((k) => `${k}=${String(dedupFields[k]).trim().toLowerCase()}`).join('&');
  const material = `${supplierKeyId || ''}:${stable}:${campaignId}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Redaction for logs/traces. Deep-clones and masks secret-ish keys. ---
const DEFAULT_SECRET_KEYS = [
  'authorization', 'api_key', 'apikey', 'x-api-key', 'password', 'secret',
  'token', 'bearer', 'stripe', 'card', 'cvv', 'ssn',
];
export function redact(obj, secretKeys = DEFAULT_SECRET_KEYS) {
  const keys = secretKeys.map((k) => k.toLowerCase());
  const seen = new WeakSet();
  const walk = (v) => {
    if (v == null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[circular]';
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = keys.some((s) => k.toLowerCase().includes(s)) ? '[redacted]' : walk(val);
    }
    return out;
  };
  return walk(obj);
}

// FNV-1a based stable hash -> unit float in [0,1). Deterministic across runtimes.
function hashToUnit(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1000000) / 1000000;
}
