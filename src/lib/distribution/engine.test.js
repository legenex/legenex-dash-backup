import { describe, it, expect } from 'vitest';
import {
  REASON, isValidTrustedForm, missingRequiredFields, exhaustedCap, evaluateMember,
  resolvePrice, selectPriority, selectWeighted, selectRoundRobin, selectAuction,
  selectHybrid, routeWaterfall, capWindowStart, idempotencyKey, redact,
} from './engine.js';

describe('isValidTrustedForm (gate-only, never fabricated)', () => {
  it('accepts a well-formed cert url', () => {
    expect(isValidTrustedForm('https://cert.trustedform.com/' + 'a'.repeat(40))).toBe(true);
    expect(isValidTrustedForm('https://cert.trustedform.com/' + 'A0f'.padEnd(40, '0') + '?v=1')).toBe(true);
  });
  it('rejects malformed / wrong-host / short tokens', () => {
    expect(isValidTrustedForm('https://cert.trustedform.com/short')).toBe(false);
    expect(isValidTrustedForm('https://evil.com/' + 'a'.repeat(40))).toBe(false);
    expect(isValidTrustedForm('')).toBe(false);
    expect(isValidTrustedForm(null)).toBe(false);
  });
});

describe('missingRequiredFields', () => {
  it('flags absent, null, and whitespace-only values', () => {
    const data = { first_name: 'Jo', email: '', mobile: '  ', extra: 'x' };
    expect(missingRequiredFields(data, ['first_name', 'email', 'mobile', 'zip']))
      .toEqual(['email', 'mobile', 'zip']);
  });
  it('returns [] when all present', () => {
    expect(missingRequiredFields({ a: 1 }, ['a'])).toEqual([]);
  });
});

describe('exhaustedCap', () => {
  it('returns the first exhausted window in fixed order', () => {
    expect(exhaustedCap({ daily: { limit: 10, count: 9 } })).toBe(null);
    expect(exhaustedCap({ daily: { limit: 10, count: 10 } })).toBe(REASON.CAP_DAILY);
    expect(exhaustedCap({ total: { limit: 5, count: 5 }, daily: { limit: 10, count: 1 } }))
      .toBe(REASON.CAP_TOTAL);
  });
  it('treats null limit as unlimited', () => {
    expect(exhaustedCap({ daily: { limit: null, count: 9999 } })).toBe(null);
  });
});

describe('evaluateMember eligibility (fixed order + reason codes)', () => {
  const base = {
    id: 'm1', active: true, priority: 1, price: 10,
    buyer: { active: true, status: 'active' },
    filters: { states: ['TX', 'CA'] },
  };
  const lead = { state: 'TX', vertical: 'legal', email: 'a@b.com', mobile: '5125550100' };

  it('passes a clean member', () => {
    expect(evaluateMember(base, lead)).toEqual({ eligible: true, reason: REASON.ELIGIBLE });
  });
  it('rejects inactive member', () => {
    expect(evaluateMember({ ...base, active: false }, lead).reason).toBe(REASON.MEMBER_INACTIVE);
  });
  it('fails closed on contradictory buyer lifecycle (paused + active true)', () => {
    const m = { ...base, buyer: { active: true, status: 'paused' } };
    expect(evaluateMember(m, lead).reason).toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });
  it('rejects terminated buyer', () => {
    const m = { ...base, buyer: { active: false, status: 'terminated' } };
    expect(evaluateMember(m, lead).reason).toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });
  // Pinned allowlist fixtures: eligible ONLY when status==='active' AND active===true.
  it('allowlist: paused + active=true is ineligible', () => {
    expect(evaluateMember({ ...base, buyer: { active: true, status: 'paused' } }, lead).reason)
      .toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });
  it('allowlist: active + active=false is ineligible', () => {
    expect(evaluateMember({ ...base, buyer: { active: false, status: 'active' } }, lead).reason)
      .toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });
  it('allowlist: draft + active=true is ineligible', () => {
    expect(evaluateMember({ ...base, buyer: { active: true, status: 'draft' } }, lead).reason)
      .toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });
  it('allowlist: missing buyer is ineligible', () => {
    expect(evaluateMember({ ...base, buyer: undefined }, lead).reason)
      .toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });
  it('allowlist: unknown status is ineligible', () => {
    expect(evaluateMember({ ...base, buyer: { active: true, status: 'suspended' } }, lead).reason)
      .toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });
  it('enforces state filter', () => {
    expect(evaluateMember(base, { ...lead, state: 'NY' }).reason).toBe(REASON.FILTER_STATE);
  });
  it('enforces schedule when caller marks it outside window', () => {
    expect(evaluateMember({ ...base, withinSchedule: false }, lead).reason).toBe(REASON.OUTSIDE_SCHEDULE);
  });
  it('applies suppression by email or phone', () => {
    const m = { ...base, suppression: ['a@b.com'] };
    expect(evaluateMember(m, lead).reason).toBe(REASON.SUPPRESSED);
  });
  it('enforces caps', () => {
    const m = { ...base, caps: { daily: { limit: 1, count: 1 } } };
    expect(evaluateMember(m, lead).reason).toBe(REASON.CAP_DAILY);
  });
  it('enforces prepaid wallet balance without touching lifecycle', () => {
    const m = { ...base, price: 25, wallet: { mode: 'prepaid', balance: 10 } };
    expect(evaluateMember(m, lead).reason).toBe(REASON.LOW_BALANCE);
  });
  it('enforces postpaid credit limit', () => {
    const m = { ...base, price: 25, wallet: { mode: 'postpaid', outstanding: 90, creditLimit: 100 } };
    expect(evaluateMember(m, lead).reason).toBe(REASON.OVER_CREDIT_LIMIT);
  });
  it('respects destination health circuit breaker', () => {
    expect(evaluateMember({ ...base, health: { state: 'open' } }, lead).reason)
      .toBe(REASON.DESTINATION_UNHEALTHY);
  });
  it('enforces auction reserve only when asked', () => {
    const m = { ...base, priceMode: 'auction', bid: 5, reservePrice: 8 };
    expect(evaluateMember(m, lead, { enforceReserve: true }).reason).toBe(REASON.BELOW_RESERVE);
    expect(evaluateMember(m, lead).eligible).toBe(true); // not enforced by default
  });
});

