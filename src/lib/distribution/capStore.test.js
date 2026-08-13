import { describe, it, expect } from 'vitest';
import { makeInMemoryCasStore } from './capStore.js';

// The mock models real CAS: read a versioned value, yield (interleave), commit
// only if unchanged, else retry. These tests fail if the CAS logic is broken.

describe('CAS store incrementIfBelow (atomic under concurrency)', () => {
  it('25 concurrent increments against limit 5 yield exactly 5', async () => {
    const s = makeInMemoryCasStore();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => s.incrementIfBelow('cap', 5)),
    );
    expect(results.filter(Boolean).length).toBe(5);
    expect(await s.getCount('cap')).toBe(5);
  });

  it('never exceeds the limit even with many rounds', async () => {
    const s = makeInMemoryCasStore();
    const rounds = await Promise.all(Array.from({ length: 100 }, () => s.incrementIfBelow('cap', 10)));
    expect(rounds.filter(Boolean).length).toBe(10);
    expect(await s.getCount('cap')).toBe(10);
  });

  it('decrement never goes negative under concurrency', async () => {
    const s = makeInMemoryCasStore();
    await s.incrementIfBelow('cap', 100);
    await Promise.all(Array.from({ length: 10 }, () => s.decrement('cap')));
    expect(await s.getCount('cap')).toBe(0);
  });

  it('separate window keys are isolated', async () => {
    const s = makeInMemoryCasStore();
    await Promise.all([
      ...Array.from({ length: 10 }, () => s.incrementIfBelow('daily:2026-07-13', 3)),
      ...Array.from({ length: 10 }, () => s.incrementIfBelow('daily:2026-07-14', 3)),
    ]);
    expect(await s.getCount('daily:2026-07-13')).toBe(3);
    expect(await s.getCount('daily:2026-07-14')).toBe(3);
  });

  it('claim is won by exactly one concurrent caller', async () => {
    const s = makeInMemoryCasStore();
    const wins = await Promise.all(Array.from({ length: 12 }, () => s.claim('resv:k:m')));
    expect(wins.filter(Boolean).length).toBe(1);
  });
});
