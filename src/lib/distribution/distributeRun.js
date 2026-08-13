// Live distribution orchestrator. This is the missing link between the pure
// routing engine and a real outbound post: it loads the published snapshot, runs
// the approved waterfall (distributeLead), and for each destination reserves cap,
// posts via the direct-post adapter, then finalizes or releases.
//
// Design rules held here:
// - ONE canonical engine. This composes the existing pure modules; it re-implements
//   nothing (no second copy of eligibility, ordering, pricing, or classification).
// - Structurally single-delivery. distributeLead stops at the first ACCEPTED, and a
//   reservation is finalized only on that accept, so no lead is sold twice.
// - Fail closed. Any load or evaluation failure returns a clean, non-delivered
//   status so the caller may fall back to legacy without risking a double send.
// - No secrets. The credential is an opaque ref resolved at send time by the
//   adapter via the injected resolveCredential.
// - Pure of ambient time and network: nowMs, fetchImpl and resolveCredential are
//   injected, so the same orchestrator runs in Deno and in tests.

import { distributeLead } from './distribute.js';
import { capWindowStart, resolvePrice } from './engine.js';
import { evalConditionTree } from './conditions.js';
import { loadRoutingSnapshot, hasActiveRouteGroup } from './snapshotLoader.js';
import { deliverDirectPost } from './directPost.js';
import { makeBase44AttemptStore } from './deliveryStore.js';
import { makeBase44CapStore } from './capStore.js';
import { makeBase44WalletStore } from './walletStore.js';
import { walletDebit } from './walletLedger.js';
import { reserve, finalize, release, RESERVE } from './reservation.js';
import { ATTEMPT_STATUS } from './deliveryAttempt.js';

// Outcome categories the caller (processLead) reads to decide on legacy fallback.
// These line up with modeControl.shouldFallback: only clean non-deliveries qualify.
export const RUN = {
  ACCEPTED: 'accepted',
  DUPLICATE: 'duplicate',
  NO_ELIGIBLE: 'no_eligible_member',
  REJECTED: 'rejected',
  ERROR_CLEAN: 'error_clean',
  AMBIGUOUS: 'ambiguous',
  SKIPPED: 'skipped',
};

const CAP_WINDOWS = ['total', 'hourly', 'daily', 'weekly', 'monthly'];

// Build the cap scopes for one member from its resolved caps snapshot. Keys are
// window-bucketed so a new day starts a new counter. A window with no limit is
// unlimited and produces no scope.
export function capScopesFor(member, nowMs, tzOffsetMinutes = 0) {
  const scopes = [];
  const caps = member.caps || {};
  for (const w of CAP_WINDOWS) {
    const cfg = caps[w];
    if (!cfg || cfg.limit == null) continue;
    const bucket = w === 'total' ? 'all' : capWindowStart(nowMs, w, tzOffsetMinutes);
    scopes.push({
      key: `route_member:${member.id}:${w}:${bucket}`,
      limit: Number(cfg.limit),
      window: w,
      windowStart: w === 'total' ? null : bucket,
      memberId: member.id,
    });
  }
  return scopes;
}

// Wallet policy for a sale. Two distinct questions, deliberately separated:
//   accounting - do we record the movement? (yes for any balance-run buyer)
//   enforcement - may the debit be refused? (only with an explicit credit_limit)
// A prepay buyer with no configured limit is recorded and allowed to go negative
// rather than having the sale blocked. Invoiced buyers with no limit are billed
// downstream and touch no wallet at all.
function walletPolicyFor(member) {
  const w = member.wallet;
  if (!w) return null;
  if (w.enforce && w.creditLimit != null) return { creditLimit: Number(w.creditLimit) };
  if (w.mode === 'prepaid') return { creditLimit: Infinity }; // record, never refuse
  return null;
}

