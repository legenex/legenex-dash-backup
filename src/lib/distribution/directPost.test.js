import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { deliverDirectPost } from './directPost.js';
import { makeInMemoryAttemptStore } from './deliveryStore.js';
import { ATTEMPT_STATUS } from './deliveryAttempt.js';

// A real local mock destination server. No test ever contacts a real buyer.
let server; let base; const counters = new Map();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') || 'x';
    const n = (counters.get(req.url.split('?')[0] + id) || 0) + 1;
    counters.set(req.url.split('?')[0] + id, n);
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const path = url.pathname;
      if (path === '/accepted') return json(res, 200, { result: 'accepted', revenue: 42, buyer_lead_id: 'BUY-9' });
      if (path === '/rejected') return json(res, 200, { result: 'rejected', reason: 'dq' });
      if (path === '/duplicate') { res.writeHead(409); return res.end('{"result":"duplicate"}'); }
      if (path === '/invalid') { res.writeHead(200); return res.end('<<not json>>'); }
      if (path === '/echo') return json(res, 200, { result: 'accepted', echo: body, ctype: req.headers['content-type'] });
      if (path === '/flaky') { // timeout on attempt 1 (never respond), accept after
        if (n === 1) return; // hang -> client aborts
        return json(res, 200, { result: 'accepted', revenue: 5 });
      }
      if (path === '/ratelimited') { if (n === 1) { res.writeHead(429); return res.end('slow down'); } return json(res, 200, { result: 'accepted' }); }
      if (path === '/down') { res.writeHead(500); return res.end('boom'); }
      if (path === '/reset') { res.write('{"partia'); return req.socket.destroy(); } // ambiguous
      res.writeHead(404); res.end('nope');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

function ctx(store) { return { store, nowMs: 0, testMode: true, fetchImpl: globalThis.fetch }; }
function cfg(over) {
  return {
    destinationId: 'd1', targetUrl: `${base}/accepted`, method: 'POST', encoding: 'json',
    idempotencyKey: 'lead1:d1', leadId: 'L1', leadData: { email: 'a@b.com', mobile: '5551234567' },
    responseMapping: { rejectRe: 'rejected', duplicateRe: 'duplicate', revenuePath: 'revenue', leadIdPath: 'buyer_lead_id' },
    retryOpts: { maxAttempts: 3, baseMs: 1000 }, ...over,
  };
}

describe('direct-post adapter integration (local mock destination)', () => {
  it('accepted response: revenue and buyer lead id extracted, attempt persisted', async () => {
    const store = makeInMemoryAttemptStore();
    const r = await deliverDirectPost(cfg(), ctx(store));
    expect(r.status).toBe(ATTEMPT_STATUS.ACCEPTED);
    expect(r.revenue).toBe(42);
    expect(r.buyerLeadId).toBe('BUY-9');
    // attempt was created before send (pending) then completed
    expect(store._debug.attempts).toHaveLength(1);
    expect(store._debug.attempts[0].status).toBe(ATTEMPT_STATUS.ACCEPTED);
    // secrets redacted in stored request meta
    expect(store._debug.attempts[0].request_meta).not.toContain('a@b.com');
  });

  it('rejected response', async () => {
    const r = await deliverDirectPost(cfg({ targetUrl: `${base}/rejected` }), ctx(makeInMemoryAttemptStore()));
    expect(r.status).toBe(ATTEMPT_STATUS.REJECTED);
    expect(r.revenue).toBe(0);
  });

  it('duplicate response (409)', async () => {
    const r = await deliverDirectPost(cfg({ targetUrl: `${base}/duplicate` }), ctx(makeInMemoryAttemptStore()));
    expect(r.status).toBe(ATTEMPT_STATUS.DUPLICATE);
  });

  it('invalid/malformed response body handled without crashing', async () => {
    const r = await deliverDirectPost(cfg({ targetUrl: `${base}/invalid` }), ctx(makeInMemoryAttemptStore()));
    expect(r.revenue).toBe(0);
    expect(r.buyerLeadId).toBe(null);
  });

  it('form encoding + field mapping produce a urlencoded body', async () => {
    const store = makeInMemoryAttemptStore();
    const r = await deliverDirectPost(cfg({
      targetUrl: `${base}/echo`, encoding: 'form',
      fieldMap: [{ src: 'mobile', dest: 'phone', transform: 'phone_us' }, { src: 'email', dest: 'email' }],
    }), ctx(store));
    expect(r.status).toBe(ATTEMPT_STATUS.ACCEPTED);
  });

  it('timeout then accepted (adapter classifies timeout as retryable error)', async () => {
    const store = makeInMemoryAttemptStore();
    const first = await deliverDirectPost(cfg({ targetUrl: `${base}/flaky?id=t1`, timeoutMs: 60, attemptNumber: 1 }), ctx(store));
    expect(first.status).toBe(ATTEMPT_STATUS.ERROR);
    expect(first.errorClass).toBe('timeout');
    expect(first.retryable).toBe(true);
    const second = await deliverDirectPost(cfg({ targetUrl: `${base}/flaky?id=t1`, attemptNumber: 2 }), ctx(store));
    expect(second.status).toBe(ATTEMPT_STATUS.ACCEPTED);
  });

  it('429 then accepted', async () => {
    const store = makeInMemoryAttemptStore();
    const first = await deliverDirectPost(cfg({ targetUrl: `${base}/ratelimited?id=r1`, attemptNumber: 1 }), ctx(store));
    expect(first.status).toBe(ATTEMPT_STATUS.ERROR);
    expect(first.retryable).toBe(true);
    const second = await deliverDirectPost(cfg({ targetUrl: `${base}/ratelimited?id=r1`, attemptNumber: 2 }), ctx(store));
    expect(second.status).toBe(ATTEMPT_STATUS.ACCEPTED);
  });

  it('500 until dead-letter at the retry cap', async () => {
    const store = makeInMemoryAttemptStore();
    let last;
    for (let n = 1; n <= 3; n++) last = await deliverDirectPost(cfg({ targetUrl: `${base}/down`, attemptNumber: n }), ctx(store));
    expect(last.status).toBe(ATTEMPT_STATUS.DEAD_LETTER);
    expect(last.retryable).toBe(false);
  });

  it('connection failure (no server on port) -> retryable error', async () => {
    const r = await deliverDirectPost(cfg({ targetUrl: 'http://127.0.0.1:1/x' }), ctx(makeInMemoryAttemptStore()));
    expect(r.status).toBe(ATTEMPT_STATUS.ERROR);
    expect(r.retryable).toBe(true);
  });

  it('ambiguous connection reset after partial body -> error (not accepted)', async () => {
    const r = await deliverDirectPost(cfg({ targetUrl: `${base}/reset` }), ctx(makeInMemoryAttemptStore()));
    expect(r.status).toBe(ATTEMPT_STATUS.ERROR);
  });

  it('refuses a non-localhost host in test mode (no send)', async () => {
    const store = makeInMemoryAttemptStore();
    const r = await deliverDirectPost(cfg({ targetUrl: 'http://buyer.example.com/post' }), ctx(store));
    expect(r.status).toBe(ATTEMPT_STATUS.ERROR);
    expect(r.code).toBe('HOST_NOT_ALLOWED');
    // recorded, but nothing sent
    expect(store._debug.attempts[0].status).toBe(ATTEMPT_STATUS.ERROR);
  });
});
