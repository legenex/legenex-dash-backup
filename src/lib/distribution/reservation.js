// Concurrency-safe, idempotent cap reservation over the CAS store (capStore.js).
// Uses an ATOMIC CLAIM (not get-then-put) so concurrent requests with the same
// idempotency key produce exactly one reservation (fixes the PB-009 race). Caps
// are enforced by atomic increment-if-below, so no buyer is oversold under
// concurrency (PB-008). All effects use only the proven counter-CAS primitive.

export const RESERVE = {
  OK: 'OK',
  ALREADY_RESERVED: 'ALREADY_RESERVED', // idempotent replay / concurrent duplicate
  CAP_EXCEEDED: 'CAP_EXCEEDED',
};

function claimKeyFor(idempotencyKey, memberId) {
  return `resv:${idempotencyKey}:${memberId}`;
}

// Reserve capacity across all cap scopes for one member, atomically and idempotently.
// scopes: [{ key, limit }] (limit null => unlimited window, skipped).
export async function reserve(store, { idempotencyKey, leadId, memberId, price = 0, scopes = [] }) {
  // 1. Atomic claim. Exactly one concurrent caller for this (key, member) wins.
  const won = await store.claim(claimKeyFor(idempotencyKey, memberId));
  if (!won) {
    // A concurrent or prior caller owns this reservation. Return their result.
    const existing = await store.awaitReservation(idempotencyKey, memberId);
    if (existing && existing.state === 'failed') {
      return { ok: false, code: RESERVE.CAP_EXCEEDED, reservation: existing };
    }
    return { ok: true, code: RESERVE.ALREADY_RESERVED, reservation: existing };
  }

  // 2. We own the claim: take the caps atomically, rolling back on any failure.
  const incremented = [];
  for (const scope of scopes) {
    if (scope.limit == null) continue;
    const ok = await store.incrementIfBelow(scope.key, Number(scope.limit));
    if (!ok) {
      for (const s of incremented) await store.decrement(s.key);
      // Record the failed outcome so concurrent duplicates see it (idempotent).
      const failed = await store.putReservation({
        idempotency_key: idempotencyKey, lead_id: leadId, route_member_id: memberId,
        price: Number(price), scopes: [], state: 'failed',
      });
      return { ok: false, code: RESERVE.CAP_EXCEEDED, scope: scope.key, reservation: failed };
    }
    incremented.push(scope);
  }

  const rec = await store.putReservation({
    idempotency_key: idempotencyKey, lead_id: leadId, route_member_id: memberId,
    price: Number(price), scopes: incremented.map((s) => s.key), state: 'reserved',
  });
  return { ok: true, code: RESERVE.OK, reservation: rec };
}

// FINALIZE on accepted delivery: capacity consumed once, kept. Idempotent.
export async function finalize(store, reservation) {
  if (!reservation || reservation.state === 'finalized') return reservation;
  if (reservation.state !== 'reserved') return reservation; // released/failed cannot finalize
  await store.updateReservation(reservation.id, { state: 'finalized' });
  return { ...reservation, state: 'finalized' };
}

// RELEASE on failed/rejected delivery: give capacity back exactly once. Idempotent.
export async function release(store, reservation) {
  if (!reservation || reservation.state !== 'reserved') return reservation;
  for (const key of reservation.scopes || []) await store.decrement(key);
  await store.updateReservation(reservation.id, { state: 'released' });
  return { ...reservation, state: 'released' };
}
