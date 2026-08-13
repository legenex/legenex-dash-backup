import { describe, it, expect } from 'vitest';
import { rankBids, BID_REASON } from './pingpost.js';

describe('rankBids', () => {
  const nowMs = Date.UTC(2026, 6, 13, 14, 0, 0);
  it('ranks eligible bids by amount desc and picks the winner', () => {
    const out = rankBids([
      { id: 'b1', buyerId: 'B1', amount: 12 },
      { id: 'b2', buyerId: 'B2', amount: 20 },
      { id: 'b3', buyerId: 'B3', amount: 15 },
    ], { nowMs });
    expect(out.winner.id).toBe('b2');
    expect(out.ranked.map((b) => b.id)).toEqual(['b2', 'b3', 'b1']);
    expect(out.excluded).toEqual([]);
  });
  it('excludes expired and below-reserve bids with reasons', () => {
    const out = rankBids([
      { id: 'exp', amount: 30, expiresAtMs: nowMs - 1000 },
      { id: 'low', amount: 5 },
      { id: 'ok', amount: 18 },
    ], { nowMs, reservePrice: 10 });
    expect(out.winner.id).toBe('ok');
    expect(out.excluded).toEqual(expect.arrayContaining([
      { id: 'exp', reason: BID_REASON.BID_EXPIRED },
      { id: 'low', reason: BID_REASON.BELOW_RESERVE },
    ]));
  });
  it('returns no winner when all bids are ineligible', () => {
    const out = rankBids([{ id: 'z', amount: 0 }], { nowMs });
    expect(out.winner).toBe(null);
    expect(out.winnerReason).toBe(BID_REASON.NO_ELIGIBLE_BID);
  });
  it('deterministic tie-break by id at equal amount', () => {
    const out = rankBids([{ id: 'y', amount: 10 }, { id: 'x', amount: 10 }], { nowMs });
    expect(out.winner.id).toBe('x');
  });
});
