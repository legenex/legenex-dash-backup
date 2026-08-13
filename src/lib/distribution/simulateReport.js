// Operator route simulation against the REAL published config. Loads the actual
// snapshot through the same loader as production, runs the canonical engine, and
// returns a redacted trace with per-candidate eligibility (incl. cap and wallet
// reasons) and config identity. Performs ZERO writes and ZERO sends: it only reads.

import { routeWaterfall } from './engine.js';
import { evalConditionTree } from './conditions.js';
import { loadRoutingSnapshot } from './snapshotLoader.js';

const REASON_TEXT = {
  ELIGIBLE: 'Eligible', MEMBER_INACTIVE: 'Route member inactive',
  BUYER_LIFECYCLE_INELIGIBLE: 'Buyer not active', OUTSIDE_SCHEDULE: 'Outside schedule',
  FILTER_STATE: 'State not covered', FILTER_ZIP: 'ZIP not covered', FILTER_COUNTY: 'County not covered',
  FILTER_VERTICAL: 'Vertical not accepted', FILTER_BRAND: 'Brand not accepted',
  FILTER_SUPPLIER: 'Supplier not accepted', FILTER_SOURCE: 'Source not accepted',
  QUALIFICATION_FAILED: 'Failed qualification', SUPPRESSED: 'Suppressed',
  CAP_TOTAL: 'Total cap reached', CAP_HOURLY: 'Hourly cap reached', CAP_DAILY: 'Daily cap reached',
  CAP_WEEKLY: 'Weekly cap reached', CAP_MONTHLY: 'Monthly cap reached',
  LOW_BALANCE: 'Wallet balance too low', OVER_CREDIT_LIMIT: 'Over credit limit',
  DESTINATION_UNHEALTHY: 'Destination circuit open', BELOW_RESERVE: 'Below reserve',
  NO_ELIGIBLE_MEMBER: 'No eligible route member',
};

// db is base44.asServiceRole (reads only). Returns a simulated result. No writes.
export async function runSimulation(db, { campaignId, leadData, nowMs }) {
  const snap = await loadRoutingSnapshot(db, { campaignId, nowMs });
  const decision = routeWaterfall(snap.groups, leadData || {}, {
    idempotencyKey: 'simulate', evalConditions: (t, d) => evalConditionTree(t, d, { nowMs }),
  });
  const explanation = (decision.trace || []).map((g) => ({
    groupId: g.groupId, method: g.method,
    candidates: (g.candidates || []).map((c) => ({
      memberId: c.memberId, eligible: c.eligible, reason: c.reason,
      reasonText: REASON_TEXT[c.reason] || c.reason, price: c.price,
    })),
  }));
  return {
    simulated: true,
    sideEffects: 'none',
    configVersion: snap.configHash,
    configErrors: snap.configErrors,
    decision: decision.winner
      ? { winnerMemberId: decision.winner.id, buyerId: decision.winner.buyerId ?? null,
          groupId: decision.groupId, method: decision.method, price: decision.price,
          fallthroughPath: decision.fallthroughPath }
      : { winnerMemberId: null, reason: decision.reason || 'NO_ELIGIBLE_MEMBER' },
    explanation,
  };
}
