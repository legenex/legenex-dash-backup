import { describe, it, expect } from 'vitest';
import { simulateRoute } from './simulator.js';

const MON = Date.UTC(2026, 6, 13, 12, 0, 0); // Monday
const SUN = Date.UTC(2026, 6, 12, 12, 0, 0); // Sunday

const config = {
  groups: [
    {
      id: 'g1', orderIndex: 0, method: 'priority',
      members: [{
        id: 'm1', buyerId: 'B1', active: true, priority: 1, price: 10,
        buyer: { active: true, status: 'active' },
        filters: { states: ['TX'] },
        conditions: { op: 'and', children: [{ field: 'age', operator: 'gte', value: 18 }] },
        schedule: { timezone: 'UTC', windows: [{ days: [1, 2, 3, 4, 5], start: '00:00', end: '24:00' }] },
      }],
    },
    {
      id: 'g2', orderIndex: 1, method: 'priority',
      members: [{ id: 'm2', buyerId: 'B2', active: true, priority: 1, price: 8, buyer: { active: true, status: 'active' } }],
    },
  ],
};

describe('simulateRoute (zero side effects)', () => {
  it('is always marked simulated with no side effects', () => {
    const out = simulateRoute(config, { state: 'TX', age: '25' }, { nowMs: MON });
    expect(out.simulated).toBe(true);
    expect(out.sideEffects).toBe('none');
    expect(out.testPayload).toBe(true);
  });
  it('wins in the first group when eligible', () => {
    const out = simulateRoute(config, { state: 'TX', age: '25' }, { nowMs: MON });
    expect(out.decision.winnerMemberId).toBe('m1');
    expect(out.decision.buyerId).toBe('B1');
    expect(out.decision.price).toBe(10);
  });
  it('falls through on failed qualification and explains why', () => {
    const out = simulateRoute(config, { state: 'TX', age: '15' }, { nowMs: MON });
    expect(out.decision.winnerMemberId).toBe('m2');
    expect(out.decision.fallthroughPath).toEqual(['g1']);
    const g1 = out.explanation.find((g) => g.groupId === 'g1');
    expect(g1.candidates[0].reason).toBe('QUALIFICATION_FAILED');
    expect(g1.candidates[0].reasonText).toMatch(/qualification/i);
  });
  it('respects the operating schedule', () => {
    const out = simulateRoute(config, { state: 'TX', age: '25' }, { nowMs: SUN });
    expect(out.decision.winnerMemberId).toBe('m2'); // g1 closed on Sunday
    const g1 = out.explanation.find((g) => g.groupId === 'g1');
    expect(g1.candidates[0].reason).toBe('OUTSIDE_SCHEDULE');
  });
});
