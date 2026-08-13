// Direct-post distribution orchestrator. Composes the pure routing engine with a
// delivery function to run the full approved workflow end to end:
//
//   campaign eligibility
//   -> eligible destinations
//   -> order by the group's routing method
//   -> submit to each in order
//   -> record the request/response (the injected deliver does this)
//   -> process acceptance or rejection
//   -> retry the same destination, or fall through to the next, when permitted
//   -> save the final distribution result
//
// Pure: nowMs, the deliver function, and evalConditions are all injected, so the
// same orchestrator runs in production (wired to deliverDirectPost) and in tests
// (wired to a scripted deliver or a mock-fetch deliverDirectPost). It performs no
// I/O of its own and reads no ambient clock.

import { evaluateMember, resolvePrice, selectWeighted, REASON } from './engine.js';
import { ATTEMPT_STATUS } from './deliveryAttempt.js';

const groupOrder = (g) => (g.orderIndex ?? g.order_index ?? 0);

// Deterministic weighted permutation: repeatedly draw by seeded weight from the
// remaining members, so higher-weight destinations tend to come first while the
// order stays reproducible for a given seed.
function weightedPermutation(members, seedKey) {
  const remaining = [...members];
  const out = [];
  let i = 0;
  while (remaining.length) {
    const pick = selectWeighted(remaining, `${seedKey}:${i++}`) || remaining[0];
    out.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return out;
}

// Order already-eligible members within one group by its routing method.
export function orderEligible(group, members, seed = {}) {
  const list = [...members];
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  switch (group.method) {
    case 'auction':
      return list.sort((a, b) => resolvePrice(b) - resolvePrice(a) || (a.priority ?? Infinity) - (b.priority ?? Infinity) || byId(a, b));
    case 'hybrid': {
      const priceW = group.price_weight ?? group.weights?.price ?? 0.5;
      const prioW = group.priority_weight ?? group.weights?.priority ?? 0.5;
      const prices = list.map(resolvePrice);
      const maxPrice = Math.max(1, ...prices);
      const maxPrio = Math.max(1, ...list.map((m) => m.priority ?? 1));
      return list
        .map((m, i) => ({ m, s: priceW * (prices[i] / maxPrice) + prioW * (1 - ((m.priority ?? 1) - 1) / maxPrio) }))
        .sort((a, b) => b.s - a.s || byId(a.m, b.m))
        .map((x) => x.m);
    }
    case 'round_robin': {
      const ordered = [...list].sort(byId);
      if (!ordered.length) return ordered;
      const cur = ((Number(seed.rrCursor) || 0) % ordered.length + ordered.length) % ordered.length;
      return ordered.slice(cur).concat(ordered.slice(0, cur));
    }
    case 'weighted':
      return weightedPermutation(list, String(seed.key || ''));
    case 'priority':
    default:
      return list.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || byId(a, b));
  }
}

// Run the full distribution workflow for one lead.
// input:
//   campaign        optional { active, status } - campaign-level gate
//   groups          [{ id, method, active, order_index, price_weight, priority_weight, members:[member] }]
//   lead            normalized lead data object
//   seed            { key, rrCursor } deterministic tie-breaks for weighted/round_robin
//   nowMs           evaluation clock (accident-date + schedule already resolved on members)
//   evalConditions  (tree, lead) => boolean, for buyer qualification trees
//   deliver         async (member, meta) => { status, revenue?, httpStatus?, errorClass?, retryable?, payload?, response? }
//   maxAttemptsPerDest  retry cap per destination on transient ERROR (default 1 = no retry)
//   terminalOnDuplicate whether a DUPLICATE stops the waterfall (default true)
// Returns a full distribution result record.
export async function distributeLead(input) {
  const {
    campaign, groups = [], lead = {}, seed = {}, nowMs = 0, evalConditions,
    deliver, maxAttemptsPerDest = 1, terminalOnDuplicate = true,
  } = input;

  const result = {
    campaign_eligible: true,
    candidates: [],       // every member evaluated, with eligibility + reason
    ordered: [],          // eligible member ids in submit order
    attempts: [],         // one row per delivery attempt
    winner: null,
    price: 0,
    revenue: 0,
    finalStatus: 'NoEligibleDestination',
    reason: null,
  };

  // 1. Campaign eligibility.
  if (campaign && (campaign.active === false || (campaign.status && campaign.status !== 'active'))) {
    result.campaign_eligible = false;
    result.finalStatus = 'CampaignInactive';
    result.reason = 'CAMPAIGN_INACTIVE';
    return result;
  }

  // 2. Eligible destinations, ordered by routing method, across active groups.
  const orderedGroups = groups.filter((g) => g.active !== false).sort((a, b) => groupOrder(a) - groupOrder(b));
  const ordered = [];
  for (const g of orderedGroups) {
    const evals = (g.members || []).map((m) => ({
      m,
      res: evaluateMember(m, lead, { enforceReserve: g.method === 'auction', evalConditions, nowMs }),
    }));
    for (const e of evals) {
      result.candidates.push({ group_id: g.id, member_id: e.m.id, eligible: e.res.eligible, reason: e.res.reason, price: resolvePrice(e.m) });
    }
    const eligible = evals.filter((e) => e.res.eligible).map((e) => e.m);
    for (const m of orderEligible(g, eligible, seed)) ordered.push({ group: g, member: m });
  }
  result.ordered = ordered.map((o) => o.member.id);

  if (!ordered.length) {
    result.finalStatus = 'NoEligibleDestination';
    result.reason = REASON.NO_ELIGIBLE_MEMBER;
    return result;
  }

  // 3-4. Submit in order; process acceptance/rejection; retry or fall through.
  for (const cand of ordered) {
    let attempt = 1;
    while (true) {
      const out = await deliver(cand.member, { attemptNumber: attempt, group: cand.group, lead, nowMs, seed });
      result.attempts.push({
        member_id: cand.member.id, attempt, status: out.status,
        http_status: out.httpStatus ?? null, error_class: out.errorClass ?? null,
        revenue: out.revenue ?? 0, payload: out.payload ?? null, response: out.response ?? null,
      });

      if (out.status === ATTEMPT_STATUS.ACCEPTED) {
        result.winner = cand.member.id;
        result.price = resolvePrice(cand.member);
        result.revenue = out.revenue ?? 0;
        result.finalStatus = 'Sold';
        result.reason = 'ACCEPTED';
        return result;
      }
      if (out.status === ATTEMPT_STATUS.DUPLICATE && terminalOnDuplicate) {
        result.winner = cand.member.id;
        result.finalStatus = 'Duplicate';
        result.reason = 'DUPLICATE';
        return result;
      }
      // Retry the SAME destination only on a transient, retryable ERROR within cap.
      if (out.status === ATTEMPT_STATUS.ERROR && out.retryable && attempt < maxAttemptsPerDest) {
        attempt += 1;
        continue;
      }
      // Rejected, queued, non-terminal duplicate, or exhausted error: next destination.
      break;
    }
  }

  // 5. Save the final result: every ordered destination was tried, none sold.
  result.finalStatus = 'Exhausted';
  result.reason = 'ALL_DESTINATIONS_EXHAUSTED';
  return result;
}