// Per-destination delivery step: reserve -> post -> finalize or release.
// `sink` collects out-of-band outcomes (the wallet decision) that the attempt
// rows in the waterfall result do not carry.
function makeDeliver({ db, stores, ctx, sink }) {
  const { attemptStore, capStore, walletStore } = stores;
  return async function deliver(member, meta) {
    const nowMs = ctx.nowMs;
    const price = resolvePrice(member);
    const memberKey = `${ctx.idempotencyKey}:${member.id}`;

    // 1. Reserve capacity atomically before any outbound request.
    const scopes = capScopesFor(member, nowMs, ctx.tzOffsetMinutes || 0);
    let reservation = null;
    if (scopes.length) {
      const res = await reserve(capStore, {
        idempotencyKey: ctx.idempotencyKey, leadId: ctx.leadId, memberId: member.id, price, scopes,
      });
      if (!res.ok) {
        return { status: ATTEMPT_STATUS.REJECTED, reason: res.code || RESERVE.CAP_EXCEEDED, revenue: 0, retryable: false };
      }
      reservation = res.reservation;
      // An idempotent replay must not post the same lead to the same buyer twice.
      if (res.code === RESERVE.ALREADY_RESERVED) {
        return { status: ATTEMPT_STATUS.REJECTED, reason: 'ALREADY_RESERVED', revenue: 0, retryable: false };
      }
    }

    // 2. Post. The member's canonical endpoint cfg came from the SubDelivery.
    const cfg = member.delivery;
    if (!cfg || !cfg.targetUrl) {
      if (reservation) await release(capStore, reservation);
      return { status: ATTEMPT_STATUS.ERROR, errorClass: 'no_endpoint', revenue: 0, retryable: false };
    }

    let out;
    try {
      out = await deliverDirectPost({
        ...cfg,
        destinationId: member.destinationId || null,
        leadId: ctx.leadId,
        leadData: ctx.leadData,
        idempotencyKey: memberKey,
        attemptNumber: meta.attemptNumber || 1,
        isPrimary: (meta.attemptNumber || 1) === 1,
        trigger: 'primary',
      }, {
        store: attemptStore,
        nowMs,
        fetchImpl: ctx.fetchImpl,
        testMode: !!ctx.testMode,
        allowlistHosts: ctx.allowlistHosts || [],
        resolveCredential: ctx.resolveCredential,
      });
    } catch (err) {
      if (reservation) await release(capStore, reservation);
      return {
        status: ATTEMPT_STATUS.ERROR,
        errorClass: String((err && err.message) || err).slice(0, 60),
        revenue: 0, retryable: false,
      };
    }

    // 3. Settle the reservation on the real outcome.
    if (out.status === ATTEMPT_STATUS.ACCEPTED) {
      if (reservation) await finalize(capStore, reservation);
      const policy = walletPolicyFor(member);
      if (policy && price > 0) {
        try {
          const debit = await walletDebit(walletStore, {
            buyerId: member.buyerId, amount: price, idempotencyKey: `sale:${memberKey}`,
            creditLimit: policy.creditLimit, type: 'debit', description: `lead ${ctx.leadId}`,
          });
          out.balanceDecision = debit.applied ? 'debited' : (debit.duplicate ? 'duplicate' : (debit.code || 'not_applied'));
        } catch {
          // Billing must never unsell a delivered lead. Record and move on.
          out.balanceDecision = 'debit_error';
        }
        if (sink) sink.balanceDecision = out.balanceDecision;
      } else if (sink) {
        sink.balanceDecision = 'not_applicable';
      }
    } else if (reservation) {
      await release(capStore, reservation);
    }

    return {
      status: out.status,
      revenue: out.revenue || 0,
      httpStatus: out.httpStatus ?? null,
      errorClass: out.errorClass ?? null,
      retryable: !!out.retryable,
      attemptId: out.attemptId,
      buyerLeadId: out.buyerLeadId ?? null,
      balanceDecision: out.balanceDecision ?? null,
    };
  };
}

