import { describe, it, expect, beforeEach } from 'vitest';
import { runSimulation } from './simulateReport.js';
import { _clearActiveGroupCache } from './snapshotLoader.js';

function mockDb(data = {}) {
  const creates = []; const updates = [];
  const match = (rows, q) => (rows || []).filter((r) => Object.entries(q || {}).every(([k, v]) => String(r[k]) === String(v)));
  const entity = (rows) => ({
    async filter(q, _s, limit = 1000, skip = 0) { return match(rows, q).slice(skip, skip + limit); },
    async create(rec) { creates.push(rec); return rec; },
    async update(id, patch) { updates.push({ id, patch }); },
  });
  return {
    _creates: creates, _updates: updates,
    entities: {
      RouteGroup: entity(data.groups), RouteMember: entity(data.members), Buyer: entity(data.buyers),
      LeadByteConnector: entity(data.dests), DestinationHealth: entity(data.health),
    },
  };
}

const CAMPAIGN = 'c1';
const g = { id: 'g1', campaign_id: CAMPAIGN, active: true, lifecycle: 'active', method: 'priority', order_index: 0 };
const m = { id: 'm1', route_group_id: 'g1', buyer_id: 'b1', destination_id: 'd1', active: true, priority: 1, price_mode: 'fixed', fixed_price: 10 };
const b = { id: 'b1', status: 'active', active: true, billing_type: 'prepay', prepay_balance: 1000 };

beforeEach(() => _clearActiveGroupCache());

describe('runSimulation (real config, zero side effects)', () => {
  it('returns a simulated result with a winner, config identity, and NO writes', async () => {
    const db = mockDb({ groups: [g], members: [m], buyers: [b], dests: [{ id: 'd1' }], health: [] });
    const out = await runSimulation(db, { campaignId: CAMPAIGN, leadData: { state: 'TX' }, nowMs: 1000 });
    expect(out.simulated).toBe(true);
    expect(out.sideEffects).toBe('none');
    expect(out.decision.winnerMemberId).toBe('m1');
    expect(out.configVersion).toBeTruthy();
    expect(out.explanation[0].candidates[0].eligible).toBe(true);
    // proves zero side effects
    expect(db._creates).toHaveLength(0);
    expect(db._updates).toHaveLength(0);
  });

  // Balance gating is opt-in (12 Aug 2026): an explicit credit_limit is what
  // turns an underfunded buyer into an ineligible one.
  it('reports per-candidate eligibility reasons (e.g. low balance)', async () => {
    const db = mockDb({ groups: [g], members: [{ ...m, fixed_price: 50 }], buyers: [{ ...b, prepay_balance: 10, credit_limit: 500 }], dests: [{ id: 'd1' }] });
    const out = await runSimulation(db, { campaignId: CAMPAIGN, leadData: { state: 'TX' }, nowMs: 1000 });
    expect(out.decision.winnerMemberId).toBe(null);
    expect(out.explanation[0].candidates[0].reason).toBe('LOW_BALANCE');
    expect(out.explanation[0].candidates[0].reasonText).toMatch(/balance/i);
    expect(db._creates).toHaveLength(0);
  });
});
