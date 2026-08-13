import { describe, it, expect, beforeEach } from 'vitest';
import { runShadow } from './shadowHook.js';
import { _clearActiveGroupCache } from './snapshotLoader.js';

// Mock Base44 db. Records every create and every filter query so we can assert
// that ONLY RouteDecisionTrace is written and that reads are always filtered.
function mockDb(data = {}) {
  const creates = []; const filters = [];
  const match = (rows, q) => (rows || []).filter((r) => Object.entries(q || {}).every(([k, v]) => String(r[k]) === String(v)));
  const entity = (name, rows) => ({
    async filter(q, _sort, limit = 1000, skip = 0) { filters.push({ name, q }); return match(rows, q).slice(skip, skip + limit); },
    async create(rec) { creates.push({ name, rec }); return { ...rec, id: name + creates.length }; },
  });
  return {
    _creates: creates, _filters: filters,
    entities: {
      RouteGroup: entity('RouteGroup', data.groups),
      RouteMember: entity('RouteMember', data.members),
      Buyer: entity('Buyer', data.buyers),
      LeadByteConnector: entity('LeadByteConnector', data.dests),
      DestinationHealth: entity('DestinationHealth', data.health),
      RouteDecisionTrace: entity('RouteDecisionTrace', []),
    },
  };
}

const CAMPAIGN = 'c1';
const active = { id: 'g1', campaign_id: CAMPAIGN, active: true, lifecycle: 'active', method: 'priority', order_index: 0 };
const member = { id: 'm1', route_group_id: 'g1', buyer_id: 'b1', destination_id: 'd1', active: true, priority: 1, price_mode: 'fixed', fixed_price: 10 };
const buyer = { id: 'b1', status: 'active', active: true, billing_type: 'prepay', prepay_balance: 1000 };
const dest = { id: 'd1' };

let clockT;
function ctx(over) {
  clockT = 1000;
  return { distributionMode: 'shadow', campaignId: CAMPAIGN, leadId: 'L1', idempotencyKey: 'L1',
    leadData: { state: 'TX' }, nowMs: 1000, clock: () => (clockT += 5), ...over };
}

beforeEach(() => _clearActiveGroupCache());

describe('runShadow (isolated, writes only RouteDecisionTrace)', () => {
  it('is fully inert when distribution_mode = legacy_only', async () => {
    const db = mockDb({ groups: [active], members: [member], buyers: [buyer], dests: [dest] });
    const r = await runShadow(db, ctx({ distributionMode: 'legacy_only' }));
    expect(r.ran).toBe(false);
    expect(db._creates).toHaveLength(0);
    expect(db._filters).toHaveLength(0); // no reads at all
  });

  it('skips the snapshot load when no active RouteGroup exists', async () => {
    const db = mockDb({ groups: [], members: [], buyers: [], dests: [] });
    const r = await runShadow(db, ctx());
    expect(r.reason).toBe('no_route_config');
    // only the existence check on RouteGroup ran; no RouteMember/Buyer reads
    expect(db._filters.every((f) => f.name === 'RouteGroup')).toBe(true);
    // wrote exactly one trace
    expect(db._creates).toHaveLength(1);
    expect(db._creates[0].name).toBe('RouteDecisionTrace');
    expect(db._creates[0].rec.result).toBe('no_route_config');
  });

  it('runs the canonical engine and writes ONE trace with latency + config identity', async () => {
    const db = mockDb({ groups: [active], members: [member], buyers: [buyer], dests: [dest], health: [] });
    const r = await runShadow(db, ctx());
    expect(r.ran).toBe(true);
    expect(r.winner).toBe('m1');
    // only RouteDecisionTrace was created (writes nothing else)
    expect(db._creates.every((c) => c.name === 'RouteDecisionTrace')).toBe(true);
    expect(db._creates).toHaveLength(1);
    const trace = db._creates[0].rec;
    expect(trace.winner_member_id).toBe('m1');
    expect(trace.eval_latency_ms).toBeGreaterThan(0);
    expect(trace.config_version).toBeTruthy();
    expect(JSON.parse(trace.evaluated_candidates)[0].member_id).toBe('m1');
  });

  it('every read is filtered (never an unfiltered full list)', async () => {
    const db = mockDb({ groups: [active], members: [member], buyers: [buyer], dests: [dest], health: [] });
    await runShadow(db, ctx());
    expect(db._filters.length).toBeGreaterThan(0);
    for (const f of db._filters) expect(Object.keys(f.q).length).toBeGreaterThan(0);
  });

  it('records an evaluation error to the trace and never throws', async () => {
    const db = mockDb({ groups: [active], members: [member], buyers: [buyer], dests: [dest] });
    // break the snapshot load
    db.entities.RouteMember.filter = async () => { throw new Error('boom'); };
    const r = await runShadow(db, ctx());
    expect(r.reason).toBe('evaluation_error');
    const errTrace = db._creates.find((c) => c.rec.result === 'evaluation_error');
    expect(errTrace).toBeTruthy();
    expect(errTrace.rec.error_message).toContain('boom');
  });
});
