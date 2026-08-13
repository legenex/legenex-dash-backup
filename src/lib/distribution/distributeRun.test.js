// Live distribution orchestrator tests. Covers the behaviours that make the
// difference between a safe cutover and a double-sold or lost lead:
// accept stops the waterfall, reject falls through, cap reservation is released
// on failure and finalized on sale, ambiguous timeouts never report clean, and
// the wallet is only debited when the buyer actually runs on a balance.

import { describe, it, expect, beforeEach } from 'vitest';
import { runDistribution, capScopesFor, RUN } from './distributeRun.js';
import { makeInMemoryCasStore } from './capStore.js';
import { makeInMemoryAttemptStore } from './deliveryStore.js';

const NOW = Date.parse('2026-08-12T15:00:00Z');

function member(id, over = {}) {
  return {
    id,
    buyerId: over.buyerId || `buyer-${id}`,
    active: true,
    priority: over.priority ?? 1,
    weight: 1,
    priceMode: 'fixed',
    fixedPrice: over.price ?? 50,
    price: over.price ?? 50,
    filters: {},
    conditions: null,
    caps: over.caps || {},
    buyer: { status: 'active', active: true },
    wallet: over.wallet ?? null,
    health: { state: 'closed' },
    delivery: over.delivery ?? {
      subDeliveryId: `sd-${id}`, targetUrl: `https://buyer-${id}.test/api`, method: 'POST',
      encoding: 'json', headers: {}, credentialRef: null,
      fieldMap: [{ src: 'email', dest: 'email' }],
      // requireAccept mirrors the production rule: a bare 2xx is NOT a sale unless
      // the buyer's accept pattern matches, so a polite 200 never books revenue.
      responseMapping: { acceptRe: 'accepted', revenuePath: 'price', requireAccept: true }, timeoutMs: 5000,
    },
    subDeliveryId: `sd-${id}`,
    destinationId: null,
    ...over.raw,
  };
}

function snapshotOf(members) {
  return { groups: [{ id: 'g1', method: 'priority', active: true, orderIndex: 0, members }], configHash: 'abc123', configErrors: [] };
}

// Minimal db double: only RouteDecisionTrace is written by the orchestrator.
function makeDb() {
  const traces = [];
  return { traces, entities: { RouteDecisionTrace: { create: async (r) => { traces.push(r); return r; } } } };
}

// Scripted fetch keyed by hostname substring.
function makeFetch(script) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const key = Object.keys(script).find((k) => String(url).includes(k));
    const r = script[key];
    if (!r) throw new Error('unscripted url ' + url);
    if (r.throw) { const e = new Error(r.throw); e.name = r.name || 'Error'; throw e; }
    return { status: r.status, text: async () => r.body };
  };
  return { fetchImpl, calls };
}

function ctxFor(members, script, over = {}) {
  const { fetchImpl, calls } = makeFetch(script);
  const capStore = makeInMemoryCasStore();
  const attemptStore = makeInMemoryAttemptStore();
  return {
    calls, capStore, attemptStore,
    ctx: {
      leadId: 'lead-1', campaignId: 'camp-1', idempotencyKey: 'idem-1',
      leadData: { email: 'a@b.com', state: 'TX' }, nowMs: NOW, distributionMode: 'new_only',
      fetchImpl, snapshot: snapshotOf(members),
      stores: { capStore, attemptStore, walletStore: over.walletStore || null },
      ...over.ctx,
    },
  };
}

describe('capScopesFor', () => {
  it('produces one bucketed scope per limited window and skips unlimited ones', () => {
    const scopes = capScopesFor(member('m1', { caps: { daily: { limit: 10, count: 0 }, hourly: {}, total: { limit: 100 } } }), NOW);
    const windows = scopes.map((s) => s.window).sort();
    expect(windows).toEqual(['daily', 'total']);
    expect(scopes.find((s) => s.window === 'daily').key).toContain('route_member:m1:daily:');
    expect(scopes.find((s) => s.window === 'total').key).toBe('route_member:m1:total:all');
  });
});

