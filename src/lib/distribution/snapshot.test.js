import { describe, it, expect } from 'vitest';
import { buildRoutingSnapshot } from './snapshot.js';
import { routeWaterfall, REASON } from './engine.js';
import { evalConditionTree } from './conditions.js';

// Fixtures use the ACTUAL snake_case Base44 entity field names.
const CAMPAIGN = 'camp1';
const NOW = Date.UTC(2026, 6, 13, 14, 0, 0); // Mon 14:00 UTC

function group(over = {}) {
  return { id: 'g1', campaign_id: CAMPAIGN, name: 'G1', method: 'priority', order_index: 0, active: true, lifecycle: 'active', ...over };
}
function member(over = {}) {
  return {
    id: 'm1', route_group_id: 'g1', buyer_id: 'b1', destination_id: 'd1', active: true, priority: 1,
    price_mode: 'fixed', fixed_price: 10, ...over,
  };
}
function buyer(over = {}) { return { id: 'b1', status: 'active', active: true, billing_type: 'prepay', prepay_balance: 1000, ...over }; }
function dest(over = {}) { return { id: 'd1', ...over }; }

function snap(records, over = {}) {
  return buildRoutingSnapshot(
    { groups: [group()], members: [member()], buyers: [buyer()], destinations: [dest()], health: [], ...records },
    { campaignId: CAMPAIGN, nowMs: NOW, capCountsFor: () => 0, ...over },
  );
}
function decide(s) {
  return routeWaterfall(s.groups, { state: 'TX', vertical: 'legal' }, {
    idempotencyKey: 'k', evalConditions: (t, d) => evalConditionTree(t, d, { nowMs: NOW }),
  });
}

