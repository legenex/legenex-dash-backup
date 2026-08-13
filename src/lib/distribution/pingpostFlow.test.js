import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { runPingPost, buildPingPayload, PING_ALLOWLIST } from './pingpostFlow.js';
import { makeInMemoryAttemptStore } from './deliveryStore.js';

// Three local mock bidders on 127.0.0.1. No test contacts a real buyer.
let server; let base; const pingBodies = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const p = url.pathname;
      const amount = Number(url.searchParams.get('amount') || 0);
      const expires = url.searchParams.get('expires'); // ms epoch or 'past'
      if (p.startsWith('/ping/')) {
        pingBodies.push({ path: p, body });
        const expMs = expires === 'past' ? 1 : (expires ? Number(expires) : Date.now() + 60000);
        return json(res, 200, { bid: amount, bid_id: p.slice(6), expires_at_ms: expMs });
      }
      if (p === '/post/accept') return json(res, 200, { result: 'accepted', revenue: amount });
      if (p === '/post/reject') { res.writeHead(400); return res.end('{"result":"rejected"}'); }
      if (p === '/post/reset') { res.write('{"par'); return req.socket.destroy(); }
      res.writeHead(404); res.end('no');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

const LEAD = { state: 'TX', zip: '78701', vertical: 'legal', email: 'a@b.com', mobile: '5551234567', address: '1 Main St' };
function ctx(store) { return { store, nowMs: Date.now(), testMode: true, fetchImpl: globalThis.fetch }; }
function bidder(id, amount, over = {}) {
  return {
    memberId: id, destinationId: 'd-' + id,
    pingUrl: `${base}/ping/${id}?amount=${amount}${over.expires ? '&expires=' + over.expires : ''}`,
    postUrl: over.postUrl || `${base}/post/accept?amount=${amount}`,
    reservePrice: over.reservePrice, timeoutMs: 2000,
    responseMapping: { revenuePath: 'revenue' }, ...over,
  };
}

describe('ping-post: PII allowlist at ping stage', () => {
  it('ping payload contains only allowlisted non-PII fields', () => {
    const p = buildPingPayload(LEAD);
    expect(p).toHaveProperty('state');
    expect(p).toHaveProperty('vertical');
    expect(Object.keys(p)).not.toContain('email');
    expect(Object.keys(p)).not.toContain('mobile');
    expect(Object.keys(p)).not.toContain('address');
    expect(PING_ALLOWLIST).not.toContain('email');
  });
});

describe('ping-post full sequence (3 local mock bidders)', () => {
  it('highest eligible bid wins; full PII posted only to the winner; ping bodies carry no PII', async () => {
    pingBodies.length = 0;
    const store = makeInMemoryAttemptStore();
    const out = await runPingPost({
      leadId: 'L1', leadData: LEAD, idempotencyKey: 'L1',
      bidders: [bidder('low', 5), bidder('high', 20), bidder('mid', 12)],
    }, ctx(store));
    expect(out.won).toBe(true);
    expect(out.winner).toBe('high');
    expect(out.price).toBe(20);
    // 3 bids persisted
    expect(store._debug.bids).toHaveLength(3);
    // exactly one full post attempt (to the winner)
    expect(store._debug.attempts).toHaveLength(1);
    expect(store._debug.attempts[0].destination_id).toBe('d-high');
    // NONE of the ping bodies contain PII
    for (const pb of pingBodies) {
      expect(pb.body).not.toContain('a@b.com');
      expect(pb.body).not.toContain('5551234567');
      expect(pb.body).not.toContain('Main St');
    }
  });

  it('excludes below-reserve and expired bids', async () => {
    const store = makeInMemoryAttemptStore();
    const out = await runPingPost({
      leadId: 'L2', leadData: LEAD, idempotencyKey: 'L2',
      bidders: [
        bidder('high', 20, { reservePrice: 25 }),   // 20 < reserve 25 -> excluded
        bidder('exp', 18, { expires: 'past' }),      // expired -> excluded
        bidder('ok', 10),                            // wins
      ],
    }, ctx(store));
    expect(out.won).toBe(true);
    expect(out.winner).toBe('ok');
    expect(out.trace.excluded.map((e) => e.reason).sort()).toEqual(['BELOW_RESERVE', 'BID_EXPIRED']);
  });

  it('falls through to the next bidder when the winner post is a clean rejection', async () => {
    const store = makeInMemoryAttemptStore();
    const out = await runPingPost({
      leadId: 'L3', leadData: LEAD, idempotencyKey: 'L3',
      bidders: [
        bidder('high', 20, { postUrl: `${base}/post/reject` }), // wins bid, post rejects
        bidder('mid', 12),                                       // fall-through winner
      ],
    }, ctx(store));
    expect(out.won).toBe(true);
    expect(out.winner).toBe('mid');
    expect(out.trace.fallthrough[0].member_id).toBe('high');
  });

  it('stops for reconciliation on an ambiguous winner post (no double-send)', async () => {
    const store = makeInMemoryAttemptStore();
    const out = await runPingPost({
      leadId: 'L4', leadData: LEAD, idempotencyKey: 'L4',
      bidders: [
        bidder('high', 20, { postUrl: `${base}/post/reset` }), // ambiguous
        bidder('mid', 12),
      ],
    }, ctx(store));
    expect(out.won).toBe(false);
    expect(out.reason).toBe('AMBIGUOUS_WINNER');
    expect(out.needsReconciliation).toBe(true);
    // did NOT fall through / double-post to mid
    expect(store._debug.attempts.filter((a) => a.destination_id === 'd-mid')).toHaveLength(0);
  });

  it('returns NO_ELIGIBLE_BID when all bids are zero', async () => {
    const store = makeInMemoryAttemptStore();
    const out = await runPingPost({
      leadId: 'L5', leadData: LEAD, idempotencyKey: 'L5',
      bidders: [bidder('a', 0), bidder('b', 0)],
    }, ctx(store));
    expect(out.won).toBe(false);
    expect(out.reason).toBe('NO_ELIGIBLE_BID');
  });
});
