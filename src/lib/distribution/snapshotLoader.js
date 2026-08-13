// Backend snapshot loader: fetches persisted records with BOUNDED, FILTERED,
// PAGINATED reads (never an unfiltered full-table list) and hands them to the
// canonical buildRoutingSnapshot mapper. `db` is base44.asServiceRole.
//
// A short-TTL module-scope cache answers "does any active RouteGroup exist for
// this campaign" so the hot path can skip the full load entirely when there is no
// config.

import { buildRoutingSnapshot } from './snapshot.js';

const PAGE = 200;
const activeGroupCache = new Map(); // campaignId -> { has, expires }

// Paginated filtered read. Always passes a query; caps total pages.
async function loadAllFiltered(entity, query, { sort = 'created_date', maxPages = 25 } = {}) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await entity.filter(query, sort, PAGE, page * PAGE);
    if (!rows || !rows.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Cheap existence check (limit 1), cached for ttlMs.
export async function hasActiveRouteGroup(db, campaignId, nowMs, ttlMs = 5000) {
  const cached = activeGroupCache.get(campaignId);
  if (cached && cached.expires > nowMs) return cached.has;
  const rows = await db.entities.RouteGroup.filter({ campaign_id: campaignId, active: true, lifecycle: 'active' }, 'order_index', 1, 0);
  const has = !!(rows && rows.length);
  activeGroupCache.set(campaignId, { has, expires: nowMs + ttlMs });
  return has;
}

export function _clearActiveGroupCache() { activeGroupCache.clear(); }

// Load a full snapshot for a campaign via bounded paginated reads. Cap counts are
// pre-loaded here (async) and exposed to the pure mapper as a SYNC lookup.
export async function loadRoutingSnapshot(db, { campaignId, nowMs, configVersionId }) {
  const groups = await loadAllFiltered(db.entities.RouteGroup, { campaign_id: campaignId, active: true, lifecycle: 'active' }, { sort: 'order_index' });
  const groupIds = groups.map((g) => g.id);
  // Members for these groups only (filtered, never a full list).
  let members = [];
  for (const gid of groupIds) {
    members = members.concat(await loadAllFiltered(db.entities.RouteMember, { route_group_id: gid }, { sort: 'priority' }));
  }
  const buyerIds = [...new Set(members.map((m) => m.buyer_id).filter(Boolean))];
  const destIds = [...new Set(members.map((m) => m.destination_id).filter(Boolean))];
  const subDeliveryIds = [...new Set(members.map((m) => m.sub_delivery_id).filter(Boolean))];
  const buyers = [];
  for (const id of buyerIds) { const r = await db.entities.Buyer.filter({ id }); if (r && r[0]) buyers.push(r[0]); }
  const destinations = [];
  for (const id of destIds) { const r = await db.entities.LeadByteConnector.filter({ id }); if (r && r[0]) destinations.push(r[0]); }

  // Canonical SubDelivery endpoints + their parent Delivery (for buyer/status checks).
  const subDeliveries = [];
  if (db.entities.SubDelivery) {
    for (const id of subDeliveryIds) { const r = await db.entities.SubDelivery.filter({ id }); if (r && r[0]) subDeliveries.push(r[0]); }
  }
  const deliveryIds = [...new Set(subDeliveries.map((sd) => sd.delivery_id).filter(Boolean))];
  const deliveries = [];
  if (db.entities.Delivery) {
    for (const id of deliveryIds) { const r = await db.entities.Delivery.filter({ id }); if (r && r[0]) deliveries.push(r[0]); }
  }

  // Health is per endpoint. Load by sub_delivery_id (canonical) and by legacy destination_id.
  const health = [];
  for (const id of subDeliveryIds) { const r = await db.entities.DestinationHealth.filter({ sub_delivery_id: id }); if (r && r[0]) health.push(r[0]); }
  for (const id of destIds) { const r = await db.entities.DestinationHealth.filter({ destination_id: id }); if (r && r[0]) health.push(r[0]); }

  // Pre-load cap counters for these members (async), then hand the mapper a sync lookup.
  const capMap = {};
  if (db.entities.CapCounter) {
    for (const m of members) {
      try {
        const rows = await db.entities.CapCounter.filter({ scope_type: 'route_member', scope_id: m.id });
        for (const r of rows || []) if (r.window) capMap[`${m.id}:${r.window}`] = Number(r.count || 0);
      } catch { /* no counters yet */ }
    }
  }
  const capCountsFor = (memberId, window) => capMap[`${memberId}:${window}`] || 0;

  return buildRoutingSnapshot(
    { groups, members, buyers, destinations, subDeliveries, deliveries, health },
    { campaignId, nowMs, configVersionId, capCountsFor },
  );
}