describe('selection methods (deterministic)', () => {
  const members = [
    { id: 'a', priority: 3, weight: 1, price: 5 },
    { id: 'b', priority: 1, weight: 1, price: 20 },
    { id: 'c', priority: 2, weight: 1, price: 12 },
  ];
  it('priority picks lowest number', () => {
    expect(selectPriority(members).id).toBe('b');
  });
  it('auction picks highest price, deterministic tie-break', () => {
    expect(selectAuction(members).id).toBe('b');
    const tie = [{ id: 'y', price: 10, priority: 2 }, { id: 'x', price: 10, priority: 2 }];
    expect(selectAuction(tie).id).toBe('x'); // id tie-break
  });
  it('weighted is stable for the same seed and picks within set', () => {
    const w1 = selectWeighted(members, 'seed-123');
    const w2 = selectWeighted(members, 'seed-123');
    expect(w1.id).toBe(w2.id);
    expect(['a', 'b', 'c']).toContain(w1.id);
  });
  it('weighted falls back to priority when all weights zero', () => {
    const zero = members.map((m) => ({ ...m, weight: 0 }));
    expect(selectWeighted(zero, 'x').id).toBe('b');
  });
  it('round robin advances the cursor and wraps', () => {
    const r0 = selectRoundRobin(members, 0);
    expect(r0.member.id).toBe('a'); // sorted by id
    expect(r0.nextCursor).toBe(1);
    const r2 = selectRoundRobin(members, 2);
    expect(r2.member.id).toBe('c');
    expect(r2.nextCursor).toBe(0); // wrap
  });
  it('hybrid blends price and priority', () => {
    // price-only weighting should favor highest price (b)
    expect(selectHybrid(members, { price: 1, priority: 0 }).id).toBe('b');
    // priority-only weighting should favor lowest priority number (b too here)
    expect(selectHybrid(members, { price: 0, priority: 1 }).id).toBe('b');
  });
});

describe('routeWaterfall fall-through + trace', () => {
  const B = { active: true, status: 'active' };
  const groups = [
    {
      id: 'g1', orderIndex: 0, method: 'priority',
      members: [{ id: 'g1m1', active: true, priority: 1, price: 10, buyer: B, filters: { states: ['NY'] } }],
    },
    {
      id: 'g2', orderIndex: 1, method: 'auction',
      members: [
        { id: 'g2m1', active: true, priority: 1, priceMode: 'auction', bid: 8, price: 8, buyer: B },
        { id: 'g2m2', active: true, priority: 2, priceMode: 'auction', bid: 15, price: 15, buyer: B },
      ],
    },
  ];
  it('falls through g1 (no eligible) and wins in g2 by auction', () => {
    const out = routeWaterfall(groups, { state: 'TX' }, { idempotencyKey: 'k' });
    expect(out.winner.id).toBe('g2m2');
    expect(out.groupId).toBe('g2');
    expect(out.price).toBe(15);
    expect(out.fallthroughPath).toEqual(['g1']);
    expect(out.trace).toHaveLength(2);
    expect(out.trace[0].candidates[0].reason).toBe(REASON.FILTER_STATE);
  });
  it('returns NO_ELIGIBLE_MEMBER when nothing matches', () => {
    const out = routeWaterfall([groups[0]], { state: 'TX' });
    expect(out.winner).toBe(null);
    expect(out.reason).toBe(REASON.NO_ELIGIBLE_MEMBER);
  });
});

describe('capWindowStart', () => {
  const t = Date.UTC(2026, 6, 13, 14, 12, 53); // 2026-07-13T14:12:53Z (Mon)
  it('daily start is midnight UTC', () => {
    expect(capWindowStart(t, 'daily')).toBe('2026-07-13T00:00:00.000Z');
  });
  it('monthly start is first of month', () => {
    expect(capWindowStart(t, 'monthly')).toBe('2026-07-01T00:00:00.000Z');
  });
  it('hourly start truncates minutes', () => {
    expect(capWindowStart(t, 'hourly')).toBe('2026-07-13T14:00:00.000Z');
  });
});

describe('idempotencyKey', () => {
  it('is stable and independent of dedup-field order', async () => {
    const a = await idempotencyKey({ supplierKeyId: 's1', dedupFields: { email: 'A@B.com', mobile: '512' }, campaignId: 'c1' });
    const b = await idempotencyKey({ supplierKeyId: 's1', dedupFields: { mobile: '512', email: 'a@b.com' }, campaignId: 'c1' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs for different suppliers', async () => {
    const a = await idempotencyKey({ supplierKeyId: 's1', dedupFields: { email: 'a@b.com' } });
    const b = await idempotencyKey({ supplierKeyId: 's2', dedupFields: { email: 'a@b.com' } });
    expect(a).not.toBe(b);
  });
});

describe('redact', () => {
  it('masks secret-ish keys and preserves structure', () => {
    const out = redact({ name: 'x', api_key: 'abc', nested: { Authorization: 'Bearer z', ok: 1 } });
    expect(out).toEqual({ name: 'x', api_key: '[redacted]', nested: { Authorization: '[redacted]', ok: 1 } });
  });
});
