// Ping-post bid ranking. Pure: `nowMs` passed in. At ping stage only approved
// minimal fields are sent (enforced by the caller/adapter, not here). This module
// ranks the bids that came back and selects a winner, with a full audit of why
// each bid was excluded. Full PII is posted only to the winner (caller's job).

export const BID_REASON = {
  ELIGIBLE: 'ELIGIBLE',
  BID_EXPIRED: 'BID_EXPIRED',
  BELOW_RESERVE: 'BELOW_RESERVE',
  NO_BID: 'NO_BID',
  NO_ELIGIBLE_BID: 'NO_ELIGIBLE_BID',
};

// bids: [{ id, buyerId, amount, expiresAtMs? }]
// opts: { reservePrice?, nowMs? }
// Returns { winner, ranked: [{...bid, reason}], excluded: [{ id, reason }] }.
export function rankBids(bids, opts = {}) {
  const nowMs = opts.nowMs;
  const reserve = opts.reservePrice != null ? Number(opts.reservePrice) : null;
  const evaluated = (bids || []).map((b) => {
    const amount = Number(b.amount);
    let reason = BID_REASON.ELIGIBLE;
    if (!(amount > 0)) reason = BID_REASON.NO_BID;
    else if (b.expiresAtMs != null && nowMs != null && b.expiresAtMs < nowMs) reason = BID_REASON.BID_EXPIRED;
    else if (reserve != null && amount < reserve) reason = BID_REASON.BELOW_RESERVE;
    return { ...b, amount, reason };
  });

  const eligible = evaluated.filter((b) => b.reason === BID_REASON.ELIGIBLE);
  eligible.sort((a, b) => b.amount - a.amount || String(a.id).localeCompare(String(b.id)));

  return {
    winner: eligible[0] || null,
    winnerReason: eligible.length ? BID_REASON.ELIGIBLE : BID_REASON.NO_ELIGIBLE_BID,
    ranked: eligible,
    excluded: evaluated.filter((b) => b.reason !== BID_REASON.ELIGIBLE).map((b) => ({ id: b.id, reason: b.reason })),
  };
}
