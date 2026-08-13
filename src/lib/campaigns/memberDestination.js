// UI helpers for resolving a RouteMember's destination label and for detecting
// and converting legacy inline-config members. No engine or backend logic here.
// No em dashes.

import { base44 } from '@/api/base44Client';

// A member is "legacy" when it carries inline delivery_config or ping_config
// but has no canonical sub_delivery_id pointer.
export function isLegacyMember(m) {
  if (!m) return false;
  if (m.sub_delivery_id) return false;
  const hasInline = (v) => v != null && String(v).trim() !== '' && String(v).trim() !== '{}';
  return hasInline(m.delivery_config) || hasInline(m.ping_config);
}

// Resolve the primary destination name for a member.
// Priority: destination_name -> sub-delivery name -> "(no destination)".
export function destinationLabel(m, subById) {
  if (m?.destination_name) return m.destination_name;
  const sub = m?.sub_delivery_id ? subById?.[m.sub_delivery_id] : null;
  if (sub?.name) return sub.name;
  if (isLegacyMember(m)) return 'Legacy destination';
  return '(no destination)';
}

function parseObj(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

// Convert a legacy member: build a Delivery + SubDelivery for the member's buyer
// from its inline delivery_config, then set sub_delivery_id on the member. The
// old inline fields are LEFT UNTOUCHED (additive, reversible, engine-safe).
// Returns the created sub-delivery id.
export async function convertLegacyMember(m, buyerName) {
  const delivery = parseObj(m.delivery_config);
  const ping = parseObj(m.ping_config);

  const created = await base44.entities.Delivery.create({
    buyer_id: m.buyer_id,
    name: `${buyerName || 'Buyer'} (converted)`,
    status: 'active',
    notes: 'Created by converting a legacy inline routing config.',
  });

  const headers = delivery.headers != null
    ? (typeof delivery.headers === 'string' ? delivery.headers : JSON.stringify(delivery.headers))
    : '';
  const fieldMap = delivery.body_template
    ? (typeof delivery.body_template === 'string' ? delivery.body_template : JSON.stringify(delivery.body_template))
    : '';

  const sub = await base44.entities.SubDelivery.create({
    delivery_id: created.id,
    name: m.destination_name || 'Converted destination',
    active: true,
    order_index: 0,
    target_url: delivery.url || ping.url || '',
    method: 'POST',
    encoding: (delivery.format === 'form' ? 'form' : 'json'),
    headers,
    field_map: fieldMap,
    timeout_ms: Number(delivery.timeout_ms || ping.timeout_ms || 10000),
  });

  await base44.entities.RouteMember.update(m.id, { sub_delivery_id: sub.id });
  return sub.id;
}