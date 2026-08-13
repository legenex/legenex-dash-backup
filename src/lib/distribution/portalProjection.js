// Pure allowlist projections + scope policy for the buyer and supplier portals.
// Portal security is enforced SERVER-SIDE; this module encodes the exact safe
// field sets so the projection is unit-testable and cannot silently leak. It is
// deny-by-default: only listed fields survive. Never exposes raw_payload,
// delivery/route traces, secrets/API keys, cross-counterparty pricing, or
// service-role snapshots.

// Fields a buyer may see for one of their own leads.
const BUYER_LEAD_FIELDS = [
  'id', 'lead_id', 'created_date', 'first_name', 'last_name', 'state', 'email',
  'mobile', 'final_status', 'buyer_feedback', 'revenue',
];
// Fields a supplier may see for a lead they submitted. No buyer identity, no
// revenue (that is buyer-side), no payout of other suppliers.
const SUPPLIER_LEAD_FIELDS = [
  'id', 'lead_id', 'created_date', 'first_name', 'last_name', 'state',
  'final_status', 'response_reason',
];

// Never allowed to any portal, even if added to a list above by mistake.
const FORBIDDEN = new Set([
  'raw_payload', 'mapped_fields', 'capi_log', 'delivery_log', 'delivery_error',
  'supplier_key_id', 'buyer_api_key', 'api_key', 'trustedform_url', 'trustedform_cert',
]);

function project(lead, fields) {
  const out = {};
  for (const f of fields) {
    if (FORBIDDEN.has(f)) continue;
    if (lead && Object.prototype.hasOwnProperty.call(lead, f)) out[f] = lead[f];
  }
  return out;
}

export function projectLeadForBuyer(lead) { return project(lead || {}, BUYER_LEAD_FIELDS); }
export function projectLeadForSupplier(lead) { return project(lead || {}, SUPPLIER_LEAD_FIELDS); }
export function projectLeadsForBuyer(leads) { return (leads || []).map(projectLeadForBuyer); }
export function projectLeadsForSupplier(leads) { return (leads || []).map(projectLeadForSupplier); }

// Scope resolution policy. Portal users are pinned to their linked entity; only
// operators (admin) may preview another scope via an explicit override. Returns
// the allowed scope id or null (fail-closed).
export function resolveScope({ user, linkField, overrideId }) {
  const u = user || {};
  const linked = u[linkField];
  if (linked) return linked;                       // real portal user: pinned
  if (u.role === 'admin' && overrideId) return overrideId; // operator preview
  return null;                                     // fail-closed
}

// Assert a lead belongs to the caller's scope before any write (return/feedback).
export function ownsLead(lead, scopeField, scopeId) {
  return !!lead && !!scopeId && String(lead[scopeField]) === String(scopeId);
}

// Single portal authorization decision. Returns { allowed, scopeId, status, reason }.
// Fail-closed: unauthenticated, unlinked non-admin, portal-disabled, or cross-scope
// attempts all deny. kind is 'buyer' or 'supplier'.
export function authorizePortal({ user, kind, requestedId, portalEnabled }) {
  if (!user) return { allowed: false, status: 401, reason: 'unauthenticated' };
  // portal accounts of the OTHER kind are never allowed
  const linkField = kind === 'buyer' ? 'linked_buyer_id' : 'linked_supplier_id';
  const otherField = kind === 'buyer' ? 'linked_supplier_id' : 'linked_buyer_id';
  if (user[otherField]) return { allowed: false, status: 403, reason: 'wrong_portal' };
  const scopeId = resolveScope({ user, linkField, overrideId: requestedId });
  if (!scopeId) return { allowed: false, status: 403, reason: 'no_scope' };
  // Non-admin cannot override to a different scope than their own link.
  if (user.role !== 'admin' && requestedId && String(requestedId) !== String(user[linkField])) {
    return { allowed: false, status: 403, reason: 'cross_scope' };
  }
  if (portalEnabled === false && user.role !== 'admin') {
    return { allowed: false, status: 403, reason: 'portal_disabled' };
  }
  return { allowed: true, status: 200, scopeId };
}

// Supplier-safe API key view: prefix + metadata only, never the raw secret.
export function sanitizeApiKey(key) {
  if (!key) return null;
  return {
    key_prefix: key.key_prefix || (key.key ? String(key.key).slice(0, 6) : null),
    name: key.name, active: key.active !== false,
    last_used_at: key.last_used_at || null, request_count: key.request_count || 0,
  };
}
