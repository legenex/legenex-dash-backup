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

// Admin only. Associates one or more Meta ad accounts with a supplier by
// creating (or re-enabling) SupplierAdAccount rows. Enforces the rule that an
// ad account belongs to exactly one supplier: any account already linked to a
// different supplier is returned as a conflict and skipped, never reassigned
// silently. The caller (connect wizard) triggers syncMetaSpend afterwards.
// Payload: {
//   supplier_id: string,
//   connection_id: string,
//   backfill_days?: number,               // 1..1100, default 30
//   accounts: [{ id, account_id?, name?, business_id?, business_name?, currency?, timezone_name? }]
// }
// Returns { success, linked: [...], updated: [...], conflicts: [{ ad_account_id, supplier_name }], error }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const supplierId = String(body.supplier_id || '');
    const connectionId = String(body.connection_id || '');
    const accounts: any[] = Array.isArray(body.accounts) ? body.accounts : [];
    let backfillDays = Number(body.backfill_days) || 30;
    backfillDays = Math.min(Math.max(Math.round(backfillDays), 1), 1100);
    const backfillSince = (typeof body.backfill_since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.backfill_since)) ? body.backfill_since : '';

    if (!supplierId) return Response.json({ error: 'supplier_id is required' }, { status: 400 });
    if (!connectionId) return Response.json({ error: 'connection_id is required' }, { status: 400 });
    if (!accounts.length) return Response.json({ error: 'accounts is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const supplier = await svc.entities.Supplier.get(supplierId).catch(() => null);
    if (!supplier) return Response.json({ error: 'Supplier not found' }, { status: 404 });
    const connection = await svc.entities.MetaConnection.get(connectionId).catch(() => null);
    if (!connection) return Response.json({ error: 'Connection not found' }, { status: 404 });

    const linked: any[] = [];
    const updated: any[] = [];
    const conflicts: any[] = [];

    for (const a of accounts) {
      const adAccountId = String(a.id || a.ad_account_id || '');
      if (!adAccountId) continue;

      const existing = (await svc.entities.SupplierAdAccount.filter({ platform: 'meta', ad_account_id: adAccountId }))[0] || null;

      if (existing && existing.supplier_id !== supplierId) {
        const other = await svc.entities.Supplier.get(existing.supplier_id).catch(() => null);
        conflicts.push({ ad_account_id: adAccountId, ad_account_name: a.name || existing.ad_account_name || '', supplier_name: other?.name || existing.supplier_name || 'another supplier' });
        continue;
      }

      const fields = {
        supplier_id: supplierId,
        supplier_name: supplier.name || '',
        connection_id: connectionId,
        platform: 'meta',
        ad_account_id: adAccountId,
        ad_account_name: a.name || '',
        business_id: a.business_id || '',
        business_name: a.business_name || '',
        currency: a.currency || '',
        timezone_name: a.timezone_name || '',
        enabled: true,
        backfill_days: backfillDays,
        backfill_since: backfillSince,
      };

      if (existing) {
        await svc.entities.SupplierAdAccount.update(existing.id, fields);
        updated.push({ id: existing.id, ad_account_id: adAccountId });
      } else {
        const row = await svc.entities.SupplierAdAccount.create({ ...fields, backfill_done: false });
        linked.push({ id: row.id, ad_account_id: adAccountId });
      }
    }

    return Response.json({ success: true, linked, updated, conflicts });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
