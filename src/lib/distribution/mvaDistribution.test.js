// Controlled MVA distribution test suite.
//
// Drives the REAL routing engine + distributeLead orchestrator + direct-post
// adapter + ping/post flow + manual retry, deterministically (injected clock,
// scripted deliver, and mock fetch). Every scenario records the eight audit
// fields: input, eligible destinations, routing decision, payload sent,
// destination response, final status, expected result, actual result. The full
// record table is printed once at the end.

import { describe, it, expect, afterAll } from 'vitest';
import { distributeLead } from './distribute.js';
import { deliverDirectPost } from './directPost.js';
import { runPingPost } from './pingpostFlow.js';
import { manualRetry } from './retryWorker.js';
import { makeInMemoryAttemptStore } from './deliveryStore.js';
import { ATTEMPT_STATUS } from './deliveryAttempt.js';
import { REASON } from './engine.js';

// ── Fixtures ────────────────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 0, 15);            // fixed evaluation clock
const FRESH = '2026-01-05';                   // accident date within a 6-month window
const STALE = '2020-01-01';                   // accident date outside the window

const buyer = (over = {}) => ({ id: 'BUY_' + (over.id || 'x'), status: 'active', active: true, ...over });

function member(id, over = {}) {
  return {
    id,
    buyer: over.buyer || buyer({ id }),
    active: over.active !== false,
    priority: over.priority ?? 1,
    weight: over.weight ?? 1,
    filters: over.filters || {},
    caps: over.caps || {},
    withinSchedule: over.withinSchedule,
    fixedPrice: over.fixedPrice ?? 25,
    reservePrice: over.reservePrice,
    wallet: over.wallet,
    health: over.health,
    conditions: over.conditions,
    _dest: over._dest,
  };
}

const group = (method, members, over = {}) => ({
  id: over.id || 'GRP_' + method,
  method,
  active: over.active !== false,
  order_index: over.order_index ?? 0,
  price_weight: over.price_weight,
  priority_weight: over.priority_weight,
  members,
});

const mvaLead = (over = {}) => ({ state: 'TX', lead_type: 'mva', accident_date: FRESH, email: 'a@b.com', mobile: '15125550100', ...over });

// Scripted deliver: look up a per-member response (optionally a function of meta).
function scripted(map) {
  return async (m, meta) => {
    const s = map[m.id];
    const r = (typeof s === 'function' ? s(meta) : s) || { status: ATTEMPT_STATUS.REJECTED };
    return {
      status: r.status, revenue: r.revenue ?? 0, httpStatus: r.httpStatus ?? null,
      errorClass: r.errorClass ?? null, retryable: r.retryable ?? false,
      payload: r.payload ?? { to: m.id, email: meta.lead.email }, response: r.response ?? r.status,
    };
  };
}

// Mock fetch: match by URL substring. A handler may return 'hang' to simulate a
// timeout (rejects only when the abort signal fires).
const httpRes = (status, body) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
function mockFetch(routes) {
  return (url, opts) => {
    for (const key of Object.keys(routes)) {
      if (String(url).includes(key)) {
        const out = routes[key](opts, url);
        if (out === 'hang') {
          return new Promise((_res, rej) => {
            opts.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          });
        }
        return Promise.resolve(out);
      }
    }
    return Promise.resolve(httpRes(404, 'no route'));
  };
}

// Real direct-post deliver wired to the adapter, using each member's _dest config.
function realDeliver(fetchImpl, over = {}) {
  return async (m, meta) => {
    const store = makeInMemoryAttemptStore();
    const d = m._dest || {};
    const out = await deliverDirectPost({
      subDeliveryId: m.id, destinationId: m.id, targetUrl: d.targetUrl || 'http://localhost/accept',
      method: 'POST', encoding: 'json', headers: {},
      fieldMap: d.fieldMap || [{ src: 'email', dest: 'email' }, { src: 'state', dest: 'state' }, { src: 'lead_type', dest: 'lead_type' }],
      timeoutMs: d.timeoutMs || 40, responseMapping: d.responseMapping || {},
      idempotencyKey: `${m.id}:${meta.attemptNumber}`, leadData: meta.lead, leadId: 'LEAD1',
      attemptNumber: meta.attemptNumber, isPrimary: true, trigger: 'primary',
    }, { store, nowMs: NOW, fetchImpl, testMode: true, allowlistHosts: over.hosts || [] });
    return { status: out.status, revenue: out.revenue, httpStatus: out.httpStatus, errorClass: out.errorClass, retryable: out.retryable, payload: { url: d.targetUrl }, response: out.status };
  };
}

