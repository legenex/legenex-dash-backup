// Shadow evaluation orchestration, consumed by processLead via the generated
// bundle (so processLead calls the ONE canonical engine, not a mirror). Fully
// isolated: it writes ONLY RouteDecisionTrace, never touches the legacy outcome
// or the supplier response, and any error is recorded to the trace rather than
// swallowed silently or allowed to escape.
//
// Inert by default: when distribution_mode === 'legacy_only' it returns
// immediately without any read or write. When no active RouteGroup exists it
// skips the snapshot load entirely (cheap cached existence check).

import { routeWaterfall } from './engine.js';
import { evalConditionTree } from './conditions.js';
import { loadRoutingSnapshot, hasActiveRouteGroup } from './snapshotLoader.js';

export async function runShadow(db, ctx) {
  const { distributionMode, leadData, campaignId, idempotencyKey } = ctx;
  const clock = ctx.clock || (() => Date.now());
  const nowMs = ctx.nowMs ?? clock();

  // 1. Inert when legacy_only (production default). No read, no write.
  if (distributionMode === 'legacy_only' || !distributionMode) return { ran: false, reason: 'legacy_only' };

  try {
    // 2. Skip the whole load when there is no active config (cached existence check).
    const hasGroups = await hasActiveRouteGroup(db, campaignId, nowMs);
    if (!hasGroups) {
      await db.entities.RouteDecisionTrace.create({
        lead_id: ctx.leadId, distribution_mode: distributionMode, result: 'no_route_config',
        winner_member_id: '', evaluated_candidates: '[]', fallthrough_path: '[]',
        config_version: null, eval_latency_ms: 0, created_at: new Date(nowMs).toISOString(),
      });
      return { ran: false, reason: 'no_route_config' };
    }

    // 3. Load snapshot (bounded/paginated) and run the canonical engine.
    const t0 = clock();
    const snap = await loadRoutingSnapshot(db, { campaignId, nowMs });
    const decision = routeWaterfall(snap.groups, leadData || {}, {
      idempotencyKey, evalConditions: (t, d) => evalConditionTree(t, d, { nowMs }),
    });
    const latency = clock() - t0;

    await db.entities.RouteDecisionTrace.create({
      lead_id: ctx.leadId, idempotency_key: idempotencyKey || null, distribution_mode: distributionMode,
      evaluated_candidates: JSON.stringify(flattenTrace(decision.trace)),
      winner_member_id: decision.winner ? decision.winner.id : '',
      winning_group_id: decision.groupId || '',
      price: decision.winner ? decision.price : 0,
      fallthrough_path: JSON.stringify(decision.fallthroughPath || []),
      result: decision.winner ? 'shadow_selected' : (decision.reason || 'no_eligible_member'),
      config_version: (decision.winner && decision.configHash) || snap.configHash || null,
      eval_latency_ms: latency,
      created_at: new Date(nowMs).toISOString(),
    });
    return { ran: true, latencyMs: latency, winner: decision.winner ? decision.winner.id : null };
  } catch (err) {
    // Record the error to the trace. Never swallow silently, never rethrow.
    try {
      await db.entities.RouteDecisionTrace.create({
        lead_id: ctx.leadId, distribution_mode: distributionMode, result: 'evaluation_error',
        winner_member_id: '', evaluated_candidates: '[]', fallthrough_path: '[]',
        error_message: String(err && err.message ? err.message : err).slice(0, 300),
        created_at: new Date(nowMs).toISOString(),
      });
    } catch { /* trace write itself failed; nothing else we can safely do */ }
    return { ran: false, reason: 'evaluation_error', error: String(err && err.message ? err.message : err) };
  }
}

function flattenTrace(trace) {
  const out = [];
  for (const g of trace || []) for (const c of g.candidates || []) {
    out.push({ group_id: g.groupId, member_id: c.memberId, eligible: c.eligible, reason_code: c.reason, price: c.price });
  }
  return out;
}