describe('buildRoutingSnapshot -> engine (Phase 3 required fixtures)', () => {
  it('happy path routes to the member', () => {
    const s = snap({});
    expect(s.configErrors).toEqual([]);
    expect(decide(s).winner?.id).toBe('m1');
  });

  it('paused buyer with active=true fails closed', () => {
    const s = snap({ buyers: [buyer({ status: 'paused', active: true })] });
    expect(decide(s).trace[0].candidates[0].reason).toBe(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  });

  it('missing buyer -> CONFIG_INVALID + ineligible', () => {
    const s = snap({ buyers: [] });
    expect(s.configErrors.some((e) => e.detail === 'missing buyer')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('missing destination -> CONFIG_INVALID + ineligible', () => {
    const s = snap({ destinations: [] });
    expect(s.configErrors.some((e) => e.detail === 'missing destination')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('draft group with active=true is excluded (PB-003)', () => {
    const s = snap({ groups: [group({ lifecycle: 'draft' })] });
    expect(s.groups).toHaveLength(0);
    expect(decide(s).winner).toBe(null);
  });

  it('wrong campaign is excluded', () => {
    const s = snap({ groups: [group({ campaign_id: 'other' })] });
    expect(s.groups).toHaveLength(0);
  });

  it('invalid filters JSON -> CONFIG_INVALID + ineligible, never unrestricted', () => {
    const s = snap({ members: [member({ filters: '{bad json' })] });
    expect(s.configErrors.some((e) => e.detail === 'bad filters json')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('unknown condition operator -> CONFIG_INVALID + ineligible', () => {
    const s = snap({ members: [member({ conditions: JSON.stringify({ field: 'age', operator: 'wat', value: 1 }) })] });
    expect(s.configErrors.some((e) => e.detail === 'unknown condition operator')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('expired schedule -> OUTSIDE_SCHEDULE', () => {
    // Sunday-only window, but NOW is Monday
    const sched = JSON.stringify({ timezone: 'UTC', windows: [{ days: [0], start: '00:00', end: '24:00' }] });
    const s = snap({ members: [member({ schedule: sched })] });
    expect(decide(s).trace[0].candidates[0].reason).toBe(REASON.OUTSIDE_SCHEDULE);
  });

  it('cap rollover / exhausted -> CAP_DAILY', () => {
    const s = snap({ members: [member({ caps: JSON.stringify({ daily: { limit: 5 } }) })] }, { capCountsFor: () => 5 });
    expect(decide(s).trace[0].candidates[0].reason).toBe(REASON.CAP_DAILY);
  });

  // Balance gating is opt-in (12 Aug 2026): without an explicit credit_limit an
  // underfunded prepay buyer is still eligible and is billed downstream.
  it('low prepaid balance and NO credit limit -> still ELIGIBLE', () => {
    const s = snap({ members: [member({ fixed_price: 50 })], buyers: [buyer({ prepay_balance: 10 })] });
    expect(decide(s).trace[0].candidates[0].reason).toBe(REASON.ELIGIBLE);
  });

  it('low prepaid balance WITH a credit limit -> LOW_BALANCE', () => {
    const s = snap({ members: [member({ fixed_price: 50 })], buyers: [buyer({ prepay_balance: 10, credit_limit: 500 })] });
    expect(decide(s).trace[0].candidates[0].reason).toBe(REASON.LOW_BALANCE);
  });

  it('postpaid credit limit exceeded -> OVER_CREDIT_LIMIT', () => {
    const s = snap({
      members: [member({ fixed_price: 50 })],
      buyers: [buyer({ billing_type: 'invoiced_monthly', prepay_balance: undefined, outstanding: 990, credit_limit: 1000 })],
    });
    expect(decide(s).trace[0].candidates[0].reason).toBe(REASON.OVER_CREDIT_LIMIT);
  });

  it('destination circuit open -> DESTINATION_UNHEALTHY', () => {
    const s = snap({ health: [{ destination_id: 'd1', state: 'open' }] });
    expect(decide(s).trace[0].candidates[0].reason).toBe(REASON.DESTINATION_UNHEALTHY);
  });

  it('maps many members (pagination-scale) deterministically', () => {
    const members = Array.from({ length: 100 }, (_, i) => member({ id: 'm' + i, priority: i + 1, buyer_id: 'b1' }));
    const s = snap({ members });
    expect(s.groups[0].members).toHaveLength(100);
    expect(decide(s).winner?.id).toBe('m0'); // lowest priority number
  });

  it('zero campaigns / no matching config -> empty groups (deterministic, no eval-all)', () => {
    const s = buildRoutingSnapshot({ groups: [], members: [], buyers: [], destinations: [], health: [] },
      { campaignId: CAMPAIGN, nowMs: NOW });
    expect(s.groups).toHaveLength(0);
    expect(decide(s).winner).toBe(null);
    expect(decide(s).reason).toBe(REASON.NO_ELIGIBLE_MEMBER);
  });
});

// Canonical SubDelivery destination model: RouteMember.sub_delivery_id must
// resolve to an ACTIVE sub-delivery whose parent Delivery is ACTIVE and belongs
// to the member's buyer, else the member is CONFIG_INVALID and never routes.
describe('buildRoutingSnapshot -> SubDelivery destination (fail-closed)', () => {
  function delivery(over = {}) { return { id: 'del1', buyer_id: 'b1', status: 'active', ...over }; }
  function subDelivery(over = {}) {
    return {
      id: 'sd1', delivery_id: 'del1', active: true, target_url: 'https://buyer.example/api',
      method: 'POST', encoding: 'json', response_mapping: JSON.stringify({ accepted: 'ok', revenue: 'price' }),
      field_map: JSON.stringify([{ src: 'email', dest: 'Email' }]), credential_ref: 'secref-1', ...over,
    };
  }
  // Member points at the sub-delivery (canonical) and carries no legacy destination.
  function subMember(over = {}) { return member({ destination_id: undefined, sub_delivery_id: 'sd1', ...over }); }
  function snapSub(records, over = {}) {
    return buildRoutingSnapshot(
      { groups: [group()], members: [subMember()], buyers: [buyer()],
        destinations: [], deliveries: [delivery()], subDeliveries: [subDelivery()], health: [], ...records },
      { campaignId: CAMPAIGN, nowMs: NOW, capCountsFor: () => 0, ...over },
    );
  }

  it('happy path: valid active sub-delivery routes and carries resolved cfg', () => {
    const s = snapSub({});
    expect(s.configErrors).toEqual([]);
    const d = decide(s);
    expect(d.winner?.id).toBe('m1');
    const mem = s.groups[0].members[0];
    expect(mem.subDeliveryId).toBe('sd1');
    expect(mem.delivery.targetUrl).toBe('https://buyer.example/api');
    expect(mem.delivery.credentialRef).toBe('secref-1');
    // No resolved secret value ever appears in the snapshot cfg.
    expect(JSON.stringify(mem.delivery)).not.toMatch(/secret|password|apikey|api_key|bearer/i);
  });

  it('missing sub_delivery_id (unresolvable) -> CONFIG_INVALID + ineligible', () => {
    const s = snapSub({ subDeliveries: [] });
    expect(s.configErrors.some((e) => e.detail === 'missing sub-delivery')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('inactive sub-delivery -> CONFIG_INVALID + ineligible', () => {
    const s = snapSub({ subDeliveries: [subDelivery({ active: false })] });
    expect(s.configErrors.some((e) => e.detail === 'inactive sub-delivery')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('parent Delivery belongs to a different buyer -> fail closed (CONFIG_INVALID)', () => {
    const s = snapSub({ deliveries: [delivery({ buyer_id: 'OTHER_BUYER' })] });
    expect(s.configErrors.some((e) => e.detail === 'cross-buyer sub-delivery')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('archived parent Delivery -> CONFIG_INVALID + ineligible', () => {
    const s = snapSub({ deliveries: [delivery({ status: 'archived' })] });
    expect(s.configErrors.some((e) => e.detail === 'parent delivery not active')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('member with neither sub_delivery_id nor destination_id -> CONFIG_INVALID', () => {
    const s = snapSub({ members: [subMember({ sub_delivery_id: undefined })] });
    expect(s.configErrors.some((e) => e.detail === 'missing sub_delivery_id')).toBe(true);
    expect(decide(s).winner).toBe(null);
  });

  it('circuit breaker keys on sub_delivery_id (per endpoint)', () => {
    const s = snapSub({ health: [{ sub_delivery_id: 'sd1', state: 'open' }] });
    expect(decide(s).trace[0].candidates[0].reason).toBe(REASON.DESTINATION_UNHEALTHY);
  });
});