// ── Recording ───────────────────────────────────────────────────────────────
const records = [];
function logResult(name, { input, result, expected, actual, ping }) {
  const eligible = result ? result.candidates.filter((c) => c.eligible).map((c) => c.member_id) : (ping?.eligible || []);
  const decision = result
    ? (result.finalStatus === 'Sold' || result.finalStatus === 'Duplicate' || result.finalStatus === 'Exhausted'
        ? `order: ${result.ordered.join(' > ') || '(none)'}${result.winner ? `, winner ${result.winner}` : ''}`
        : `${result.finalStatus}: ${result.reason}`)
    : (ping?.decision || '');
  const attempts = result ? result.attempts : (ping?.attempts || []);
  records.push({
    test: name,
    input: JSON.stringify(input),
    eligible_destinations: eligible.join(', ') || '(none)',
    routing_decision: decision,
    payload_sent: JSON.stringify(attempts.map((a) => a.payload).filter(Boolean)[0] || (ping?.pingFields ? { ping_fields: ping.pingFields } : null)),
    destination_response: JSON.stringify(attempts.map((a) => ({ member: a.member_id, status: a.status, http: a.http_status, err: a.error_class })) ),
    final_status: actual,
    expected,
    actual,
    pass: expected === actual,
  });
}

afterAll(() => {
  // Emit the full audit table once so every scenario's record is captured.
  console.log('\n=== MVA distribution controlled test records ===\n' + JSON.stringify(records, null, 2));
  const failed = records.filter((r) => !r.pass);
  expect(failed, `all recorded scenarios must match expected: ${failed.map((f) => f.test).join(', ')}`).toHaveLength(0);
});

const base = (over) => ({ nowMs: NOW, seed: { key: 'seed-1' }, ...over });

