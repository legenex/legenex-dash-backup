import { describe, it, expect } from 'vitest';
import * as canonical from './engine.js';
import * as generated from '../../../base44/functions/_shared/routingEngine.generated.js';

// Proves the GENERATED backend engine bundle is the same engine as the canonical
// source: identical routing decisions on the same inputs. Combined with the
// hash parity check (scripts/check-engine-parity.mjs), this guarantees PB-001 -
// one canonical engine, no divergent backend mirror.

const groups = [
  {
    id: 'g1', orderIndex: 0, method: 'priority',
    members: [{ id: 'g1m1', active: true, priority: 1, price: 10, buyer: { active: true, status: 'active' }, filters: { states: ['NY'] } }],
  },
  {
    id: 'g2', orderIndex: 1, method: 'auction',
    members: [
      { id: 'g2m1', active: true, priority: 1, priceMode: 'auction', bid: 8, price: 8, buyer: { active: true, status: 'active' } },
      { id: 'g2m2', active: true, priority: 2, priceMode: 'auction', bid: 15, price: 15, buyer: { active: true, status: 'active' } },
    ],
  },
];

describe('generated backend engine == canonical engine', () => {
  it('exports the same routing functions', () => {
    for (const fn of ['routeWaterfall', 'evaluateMember', 'REASON', 'resolvePrice', 'idempotencyKey']) {
      expect(generated[fn], `generated is missing ${fn}`).toBeDefined();
    }
  });

  it('produces identical decisions across several leads', () => {
    const leads = [
      { state: 'TX', vertical: 'legal' },
      { state: 'NY', vertical: 'legal' },
      { state: 'CA' },
    ];
    for (const lead of leads) {
      const a = canonical.routeWaterfall(groups, lead, { idempotencyKey: 'k' });
      const b = generated.routeWaterfall(groups, lead, { idempotencyKey: 'k' });
      expect(b.winner?.id).toBe(a.winner?.id);
      expect(b.groupId).toBe(a.groupId);
      expect(b.price).toBe(a.price);
      expect(b.reason).toBe(a.reason);
    }
  });

  it('agrees on eligibility reason codes', () => {
    const m = { id: 'm', active: true, buyer: { active: true, status: 'paused' } };
    const a = canonical.evaluateMember(m, { state: 'TX' });
    const b = generated.evaluateMember(m, { state: 'TX' });
    expect(b.reason).toBe(a.reason);
    expect(b.reason).toBe(canonical.REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });
});
