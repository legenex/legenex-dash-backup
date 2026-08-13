import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Caller model: SUPPLIER-SCOPED. Authenticated supplier-portal data endpoint.
// Returns everything the supplier portal needs, strictly scoped to a single
// Supplier record. Uses the service role to read Lead (admin-RLS) but never
// returns another supplier's data, another supplier's leads, buyer identities,
// buyer revenue or internal cost, raw payloads, routing traces, or the raw API
// key (prefix + metadata only). Deny-by-default field allowlist.
//
// Scoping rules:
// - A supplier-role user is scoped to their own user.linked_supplier_id.
// - An operator (admin) may pass ?supplier_id= to PREVIEW a supplier's portal.
//   Non-admin callers cannot override their linked supplier.

async function resolveSupplierScope(base44: any, user: any, requestedSupplierId: string | null, previewRole: boolean) {
  const isOperator = user.role === 'admin';
  if (isOperator && requestedSupplierId) return requestedSupplierId;
  if (user.linked_supplier_id) return user.linked_supplier_id;
  // Operator using "View as → Supplier" with no specific target: preview the
  // first portal-enabled supplier so the portal renders a real example.
  if (isOperator && previewRole) {
    const enabled = await base44.asServiceRole.entities.Supplier.filter({ portal_enabled: true }, '-created_date', 1).catch(() => []);
    if (enabled && enabled.length > 0) return enabled[0].id;
  }
  return null;
}

function parseArr(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestedSupplierId = body.supplier_id || null;
    const previewRole = !!body.preview_role;
    const supplierId = await resolveSupplierScope(base44, user, requestedSupplierId, previewRole);
    if (!supplierId) return Response.json({ error: 'No supplier linked to this account' }, { status: 403 });

    const supplier = await base44.asServiceRole.entities.Supplier.get(supplierId).catch(() => null);
    if (!supplier) return Response.json({ error: 'Supplier not found' }, { status: 404 });
    if (!supplier.portal_enabled && user.role !== 'admin') {
      return Response.json({ error: 'Portal is not enabled for this supplier' }, { status: 403 });
    }

    // Only leads this supplier sent (matched by supplier_name).
    const leads = await base44.asServiceRole.entities.Lead.filter({ supplier_name: supplier.name }, '-created_date', 3000);

    // Returns for this supplier's leads.
    const leadIds = new Set(leads.map((l: any) => l.id));
    let returns: any[] = [];
    try {
      const allReturns = await base44.asServiceRole.entities.ReturnRequest.list('-created_date', 3000);
      returns = allReturns.filter((r: any) => leadIds.has(r.lead_id));
    } catch { returns = []; }

    // Trim lead payloads to supplier-safe fields.
    //
    // BUYER IDENTITY: the buyer CODE is exposed, the buyer NAME never is. A
    // supplier needs a stable handle to dispute or reconcile a specific lead
    // ("the one you sold to T2"), but the company name would let them approach
    // our client directly. Never add buyer_name, and never derive the name from
    // the code on this projection.
    const safeLeads = leads.map((l: any) => ({
      id: l.id,
      lead_id: l.lead_id,
      first_name: l.first_name,
      last_name: l.last_name,
      mobile: l.mobile,
      email: l.email,
      final_status: l.final_status,
      response_reason: l.response_reason,
      buyer_id: l.buyer_id || null,
      created_date: l.created_date,
    }));

    // Their API key(s).
    let apiKey: any = null;
    try {
      const keys = await base44.asServiceRole.entities.ApiKey.filter({ supplier_id: supplier.id });
      const byName = keys.length ? keys : await base44.asServiceRole.entities.ApiKey.filter({ supplier_name: supplier.name });
      const active = byName.find((k: any) => k.active) || byName[0];
      // Deny-by-default: never return the raw secret. Prefix + metadata only.
      if (active) apiKey = {
        key_prefix: active.key_prefix || (active.key ? String(active.key).slice(0, 6) : null),
        name: active.name, active: active.active !== false,
        last_used_at: active.last_used_at || null, request_count: active.request_count || 0,
      };
    } catch { apiKey = null; }

    // Ad reporting — ONLY for internal sources connected through Facebook.
    // External suppliers never receive any ad reporting.
    const isInternalFacebook = supplier.supplier_type === 'Internal';
    let adReporting: any = null;
    if (isInternalFacebook) {
      try {
        const mappings = await base44.asServiceRole.entities.AdSpendMapping.filter({ supplier_name: supplier.name });
        const mappingIds = new Set(mappings.map((m: any) => m.id));
        const allSpend = await base44.asServiceRole.entities.AdSpend.filter({ supplier_name: supplier.name }, '-date', 3000);
        const spendRows = allSpend.filter((s: any) => !s.mapping_id || mappingIds.has(s.mapping_id));
        adReporting = {
          enabled: true,
          mappings: mappings.map((m: any) => ({
            id: m.id,
            platform: m.platform,
            ad_account_name: m.ad_account_name,
            meta_campaign_name: m.meta_campaign_name,
            match_level: m.match_level,
            last_synced_at: m.last_synced_at,
          })),
          spend: spendRows.map((s: any) => ({
            date: s.date,
            spend: s.spend,
            impressions: s.impressions,
            clicks: s.clicks,
            leads: s.leads,
            meta_campaign_id: s.meta_campaign_id,
            ad_account_id: s.ad_account_id,
          })),
        };
      } catch {
        adReporting = { enabled: true, mappings: [], spend: [] };
      }
    }

    void parseArr;

    return Response.json({
      supplier: {
        id: supplier.id,
        name: supplier.name,
        sid: supplier.sid,
        email: supplier.email,
        phone: supplier.phone,
        supplier_type: supplier.supplier_type,
        vertical: supplier.vertical,
        brand: supplier.brand,
        landing_page_url: supplier.landing_page_url,
        portal_enabled: supplier.portal_enabled,
        is_internal_facebook: isInternalFacebook,
      },
      leads: safeLeads,
      returns,
      apiKey,
      adReporting,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});