// ── Scenarios ─────────────────────────────────────────────────────────────
describe('MVA distribution workflow', () => {
  it('1. eligible lead accepted by the first destination', async () => {
    const m1 = member('D1', { priority: 1, fixedPrice: 40 });
    const m2 = member('D2', { priority: 2 });
    const input = mvaLead();
    const result = await distributeLead(base({
      campaign: { active: true }, groups: [group('priority', [m1, m2])], lead: input,
      deliver: scripted({ D1: { status: ATTEMPT_STATUS.ACCEPTED, revenue: 40 } }),
    }));
    expect(result.finalStatus).toBe('Sold');
    expect(result.winner).toBe('D1');
    expect(result.revenue).toBe(40);
    logResult('1 accepted by first destination', { input, result, expected: 'Sold', actual: result.finalStatus });
  });

  it('2. state not accepted', async () => {
    const m1 = member('D1', { filters: { states: ['CA'] } });
    const input = mvaLead({ state: 'TX' });
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.FILTER_STATE);
    logResult('2 state not accepted', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('3. lead type not accepted', async () => {
    const m1 = member('D1', { filters: { lead_types: ['mva'] } });
    const input = mvaLead({ lead_type: 'slip_fall' });
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.FILTER_LEAD_TYPE);
    logResult('3 lead type not accepted', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('4. destination paused', async () => {
    const m1 = member('D1', { active: false });
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.MEMBER_INACTIVE);
    logResult('4 destination paused', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('5. buyer paused', async () => {
    const m1 = member('D1', { buyer: buyer({ id: 'D1', status: 'paused', active: false }) });
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
    logResult('5 buyer paused', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('6. campaign paused', async () => {
    const m1 = member('D1');
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: false }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('CampaignInactive');
    expect(result.campaign_eligible).toBe(false);
    logResult('6 campaign paused', { input, result, expected: 'CampaignInactive', actual: result.finalStatus });
  });

  it('7. daily cap reached', async () => {
    const m1 = member('D1', { caps: { daily: { limit: 10, count: 10 } } });
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.CAP_DAILY);
    logResult('7 daily cap reached', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('8. monthly cap reached', async () => {
    const m1 = member('D1', { caps: { monthly: { limit: 100, count: 100 } } });
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.CAP_MONTHLY);
    logResult('8 monthly cap reached', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('9. outside operating hours', async () => {
    const m1 = member('D1', { withinSchedule: false });
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.OUTSIDE_SCHEDULE);
    logResult('9 outside operating hours', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('10. missing required field', async () => {
    const m1 = member('D1', { filters: { required_fields: ['tcpa_text'] } });
    const input = mvaLead(); // no tcpa_text
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.MISSING_REQUIRED_FIELDS);
    logResult('10 missing required field', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('11. duplicate lead', async () => {
    const m1 = member('D1');
    const m2 = member('D2', { priority: 2 });
    const input = mvaLead();
    const result = await distributeLead(base({
      campaign: { active: true }, groups: [group('priority', [m1, m2])], lead: input,
      deliver: scripted({ D1: { status: ATTEMPT_STATUS.DUPLICATE } }),
    }));
    expect(result.finalStatus).toBe('Duplicate');
    expect(result.attempts).toHaveLength(1); // terminal: does not try D2
    logResult('11 duplicate lead', { input, result, expected: 'Duplicate', actual: result.finalStatus });
  });

  it('12. destination timeout (retry then next destination)', async () => {
    // Real adapter proves timeout classification.
    const hangDeliver = realDeliver(mockFetch({ '/slow': () => 'hang' }));
    const solo = await hangDeliver(member('T', { _dest: { targetUrl: 'http://localhost/slow', timeoutMs: 30 } }), { attemptNumber: 1, lead: mvaLead() });
    expect(solo.status).toBe(ATTEMPT_STATUS.ERROR);
    expect(solo.errorClass).toBe('timeout');

    // Orchestrated: D1 times out on both attempts (retry permitted), then D2 accepts.
    let d1Calls = 0;
    const input = mvaLead();
    const result = await distributeLead(base({
      campaign: { active: true }, groups: [group('priority', [member('D1', { priority: 1 }), member('D2', { priority: 2 })])], lead: input,
      maxAttemptsPerDest: 2,
      deliver: scripted({
        D1: () => { d1Calls += 1; return { status: ATTEMPT_STATUS.ERROR, errorClass: 'timeout', retryable: true }; },
        D2: { status: ATTEMPT_STATUS.ACCEPTED, revenue: 30 },
      }),
    }));
    expect(d1Calls).toBe(2);         // retried the same destination once
    expect(result.winner).toBe('D2'); // then routed to the next destination
    expect(result.finalStatus).toBe('Sold');
    logResult('12 destination timeout then retry/next', { input, result, expected: 'Sold', actual: result.finalStatus });
  });

  it('13. HTTP error', async () => {
    const fetchImpl = mockFetch({ '/err': () => httpRes(500, 'server error') });
    const m1 = member('D1', { _dest: { targetUrl: 'http://localhost/err' } });
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: realDeliver(fetchImpl) }));
    expect(result.attempts[0].status).toBe(ATTEMPT_STATUS.ERROR);
    expect(result.attempts[0].http_status).toBe(500);
    expect(result.finalStatus).toBe('Exhausted');
    logResult('13 HTTP error', { input, result, expected: 'Exhausted', actual: result.finalStatus });
  });

  it('14. invalid response (requireAccept)', async () => {
    const fetchImpl = mockFetch({ '/ok200': () => httpRes(200, 'garbled-not-json') });
    const m1 = member('D1', { _dest: { targetUrl: 'http://localhost/ok200', responseMapping: { acceptRe: '"accepted":true', requireAccept: true } } });
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('priority', [m1])], lead: input, deliver: realDeliver(fetchImpl) }));
    expect(result.attempts[0].status).toBe(ATTEMPT_STATUS.REJECTED); // 200 but did not confirm acceptance
    expect(result.finalStatus).toBe('Exhausted');
    logResult('14 invalid response requireAccept', { input, result, expected: 'Exhausted', actual: result.finalStatus });
  });

  it('15. lead rejected and sent to the next destination', async () => {
    const m1 = member('D1', { priority: 1 });
    const m2 = member('D2', { priority: 2, fixedPrice: 35 });
    const input = mvaLead();
    const result = await distributeLead(base({
      campaign: { active: true }, groups: [group('priority', [m1, m2])], lead: input,
      deliver: scripted({ D1: { status: ATTEMPT_STATUS.REJECTED }, D2: { status: ATTEMPT_STATUS.ACCEPTED, revenue: 35 } }),
    }));
    expect(result.attempts.map((a) => a.member_id)).toEqual(['D1', 'D2']);
    expect(result.winner).toBe('D2');
    expect(result.finalStatus).toBe('Sold');
    logResult('15 rejected then next destination', { input, result, expected: 'Sold', actual: result.finalStatus });
  });

  it('16. all destinations exhausted', async () => {
    const m1 = member('D1', { priority: 1 });
    const m2 = member('D2', { priority: 2 });
    const input = mvaLead();
    const result = await distributeLead(base({
      campaign: { active: true }, groups: [group('priority', [m1, m2])], lead: input,
      deliver: scripted({ D1: { status: ATTEMPT_STATUS.REJECTED }, D2: { status: ATTEMPT_STATUS.REJECTED } }),
    }));
    expect(result.attempts).toHaveLength(2);
    expect(result.finalStatus).toBe('Exhausted');
    logResult('16 all destinations exhausted', { input, result, expected: 'Exhausted', actual: result.finalStatus });
  });

  it('17. successful ping followed by post', async () => {
    const fetchImpl = mockFetch({
      '/ping': () => httpRes(200, { bid: 50, bid_id: 'b-1', expires_at_ms: NOW + 600000 }),
      '/post': () => httpRes(200, { accepted: true, revenue: 50 }),
    });
    const store = { ...makeInMemoryAttemptStore(), createBid: async (b) => ({ id: 'bid1', ...b }) };
    const cfg = {
      leadId: 'LP1', leadData: mvaLead(), idempotencyKey: 'idem-17',
      bidders: [{ memberId: 'D1', destinationId: 'D1', pingUrl: 'http://localhost/ping', postUrl: 'http://localhost/post', reservePrice: 10, timeoutMs: 50, responseMapping: { acceptRe: '"accepted":true', revenuePath: 'revenue' }, fieldMap: [{ src: 'email', dest: 'email' }] }],
    };
    const out = await runPingPost(cfg, { store, nowMs: NOW, fetchImpl, testMode: true, allowlistHosts: [] });
    expect(out.won).toBe(true);
    expect(out.winner).toBe('D1');
    logResult('17 ping then post', { input: cfg.leadData, ping: { eligible: ['D1'], decision: `ping/post winner ${out.winner} @ ${out.price}`, pingFields: out.trace.ping_payload_fields, attempts: [{ member_id: 'D1', status: 'accepted' }] }, expected: 'won', actual: out.won ? 'won' : 'lost' });
  });

  it('18. ping accepted but post rejected', async () => {
    const fetchImpl = mockFetch({
      '/ping': () => httpRes(200, { bid: 50, bid_id: 'b-2', expires_at_ms: NOW + 600000 }),
      '/post': () => httpRes(422, { accepted: false, reason: 'failed_validation' }),
    });
    const store = { ...makeInMemoryAttemptStore(), createBid: async (b) => ({ id: 'bid2', ...b }) };
    const cfg = {
      leadId: 'LP2', leadData: mvaLead(), idempotencyKey: 'idem-18',
      bidders: [{ memberId: 'D1', destinationId: 'D1', pingUrl: 'http://localhost/ping', postUrl: 'http://localhost/post', reservePrice: 10, timeoutMs: 50, responseMapping: {}, fieldMap: [{ src: 'email', dest: 'email' }] }],
    };
    const out = await runPingPost(cfg, { store, nowMs: NOW, fetchImpl, testMode: true, allowlistHosts: [] });
    expect(out.won).toBe(false);
    expect(out.reason).toBe('ALL_WINNERS_FAILED');
    logResult('18 ping ok, post rejected', { input: cfg.leadData, ping: { eligible: ['D1'], decision: `post rejected -> ${out.reason}`, pingFields: out.trace.ping_payload_fields, attempts: [{ member_id: 'D1', status: 'rejected' }] }, expected: 'lost', actual: out.won ? 'won' : 'lost' });
  });

  it('19. pricing or bid below the minimum', async () => {
    const m1 = member('D1', { fixedPrice: 20, reservePrice: 50 }); // auction enforces reserve
    const input = mvaLead();
    const result = await distributeLead(base({ campaign: { active: true }, groups: [group('auction', [m1])], lead: input, deliver: scripted({}) }));
    expect(result.finalStatus).toBe('NoEligibleDestination');
    expect(result.candidates[0].reason).toBe(REASON.BELOW_RESERVE);
    logResult('19 bid below minimum', { input, result, expected: 'NoEligibleDestination', actual: result.finalStatus });
  });

  it('20. manual resubmission', async () => {
    // A previously dead-lettered attempt is manually resubmitted by an operator and now accepts.
    const rows = [{ id: 'att-1', lead_id: 'LEAD9', destination_id: 'D1', attempt_number: 2, status: ATTEMPT_STATUS.DEAD_LETTER, lease_until: null }];
    const store = {
      async getAttempt(id) { return rows.find((r) => r.id === id) || null; },
      async claimLease(id, worker, nowMs, leaseMs) { const r = rows.find((x) => x.id === id); if (r && (!r.lease_until || r.lease_until <= nowMs)) { r.lease_until = nowMs + leaseMs; return true; } return false; },
      async updateAttempt(id, patch) { const r = rows.find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
    };
    const out = await manualRetry(store, 'att-1', async () => ({ status: ATTEMPT_STATUS.ACCEPTED }), { nowMs: NOW, workerId: 'operator' });
    expect(out.ok).toBe(true);
    expect(out.status).toBe(ATTEMPT_STATUS.ACCEPTED);
    logResult('20 manual resubmission', { input: { attempt: 'att-1' }, ping: { eligible: ['D1'], decision: 'operator manual retry', attempts: [{ member_id: 'D1', status: out.status }] }, expected: 'accepted', actual: out.status });
  });

  it('21. multiple eligible buyers with priority routing', async () => {
    const m1 = member('D1', { priority: 2, fixedPrice: 20 });
    const m2 = member('D2', { priority: 1, fixedPrice: 20 }); // lower priority number wins
    const input = mvaLead();
    const result = await distributeLead(base({
      campaign: { active: true }, groups: [group('priority', [m1, m2])], lead: input,
      deliver: scripted({ D1: { status: ATTEMPT_STATUS.ACCEPTED, revenue: 20 }, D2: { status: ATTEMPT_STATUS.ACCEPTED, revenue: 20 } }),
    }));
    expect(result.ordered).toEqual(['D2', 'D1']);
    expect(result.winner).toBe('D2');
    logResult('21 priority routing', { input, result, expected: 'Sold', actual: result.finalStatus });
  });

  it('22. multiple eligible buyers with weighted routing', async () => {
    const m1 = member('D1', { weight: 9 });
    const m2 = member('D2', { weight: 1 });
    const input = mvaLead();
    const result = await distributeLead(base({
      campaign: { active: true }, groups: [group('weighted', [m1, m2])], lead: input, seed: { key: 'seed-1' },
      deliver: scripted({ D1: { status: ATTEMPT_STATUS.ACCEPTED, revenue: 25 }, D2: { status: ATTEMPT_STATUS.ACCEPTED, revenue: 25 } }),
    }));
    expect(result.ordered.slice().sort()).toEqual(['D1', 'D2']);   // deterministic permutation of both
    expect(result.winner).toBe(result.ordered[0]);                 // wins the first ordered slot
    expect(result.finalStatus).toBe('Sold');
    logResult('22 weighted routing', { input, result, expected: 'Sold', actual: result.finalStatus });
  });
});
