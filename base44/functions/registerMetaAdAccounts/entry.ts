import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];
// Operator authorization, mirroring src/lib/distribution/operatorAuth.js: admins
// and operators holding a management permission are allowed; portal (buyer or
// supplier) accounts are rejected.
function isOperator(caller: any): boolean {
  if (!caller) return false;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions: Record<string, any> = {};
  try { permissions = typeof caller.permissions === 'string' ? JSON.parse(caller.permissions || '{}') : (caller.permissions || {}); } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

// Operator only. Registers one or more Meta ad accounts as connected (the
// SupplierAdAccount registry) WITHOUT assigning a supplier. This backs the
// connect-first flow: accounts are connected, then their campaigns are mapped
// to a Campaign + Source (supplier) later via mapMetaCampaigns, which writes the
// campaign-level AdSpendMapping rows that carry attribution.
// Idempotent by (platform, ad_account_id): existing rows are re-enabled and
// their connection/name refreshed; any supplier_id already set is left untouched.
// Payload: {
//   connection_id: string,
//   backfill_days?: number,   // 1..1100, default 30
//   accounts: [{ id|ad_account_id, name?|ad_account_name?, business_id?, business_name?, currency?, timezone_name? }]
// }
// Returns { success, registered: [...], updated: [...], error }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const connectionId = String(body.connection_id || '');
    const accounts: any[] = Array.isArray(body.accounts) ? body.accounts : [];
    let backfillDays = Number(body.backfill_days) || 30;
    backfillDays = Math.min(Math.max(Math.round(backfillDays), 1), 1100);

    if (!connectionId) return Response.json({ error: 'connection_id is required' }, { status: 400 });
    if (!accounts.length) return Response.json({ error: 'accounts is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const connection = await svc.entities.MetaConnection.get(connectionId).catch(() => null);
    if (!connection) return Response.json({ error: 'Connection not found' }, { status: 404 });

    const existingRows = await svc.entities.SupplierAdAccount.filter({ platform: 'meta' });
    const byAccount: Record<string, any> = {};
    for (const r of existingRows) if (r.ad_account_id) byAccount[r.ad_account_id] = r;

    const registered: any[] = [];
    const updated: any[] = [];

    for (const a of accounts) {
      const adAccountId = String(a.id || a.ad_account_id || '');
      if (!adAccountId) continue;
      const name = String(a.name || a.ad_account_name || adAccountId);
      const fields: Record<string, any> = {
        platform: 'meta',
        connection_id: connectionId,
        ad_account_id: adAccountId,
        ad_account_name: name,
        business_id: String(a.business_id || ''),
        business_name: String(a.business_name || ''),
        currency: String(a.currency || ''),
        timezone_name: String(a.timezone_name || ''),
        enabled: true,
      };
      const existing = byAccount[adAccountId];
      if (existing) {
        await svc.entities.SupplierAdAccount.update(existing.id, fields);
        updated.push({ id: existing.id, ad_account_id: adAccountId, ad_account_name: name });
      } else {
        const created = await svc.entities.SupplierAdAccount.create({ ...fields, backfill_days: backfillDays, backfill_done: false });
        registered.push({ id: created.id, ad_account_id: adAccountId, ad_account_name: name });
      }
    }

    return Response.json({ success: true, registered, updated });
  } catch (error) {
    return Response.json({ success: false, error: (error as Error).message }, { status: 200 });
  }
});
