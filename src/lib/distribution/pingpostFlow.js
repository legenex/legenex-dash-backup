// Full ping-post sequence. At the ping stage ONLY an explicit minimal-field
// allowlist is sent (never email/phone/full address). Pings go concurrently with a
// per-destination timeout; every bid is persisted as a BidAttempt; bids are parsed
// (amount, id, expiry), filtered by reserve price and expiry, ranked with a
// deterministic tie-break; the FULL payload is posted only to the winner; a clean
// winner failure falls through to the next bidder; an ambiguous winner (the post
// may have been received) stops and flags for reconciliation rather than risking a
// double-send.

import { deliverDirectPost } from './directPost.js';
import { ATTEMPT_STATUS } from './deliveryAttempt.js';

// Minimal, non-PII fields permitted at ping stage. Allowlist, not blocklist.
export const PING_ALLOWLIST = ['state', 'zip', 'county', 'vertical', 'brand', 'supplier', 'source', 'lead_event'];

export function buildPingPayload(leadData, allowlist = PING_ALLOWLIST) {
  const out = {};
  for (const f of allowlist) if (leadData[f] !== undefined && leadData[f] !== null) out[f] = leadData[f];
  return out;
}

function getPath(obj, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// A network error is ambiguous (the buyer MIGHT have received the post) unless it
// clearly happened before the request was dispatched.
function isAmbiguous(errorClass) {
  if (!errorClass) return false;
  const e = String(errorClass).toLowerCase();
  if (e.includes('refused') || e.includes('econnrefused') || e === 'host_not_allowed' || e === 'invalid_url') return false;
  return true; // timeout, reset after send, unknown -> ambiguous
}

async function sendPing({ url, payload, headers, timeoutMs }, ctx) {
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 5000);
  try {
    const resp = await fetchImpl(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: JSON.stringify(payload), redirect: 'manual', signal: controller.signal,
    });
    const text = await resp.text();
    let json = null; try { json = JSON.parse(text); } catch { json = null; }
    return { ok: true, status: resp.status, json };
  } catch (e) {
    return { ok: false, errorClass: e && e.name === 'AbortError' ? 'timeout' : (e && e.message ? e.message.slice(0, 60) : 'network_error') };
  } finally { clearTimeout(timer); }
}

// cfg: { leadId, leadData, idempotencyKey, pingAllowlist, bidders: [{ memberId,
//   destinationId, pingUrl, postUrl, reservePrice, timeoutMs, headers, responseMapping,
//   bidMapping:{ amountPath, idPath, expiresAtPath } }] }
// ctx: { store, nowMs, fetchImpl, testMode, allowlistHosts }
export async function runPingPost(cfg, ctx) {
  const nowMs = ctx.nowMs ?? 0;
  const pingPayload = buildPingPayload(cfg.leadData || {}, cfg.pingAllowlist || PING_ALLOWLIST);
  const trace = { ping_payload_fields: Object.keys(pingPayload), bids: [], excluded: [], fallthrough: [] };

  // 1. Concurrent pings with per-destination timeout; persist every BidAttempt.
  const pinged = await Promise.all((cfg.bidders || []).map(async (b) => {
    const res = await sendPing({ url: b.pingUrl, payload: pingPayload, headers: b.headers, timeoutMs: b.timeoutMs }, ctx);
    const bm = b.bidMapping || { amountPath: 'bid', idPath: 'bid_id', expiresAtPath: 'expires_at_ms' };
    const amount = res.ok ? Number(getPath(res.json, bm.amountPath)) || 0 : 0;
    const bidId = res.ok ? getPath(res.json, bm.idPath) ?? null : null;
    const expiresAtMs = res.ok ? Number(getPath(res.json, bm.expiresAtPath)) || null : null;
    await ctx.store.createBid({
      lead_id: cfg.leadId, route_member_id: b.memberId, destination_id: b.destinationId,
      ping_sent_at: new Date(nowMs).toISOString(), bid_amount: amount, bid_id: bidId,
      bid_expires_at: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      status: res.ok ? 'bid' : 'error',
    });
    return { bidder: b, amount, bidId, expiresAtMs, ok: res.ok };
  }));

  // 2. Filter (reserve price + expiry + a real bid) and rank (amount desc, id tie-break).
  const eligible = [];
  for (const p of pinged) {
    let reason = null;
    if (!p.ok || !(p.amount > 0)) reason = 'NO_BID';
    else if (p.expiresAtMs != null && p.expiresAtMs < nowMs) reason = 'BID_EXPIRED';
    else if (p.bidder.reservePrice != null && p.amount < Number(p.bidder.reservePrice)) reason = 'BELOW_RESERVE';
    trace.bids.push({ member_id: p.bidder.memberId, amount: p.amount, bid_id: p.bidId, eligible: !reason, reason });
    if (reason) trace.excluded.push({ member_id: p.bidder.memberId, reason });
    else eligible.push(p);
  }
  eligible.sort((a, b) => b.amount - a.amount || String(a.bidder.memberId).localeCompare(String(b.bidder.memberId)));

  if (!eligible.length) return { won: false, reason: 'NO_ELIGIBLE_BID', winner: null, postResult: null, trace };

  // 3. Post the FULL payload only to the winner; clean failure falls through;
  // ambiguous winner stops for reconciliation (never double-send).
  for (let i = 0; i < eligible.length; i++) {
    const cand = eligible[i];
    const postRes = await deliverDirectPost({
      destinationId: cand.bidder.destinationId, targetUrl: cand.bidder.postUrl, method: 'POST',
      encoding: cand.bidder.encoding || 'json', headers: cand.bidder.headers, fieldMap: cand.bidder.fieldMap,
      timeoutMs: cand.bidder.timeoutMs, responseMapping: cand.bidder.responseMapping,
      idempotencyKey: `${cfg.idempotencyKey}:${cand.bidder.memberId}`, leadData: cfg.leadData,
      leadId: cfg.leadId, attemptNumber: 1, isPrimary: true, trigger: 'pingpost_win',
    }, ctx);

    if (postRes.status === ATTEMPT_STATUS.ACCEPTED) {
      return { won: true, winner: cand.bidder.memberId, price: cand.amount, postResult: postRes, trace };
    }
    if (postRes.status === ATTEMPT_STATUS.ERROR && isAmbiguous(postRes.errorClass)) {
      trace.ambiguous = { member_id: cand.bidder.memberId, error_class: postRes.errorClass };
      return { won: false, reason: 'AMBIGUOUS_WINNER', winner: cand.bidder.memberId, postResult: postRes, needsReconciliation: true, trace };
    }
    // clean failure (rejected/duplicate/clean network refusal) -> fall through
    trace.fallthrough.push({ member_id: cand.bidder.memberId, status: postRes.status });
  }
  return { won: false, reason: 'ALL_WINNERS_FAILED', winner: null, postResult: null, trace };
}
