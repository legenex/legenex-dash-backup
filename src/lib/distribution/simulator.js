// Route simulator. Runs the pure routing engine over a SAFE test payload and
// returns a full, human-readable explanation with ZERO side effects: it never
// sends, reserves, bills, or writes anything. Output is explicitly marked as
// simulated/test so it can never be mistaken for a real decision or counted in
// metrics.

import { routeWaterfall, resolvePrice, REASON } from './engine.js';
import { evalConditionTree } from './conditions.js';
import { isWithinSchedule } from './schedule.js';

const REASON_TEXT = {
  ELIGIBLE: 'Eligible',
  MEMBER_INACTIVE: 'Route member is inactive',
  BUYER_LIFECYCLE_INELIGIBLE: 'Buyer is paused/terminated or has contradictory lifecycle fields',
  OUTSIDE_SCHEDULE: 'Outside the operating schedule',
  FILTER_STATE: 'State not covered', FILTER_ZIP: 'ZIP not covered', FILTER_COUNTY: 'County not covered',
  FILTER_VERTICAL: 'Vertical not accepted', FILTER_BRAND: 'Brand not accepted',
  FILTER_SUPPLIER: 'Supplier not accepted', FILTER_SOURCE: 'Source not accepted',
  QUALIFICATION_FAILED: 'Failed buyer qualification rules',
  SUPPRESSED: 'Lead is on the suppression list',
  CAP_TOTAL: 'Total cap reached', CAP_HOURLY: 'Hourly cap reached', CAP_DAILY: 'Daily cap reached',
  CAP_WEEKLY: 'Weekly cap reached', CAP_MONTHLY: 'Monthly cap reached',
  LOW_BALANCE: 'Wallet balance below lead price', OVER_CREDIT_LIMIT: 'Would exceed credit limit',
  DESTINATION_UNHEALTHY: 'Destination circuit breaker is open',
  BELOW_RESERVE: 'Bid/price below reserve', NO_ELIGIBLE_MEMBER: 'No eligible route member',
};

// Pre-resolve per-member schedule flags from each member's own schedule config so
// evaluateMember stays pure (it only reads member.withinSchedule).
function prepareGroups(groups, nowMs, timezone) {
  return (groups || []).map((g) => ({
    ...g,
    members: (g.members || []).map((m) => ({
      ...m,
      withinSchedule: m.schedule ? isWithinSchedule(nowMs, m.schedule, timezone) : m.withinSchedule,
    })),
  }));
}

// config = { groups }. lead = test payload. opts = { nowMs, timezone, idempotencyKey, rrCursors }.
export function simulateRoute(config, lead, opts = {}) {
  const nowMs = opts.nowMs ?? 0;
  const groups = prepareGroups(config.groups, nowMs, opts.timezone);
  const evalConditions = (tree, data) => evalConditionTree(tree, data, { nowMs });

  const result = routeWaterfall(groups, lead, {
    idempotencyKey: opts.idempotencyKey,
    rrCursors: opts.rrCursors,
    evalConditions,
  });

  const explanation = result.trace.map((grp) => ({
    groupId: grp.groupId,
    method: grp.method,
    candidates: grp.candidates.map((c) => ({
      memberId: c.memberId,
      eligible: c.eligible,
      reason: c.reason,
      reasonText: REASON_TEXT[c.reason] || c.reason,
      price: c.price,
    })),
  }));

  const winner = result.winner || null;
  return {
    simulated: true,
    sideEffects: 'none',
    testPayload: true,
    input: lead,
    decision: winner
      ? {
          winnerMemberId: winner.id,
          buyerId: winner.buyerId ?? null,
          groupId: result.groupId,
          method: result.method,
          price: resolvePrice(winner),
          fallthroughPath: result.fallthroughPath,
          wouldReserveCapsFor: winner.id, // reservation is NOT performed here
        }
      : { winnerMemberId: null, reason: result.reason || REASON.NO_ELIGIBLE_MEMBER },
    explanation,
  };
}
