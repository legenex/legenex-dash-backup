import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { buildRoutingSnapshot } from './snapshot.js';
import { deliverDirectPost } from './directPost.js';
import { makeInMemoryAttemptStore } from './deliveryStore.js';
import { ATTEMPT_STATUS } from './deliveryAttempt.js';

// End-to-end routing wire-up proof: a routed member delivers via its NAMED
// sub-delivery, and two members on the SAME buyer with DIFFERENT sub-deliveries
// hit DIFFERENT endpoints with their own prices and caps. The outbound credential
// is resolved server-side at send time (never stored in the SubDelivery JSON,
// never present in the persisted attempt).
let server; let base; let hits;

beforeAll(async () => {
  hits = [];
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      hits.push({ path: new URL(req.url, 'http://localhost').pathname, auth: req.headers['authorization'] || null, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Each endpoint returns a distinct revenue so we can prove which one answered.
      const rev = req.url.startsWith('/ep1') ? 11 : 22;
      res.end(JSON.stringify({ result: 'accepted', revenue: rev, buyer_lead_id: 'B-' + rev }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

const CAMPAIGN = 'campX';
const NOW = Date.UTC(2026, 6, 13, 14, 0, 0);

function fixtures() {
  const group = { id: 'g1', campaign_id: CAMPAIGN, name: 'G', method: 'priority', order_index: 0, active: true, lifecycle: 'active' };
  const buyer = { id: 'b1', status: 'active', active: true, billing_type: 'prepay', prepay_balance: 100000 };
  const delivery = { id: 'del1', buyer_id: 'b1', status: 'active' };
  const rm = { accepted: 'accepted', revenue: 'revenue', buyer_lead_id: 'buyer_lead_id' };
  const subDeliveries = [
    { id: 'sd1', delivery_id: 'del1', active: true, target_url: `${base}/ep1`, method: 'POST', encoding: 'json',
      response_mapping: JSON.stringify(rm), field_map: JSON.stringify([{ src: 'email', dest: 'Email' }]), credential_ref: 'ref-A' },
    { id: 'sd2', delivery_id: 'del1', active: true, target_url: `${base}/ep2`, method: 'POST', encoding: 'json',
      response_mapping: JSON.stringify(rm), field_map: JSON.stringify([{ src: 'email', dest: 'Email' }]), credential_ref: 'ref-B' },
  ];
  const members = [
    { id: 'm1', route_group_id: 'g1', buyer_id: 'b1', sub_delivery_id: 'sd1', active: true, priority: 1,
      price_mode: 'fixed', fixed_price: 10, caps: JSON.stringify({ daily: { limit: 5 } }) },
    { id: 'm2', route_group_id: 'g1', buyer_id: 'b1', sub_delivery_id: 'sd2', active: true, priority: 2,
      price_mode: 'fixed', fixed_price: 20, caps: JSON.stringify({ daily: { limit: 100 } }) },
  ];
  return { groups: [group], members, buyers: [buyer], destinations: [], deliveries: [delivery], subDeliveries, health: [] };
}

// A server-side secret resolver: maps opaque refs to real auth headers. Stands in
// for secret storage. The secret values live ONLY here, never in entity JSON.
async function resolveCredential(ref) {
  const secrets = { 'ref-A': 'Bearer SECRET-AAA', 'ref-B': 'Bearer SECRET-BBB' };
  return { Authorization: secrets[ref] };
}

async function deliverMember(mem, store) {
  return deliverDirectPost({
    ...mem.delivery,
    idempotencyKey: `L1:${mem.subDeliveryId}`, leadId: 'L1',
    leadData: { email: 'lead@x.com' }, isPrimary: true, trigger: 'primary',
  }, { store, nowMs: 0, testMode: true, fetchImpl: globalThis.fetch, resolveCredential });
}

describe('routing wire-up: snapshot -> named sub-delivery -> distinct endpoints', () => {
  it('two members on one buyer deliver to different endpoints with their own prices and caps', async () => {
    const snap = buildRoutingSnapshot(fixtures(), { campaignId: CAMPAIGN, nowMs: NOW, capCountsFor: () => 0 });
    expect(snap.configErrors).toEqual([]);
    const [m1, m2] = snap.groups[0].members;

    // Distinct endpoints, prices, and caps carried through the snapshot.
    expect(m1.delivery.targetUrl).toContain('/ep1');
    expect(m2.delivery.targetUrl).toContain('/ep2');
    expect(m1.price).toBe(10);
    expect(m2.price).toBe(20);
    expect(m1.caps.daily.limit).toBe(5);
    expect(m2.caps.daily.limit).toBe(100);

    const store = makeInMemoryAttemptStore();
    const r1 = await deliverMember(m1, store);
    const r2 = await deliverMember(m2, store);

    // Each delivered to its own named sub-delivery endpoint.
    expect(r1.status).toBe(ATTEMPT_STATUS.ACCEPTED);
    expect(r2.status).toBe(ATTEMPT_STATUS.ACCEPTED);
    expect(r1.revenue).toBe(11); // /ep1 answered
    expect(r2.revenue).toBe(22); // /ep2 answered

    const paths = hits.map((h) => h.path).sort();
    expect(paths).toEqual(['/ep1', '/ep2']);

    // Server-side credential resolution injected the correct per-endpoint secret.
    const ep1 = hits.find((h) => h.path === '/ep1');
    const ep2 = hits.find((h) => h.path === '/ep2');
    expect(ep1.auth).toBe('Bearer SECRET-AAA');
    expect(ep2.auth).toBe('Bearer SECRET-BBB');

    // The resolved secret is NEVER persisted to the attempt record.
    for (const a of store._debug.attempts) {
      expect(a.request_meta || '').not.toContain('SECRET-AAA');
      expect(a.request_meta || '').not.toContain('SECRET-BBB');
    }
    // Attempts are keyed on sub_delivery_id (per endpoint).
    const keyed = store._debug.attempts.map((a) => a.sub_delivery_id).sort();
    expect(keyed).toEqual(['sd1', 'sd2']);
  });
});
