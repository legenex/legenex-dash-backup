// Retry worker. Claims due delivery attempts with an atomic CAS lease so two
// concurrent workers never send the same attempt, re-delivers via the injected
// deliverFn, applies bounded backoff with jitter, promotes to dead-letter at the
// attempt cap, and updates the destination circuit breaker. Also exposes a manual
// (operator-authorized) retry entry point. Pure of ambient time and randomness:
// nowMs and rng are injected.

import { computeBackoffMs, ATTEMPT_STATUS } from './deliveryAttempt.js';

// Deterministic default jitter derived from the attempt id, so tests are stable.
function seededUnit(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % 1000) / 1000;
}

// Full-jitter within [0.5x, 1.0x] of the exponential backoff, capped at maxMs.
export function backoffWithJitter(attemptNumber, seed, opts = {}) {
  const base = computeBackoffMs(attemptNumber, opts);
  const u = opts.rng ? opts.rng() : seededUnit(`${seed}:${attemptNumber}`);
  return Math.min(opts.maxMs ?? 3600000, Math.round(base * (0.5 + 0.5 * u)));
}

// Process one worker pass over the due queue. deliverFn(attempt) -> { status,
// retryable } re-sends using the stored attempt (the caller wires directPost).
export async function runRetryWorker(store, deliverFn, ctx) {
  const { nowMs, workerId, leaseMs = 30000, healthStore, maxAttempts = 5, retryOpts = {} } = ctx;
  const due = await store.listDue(nowMs);
  const processed = [];
  for (const a of due) {
    const won = await store.claimLease(a.id, workerId, nowMs, leaseMs);
    if (!won) continue; // another worker owns this attempt
    const nextAttemptNum = (a.attempt_number || 1) + 1;
    const res = await deliverFn({ ...a, attempt_number: nextAttemptNum });
    const success = res.status === ATTEMPT_STATUS.ACCEPTED;
    if (healthStore) await healthStore.recordResult(a.destination_id, success, nowMs, ctx.healthOpts);

    if (success || res.status === ATTEMPT_STATUS.REJECTED || res.status === ATTEMPT_STATUS.DUPLICATE) {
      await store.updateAttempt(a.id, { status: res.status, next_retry_at: null, lease_until: null });
    } else if (nextAttemptNum >= maxAttempts) {
      await store.updateAttempt(a.id, { status: ATTEMPT_STATUS.DEAD_LETTER, next_retry_at: null, lease_until: null, attempt_number: nextAttemptNum });
    } else {
      const delay = backoffWithJitter(nextAttemptNum, a.id, retryOpts);
      await store.updateAttempt(a.id, {
        status: ATTEMPT_STATUS.ERROR, attempt_number: nextAttemptNum,
        next_retry_at: new Date(nowMs + delay).toISOString(), lease_until: null,
      });
    }
    processed.push({ id: a.id, worker: workerId, status: res.status });
  }
  return processed;
}

// Operator-authorized manual retry of a single attempt. Authorization is enforced
// by the calling backend function; this only performs the send + bookkeeping.
export async function manualRetry(store, attemptId, deliverFn, ctx) {
  const a = await store.getAttempt(attemptId);
  if (!a) return { ok: false, reason: 'not_found' };
  const won = await store.claimLease(attemptId, ctx.workerId || 'manual', ctx.nowMs, ctx.leaseMs || 30000);
  if (!won) return { ok: false, reason: 'leased' };
  const res = await deliverFn({ ...a, attempt_number: (a.attempt_number || 1) + 1 });
  await store.updateAttempt(attemptId, {
    status: res.status, lease_until: null,
    next_retry_at: res.status === ATTEMPT_STATUS.ERROR ? new Date(ctx.nowMs).toISOString() : null,
  });
  if (ctx.healthStore) await ctx.healthStore.recordResult(a.destination_id, res.status === ATTEMPT_STATUS.ACCEPTED, ctx.nowMs, ctx.healthOpts);
  return { ok: true, status: res.status };
}
