import { describe, it, expect } from 'vitest';
import { reserve, finalize, release, RESERVE } from './reservation.js';
import { makeInMemoryCasStore } from './capStore.js';

describe('reserve (atomic claim, cap-safe, idempotent)', () => {
  it('reserves and increments the counter', async () => {
    const s = makeInMemoryCasStore();
    const out = await reserve(s, { idempotencyKey: 'k1', leadId: 'L1', memberId: 'm1', price: 10, scopes: [{ key: 'daily:m1', limit: 5 }] });
    expect(out.ok).toBe(true);
    expect(out.code).toBe(RESERVE.OK);
    expect(await s.getCount('daily:m1')).toBe(1);
  });

  it('25 concurrent reservations against cap 5 succeed exactly 5 (no oversell)', async () => {
    const s = makeInMemoryCasStore();
    const scopes = [{ key: 'daily:m1', limit: 5 }];
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        reserve(s, { idempotencyKey: 'k' + i, leadId: 'L' + i, memberId: 'm1', scopes })),
    );
    expect(results.filter((r) => r.ok && r.code === RESERVE.OK).length).toBe(5);
    expect(await s.getCount('daily:m1')).toBe(5);
  });

  it('10 concurrent calls with one idempotency key create exactly one reservation', async () => {
    const s = makeInMemoryCasStore();
    const scopes = [{ key: 'daily:m1', limit: 100 }];
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        reserve(s, { idempotencyKey: 'same', leadId: 'L', memberId: 'm1', scopes })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    // exactly one real reservation row; cap consumed exactly once
    const rows = s._debug.reservations.filter((r) => r.idempotency_key === 'same');
    expect(rows).toHaveLength(1);
    expect(await s.getCount('daily:m1')).toBe(1);
    expect(results.filter((r) => r.code === RESERVE.OK).length).toBe(1);
    expect(results.filter((r) => r.code === RESERVE.ALREADY_RESERVED).length).toBe(9);
  });

  it('rolls back earlier scopes when a later scope is over limit (consumes nothing)', async () => {
    const s = makeInMemoryCasStore();
    // pre-fill the monthly scope to its limit
    for (let i = 0; i < 10; i++) await s.incrementIfBelow('monthly:m1', 10);
    const out = await reserve(s, {
      idempotencyKey: 'k', leadId: 'L1', memberId: 'm1',
      scopes: [{ key: 'daily:m1', limit: 5 }, { key: 'monthly:m1', limit: 10 }],
    });
    expect(out.ok).toBe(false);
    expect(out.code).toBe(RESERVE.CAP_EXCEEDED);
    expect(await s.getCount('daily:m1')).toBe(0); // rolled back
  });

  it('finalize keeps capacity; release returns it once; state transitions are guarded', async () => {
    const s = makeInMemoryCasStore();
    const scopes = [{ key: 'daily:m1', limit: 5 }];
    const { reservation } = await reserve(s, { idempotencyKey: 'k', leadId: 'L1', memberId: 'm1', scopes });

    const fin = await finalize(s, reservation);
    expect(fin.state).toBe('finalized');
    expect(await s.getCount('daily:m1')).toBe(1);
    // finalized cannot release
    const rel = await release(s, fin);
    expect(rel.state).toBe('finalized');
    expect(await s.getCount('daily:m1')).toBe(1);
  });

  it('release decrements once and is idempotent; released cannot finalize', async () => {
    const s = makeInMemoryCasStore();
    const scopes = [{ key: 'daily:m1', limit: 5 }];
    const { reservation } = await reserve(s, { idempotencyKey: 'k', leadId: 'L1', memberId: 'm1', scopes });
    const rel1 = await release(s, reservation);
    expect(rel1.state).toBe('released');
    expect(await s.getCount('daily:m1')).toBe(0);
    await release(s, rel1);
    expect(await s.getCount('daily:m1')).toBe(0); // not negative, not double
    const fin = await finalize(s, rel1);
    expect(fin.state).toBe('released'); // released cannot finalize
  });
});