describe('runDistribution', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('sells to the first accepting destination and stops', async () => {
    const members = [member('m1', { priority: 1 }), member('m2', { priority: 2 })];
    const { ctx, calls } = ctxFor(members, {
      'buyer-m1': { status: 200, body: '{"result":"accepted","price":55}' },
      'buyer-m2': { status: 200, body: '{"result":"accepted","price":40}' },
    });
    const out = await runDistribution(db, ctx);
    expect(out.status).toBe(RUN.ACCEPTED);
    expect(out.winnerMemberId).toBe('m1');
    expect(out.revenue).toBe(55);
    expect(calls.length).toBe(1); // m2 was never contacted
  });

  it('falls through to the next destination on rejection', async () => {
    const members = [member('m1', { priority: 1 }), member('m2', { priority: 2 })];
    const { ctx, calls } = ctxFor(members, {
      'buyer-m1': { status: 200, body: '{"result":"no thanks"}' },
      'buyer-m2': { status: 200, body: '{"result":"accepted","price":42}' },
    });
    const out = await runDistribution(db, ctx);
    expect(out.status).toBe(RUN.ACCEPTED);
    expect(out.winnerMemberId).toBe('m2');
    expect(calls.length).toBe(2);
  });

  it('returns no_eligible_member when every member is ineligible, and posts nothing', async () => {
    const m = member('m1');
    m.buyer = { status: 'paused', active: false };
    const { ctx, calls } = ctxFor([m], {});
    const out = await runDistribution(db, ctx);
    expect(out.status).toBe(RUN.NO_ELIGIBLE);
    expect(calls.length).toBe(0);
  });

  it('holds cap on a sale and releases it on a rejection', async () => {
    const caps = { daily: { limit: 1, count: 0 } };
    const sold = ctxFor([member('m1', { caps })], { 'buyer-m1': { status: 200, body: '{"result":"accepted","price":10}' } });
    await runDistribution(db, sold.ctx);
    const soldKey = capScopesFor(member('m1', { caps }), NOW)[0].key;
    expect(await sold.capStore.getCount(soldKey)).toBe(1); // consumed

    const rejected = ctxFor([member('m2', { caps })], { 'buyer-m2': { status: 200, body: '{"result":"nope"}' } });
    await runDistribution(db, rejected.ctx);
    const rejKey = capScopesFor(member('m2', { caps }), NOW)[0].key;
    expect(await rejected.capStore.getCount(rejKey)).toBe(0); // given back
  });

  it('skips a destination whose cap is already exhausted', async () => {
    const caps = { daily: { limit: 1, count: 0 } };
    const { ctx, capStore, calls } = ctxFor(
      [member('m1', { caps, priority: 1 }), member('m2', { priority: 2 })],
      { 'buyer-m2': { status: 200, body: '{"result":"accepted","price":9}' } },
    );
    await capStore.incrementIfBelow(capScopesFor(member('m1', { caps }), NOW)[0].key, 1); // fill it
    const out = await runDistribution(db, ctx);
    expect(out.winnerMemberId).toBe('m2');
    expect(calls.some((u) => String(u).includes('buyer-m1'))).toBe(false);
  });

  it('reports a timeout as ambiguous, never as a clean failure', async () => {
    const { ctx } = ctxFor([member('m1')], { 'buyer-m1': { throw: 'aborted', name: 'AbortError' } });
    const out = await runDistribution(db, ctx);
    expect(out.status).toBe(RUN.AMBIGUOUS);
  });

  it('debits the wallet only for a balance-run buyer, and never for an invoiced one', async () => {
    const debits = [];
    const walletStore = {
      claimTxn: async () => true,
      getBalance: async () => ({ balance: 1000, version: 0 }),
      casAdjustBalance: async () => true,
      appendTxn: async (t) => { debits.push(t); return { ...t, id: 't1' }; },
      awaitTxnByKey: async () => null,
    };
    const prepaid = ctxFor([member('m1', { wallet: { mode: 'prepaid', balance: 1000, minBalance: 0 } })],
      { 'buyer-m1': { status: 200, body: '{"result":"accepted","price":50}' } }, { walletStore });
    await runDistribution(db, prepaid.ctx);
    expect(debits.length).toBe(1);
    expect(debits[0].amount).toBe(50);

    debits.length = 0;
    const invoiced = ctxFor([member('m2', { wallet: { mode: 'postpaid', outstanding: 0, creditLimit: null } })],
      { 'buyer-m2': { status: 200, body: '{"result":"accepted","price":50}' } }, { walletStore });
    await runDistribution(db, invoiced.ctx);
    expect(debits.length).toBe(0); // invoiced buyers are billed downstream, never gated here
  });

  it('writes exactly one decision trace carrying the winner and the candidate list', async () => {
    const { ctx } = ctxFor([member('m1')], { 'buyer-m1': { status: 200, body: '{"result":"accepted","price":25}' } });
    await runDistribution(db, ctx);
    expect(db.traces.length).toBe(1);
    expect(db.traces[0].result).toBe(RUN.ACCEPTED);
    expect(db.traces[0].winner_member_id).toBe('m1');
    expect(JSON.parse(db.traces[0].evaluated_candidates)).toHaveLength(1);
  });

  it('never throws and never reports delivered when the snapshot load fails', async () => {
    const brokenDb = makeDb();
    const out = await runDistribution(brokenDb, {
      leadId: 'lead-9', campaignId: 'c', idempotencyKey: 'k', leadData: {}, nowMs: NOW,
      distributionMode: 'new_only',
      snapshot: null,
    });
    expect(out.ran).toBe(false);
    expect([RUN.ERROR_CLEAN, RUN.NO_ELIGIBLE]).toContain(out.status);
  });
});
