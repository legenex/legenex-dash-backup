import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];
function isOperator(caller: any): boolean {
  if (!caller) return false;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions: Record<string, any> = {};
  try { permissions = typeof caller.permissions === 'string' ? JSON.parse(caller.permissions || '{}') : (caller.permissions || {}); } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

// Operator only. Maps selected Meta campaigns in an ad account to a supplier
// (with optional vertical/brand), creating campaign-level AdSpendMapping rows.
// Also registers the ad account (SupplierAdAccount, campaign mode) so the sync
// picks it up. Re-mapping a campaign updates its supplier in place.
// Payload: {
//   ad_account_id, connection_id, ad_account_name?, currency?, business_id?,
//   business_name?, timezone_name?, supplier_id, vertical?, brand?,
//   campaigns: [{ id, name }]
// }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const adAccountId = String(body.ad_account_id || '');
    const connectionId = String(body.connection_id || '');
    const supplierId = String(body.supplier_id || '');
    const vertical = String(body.vertical || '');
    const brand = String(body.brand || '');
    const campaigns: any[] = Array.isArray(body.campaigns) ? body.campaigns : [];
    if (!adAccountId || !connectionId) return Response.json({ error: 'ad_account_id and connection_id are required' }, { status: 400 });
    if (!supplierId) return Response.json({ error: 'supplier_id is required' }, { status: 400 });
    if (!campaigns.length) return Response.json({ error: 'Select at least one campaign' }, { status: 400 });

    const svc = base44.asServiceRole;
    const supplier = await svc.entities.Supplier.get(supplierId).catch(() => null);
    if (!supplier) return Response.json({ error: 'Supplier not found' }, { status: 404 });

    // Existing campaign mappings for this account, keyed by campaign id.
    const existing = await svc.entities.AdSpendMapping.filter({ platform: 'meta', match_level: 'campaign', ad_account_id: adAccountId });
    const byCampaign: Record<string, any> = {};
    for (const m of existing) if (m.meta_campaign_id) byCampaign[m.meta_campaign_id] = m;

    let created = 0;
    let updated = 0;
    for (const c of campaigns) {
      const campId = String(c.id || '');
      if (!campId) continue;
      const fields = {
        platform: 'meta',
        match_level: 'campaign',
        connection_id: connectionId,
        ad_account_id: adAccountId,
        ad_account_name: body.ad_account_name || '',
        meta_campaign_id: campId,
        meta_campaign_name: c.name || '',
        supplier_id: supplierId,
        supplier_name: supplier.name || '',
        vertical,
        brand,
        cost_source: body.ad_account_name || adAccountId,
        enabled: true,
      };
      if (byCampaign[campId]) { await svc.entities.AdSpendMapping.update(byCampaign[campId].id, fields); updated++; }
      else { await svc.entities.AdSpendMapping.create(fields); created++; }
    }

    // Register the ad account so the sync includes it (campaign attribution mode).
    const reg = (await svc.entities.SupplierAdAccount.filter({ platform: 'meta', ad_account_id: adAccountId }))[0] || null;
    const regFields: any = {
      platform: 'meta',
      connection_id: connectionId,
      ad_account_id: adAccountId,
      ad_account_name: body.ad_account_name || reg?.ad_account_name || '',
      currency: body.currency || reg?.currency || '',
      business_id: body.business_id || reg?.business_id || '',
      business_name: body.business_name || reg?.business_name || '',
      timezone_name: body.timezone_name || reg?.timezone_name || '',
      mapping_mode: 'campaign',
      enabled: reg ? reg.enabled !== false : true,
    };
    if (reg) await svc.entities.SupplierAdAccount.update(reg.id, regFields);
    else await svc.entities.SupplierAdAccount.create({ ...regFields, backfill_days: 30, backfill_done: false });

    return Response.json({ success: true, created, updated, mapped_total: created + updated });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