// Map the waterfall result onto the caller-facing outcome category.
function toRunStatus(result) {
  switch (result.finalStatus) {
    case 'Sold': return RUN.ACCEPTED;
    case 'Duplicate': return RUN.DUPLICATE;
    case 'NoEligibleDestination': return RUN.NO_ELIGIBLE;
    case 'CampaignInactive': return RUN.NO_ELIGIBLE;
    case 'Exhausted': {
      // Exhausted is a clean non-delivery ONLY when nothing ambiguous happened.
      // A timeout or aborted request might have been received by the buyer, so it
      // is ambiguous and must never trigger a legacy re-send.
      const ambiguous = (result.attempts || []).some(
        (a) => a.status === ATTEMPT_STATUS.ERROR && ['timeout', 'network_error'].includes(String(a.error_class || '')),
      );
      if (ambiguous) return RUN.AMBIGUOUS;
      const anyDelivered = (result.attempts || []).some((a) => a.status === ATTEMPT_STATUS.REJECTED);
      return anyDelivered ? RUN.REJECTED : RUN.ERROR_CLEAN;
    }
    default: return RUN.ERROR_CLEAN;
  }
}

// Run one lead through live distribution.
// ctx: { leadId, campaignId, idempotencyKey, leadData, nowMs, distributionMode,
//        fetchImpl, resolveCredential, testMode, allowlistHosts, tzOffsetMinutes }
// Returns { ran, status, winnerMemberId, buyerId, price, revenue, result }.
export async function runDistribution(db, ctx) {
  const nowMs = ctx.nowMs ?? 0;
  const trace = async (patch) => {
    try {
      await db.entities.RouteDecisionTrace.create({
        lead_id: ctx.leadId,
        idempotency_key: ctx.idempotencyKey || null,
        distribution_mode: ctx.distributionMode || 'unknown',
        created_at: new Date(nowMs).toISOString(),
        ...patch,
      });
    } catch { /* trace write failed; never break the delivery path */ }
  };

  try {
    const hasGroups = ctx.snapshot ? true : await hasActiveRouteGroup(db, ctx.campaignId, nowMs);
    if (!hasGroups) {
      await trace({ result: 'no_route_config', winner_member_id: '', evaluated_candidates: '[]', fallthrough_path: '[]' });
      return { ran: false, status: RUN.NO_ELIGIBLE, reason: 'no_route_config' };
    }

    const snap = ctx.snapshot || await loadRoutingSnapshot(db, { campaignId: ctx.campaignId, nowMs });
    // Real Base44 adapters in production; tests inject in-memory equivalents.
    const stores = ctx.stores || {
      attemptStore: makeBase44AttemptStore(db),
      capStore: makeBase44CapStore(db),
      walletStore: makeBase44WalletStore(db),
    };

    const t0 = nowMs;
    const sink = {};
    const result = await distributeLead({
      campaign: ctx.campaign || null,
      groups: snap.groups,
      lead: ctx.leadData || {},
      seed: { key: ctx.idempotencyKey || '' },
      nowMs,
      evalConditions: (t, d) => evalConditionTree(t, d, { nowMs }),
      deliver: makeDeliver({ db, stores, ctx: { ...ctx, nowMs }, sink }),
      maxAttemptsPerDest: ctx.maxAttemptsPerDest || 1,
    });

    const status = toRunStatus(result);
    const winnerRow = result.winner
      ? (snap.groups.flatMap((g) => g.members).find((m) => m.id === result.winner) || null)
      : null;

    await trace({
      result: status,
      evaluated_candidates: JSON.stringify(result.candidates || []),
      winner_member_id: result.winner || '',
      price: result.price || 0,
      fallthrough_path: JSON.stringify(result.ordered || []),
      config_version: snap.configHash || null,
      balance_decision: sink.balanceDecision || null,
      eval_latency_ms: nowMs - t0,
    });

    return {
      ran: true,
      status,
      winnerMemberId: result.winner || null,
      buyerId: winnerRow ? winnerRow.buyerId : null,
      subDeliveryId: winnerRow ? winnerRow.subDeliveryId : null,
      price: result.price || 0,
      revenue: result.revenue || 0,
      result,
    };
  } catch (err) {
    // Nothing was delivered on this path (any post failure is caught inside
    // deliver and surfaces as an attempt, not a throw), so this is clean.
    await trace({
      result: 'evaluation_error', winner_member_id: '', evaluated_candidates: '[]', fallthrough_path: '[]',
      error_message: String((err && err.message) || err).slice(0, 300),
    });
    return { ran: false, status: RUN.ERROR_CLEAN, reason: 'evaluation_error', error: String((err && err.message) || err) };
  }
}
