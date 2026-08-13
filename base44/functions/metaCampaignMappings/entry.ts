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

const HIDDEN_KEY = 'meta_hidden_accounts';
async function loadHidden(svc: any) {
  const list = await svc.entities.IntegrationConfig.filter({ name: HIDDEN_KEY });
  const rec = list[0] || null;
  let ids: string[] = [];
  try { ids = JSON.parse(rec?.config || '{}').ids || []; } catch { ids = []; }
  return { rec, ids };
}
async function saveHidden(svc: any, rec: any, ids: string[]) {
  const payload = JSON.stringify({ ids: Array.from(new Set(ids)) });
  if (rec) await svc.entities.IntegrationConfig.update(rec.id, { config: payload });
  else await svc.entities.IntegrationConfig.create({ name: HIDDEN_KEY, config: payload });
}

// Operator only. Lists or deletes campaign-level AdSpendMapping rows.
// Payload:
//   { action: 'list', ad_account_id }            -> mappings for one account
//   { action: 'list', supplier_id }              -> mappings for one supplier
//   { action: 'delete', id }                     -> remove one mapping
//   { action: 'clear_account', ad_account_id }   -> remove all for one account
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = String(body.action || 'list');
    const svc = base44.asServiceRole;

    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });
      await svc.entities.AdSpendMapping.delete(body.id);
      return Response.json({ success: true, deleted: 1 });
    }

    if (action === 'clear_account') {
      const rows = await svc.entities.AdSpendMapping.filter({ platform: 'meta', match_level: 'campaign', ad_account_id: String(body.ad_account_id || '') });
      for (const r of rows) await svc.entities.AdSpendMapping.delete(r.id);
      return Response.json({ success: true, deleted: rows.length });
    }

    if (action === 'disconnect_account') {
      // Remove the account from the list: clear its campaign mappings, drop its
      // registry row, and add it to the hidden set so the overview skips it.
      const acct = String(body.ad_account_id || '');
      if (!acct) return Response.json({ error: 'ad_account_id is required' }, { status: 400 });
      const rows = await svc.entities.AdSpendMapping.filter({ platform: 'meta', match_level: 'campaign', ad_account_id: acct });
      for (const r of rows) await svc.entities.AdSpendMapping.delete(r.id);
      const regs = await svc.entities.SupplierAdAccount.filter({ platform: 'meta', ad_account_id: acct });
      for (const r of regs) await svc.entities.SupplierAdAccount.delete(r.id);
      const { rec, ids } = await loadHidden(svc);
      ids.push(acct);
      await saveHidden(svc, rec, ids);
      return Response.json({ success: true, disconnected: true, cleared: rows.length });
    }

    if (action === 'restore_account') {
      const acct = String(body.ad_account_id || '');
      const { rec, ids } = await loadHidden(svc);
      await saveHidden(svc, rec, ids.filter((x) => x !== acct));
      return Response.json({ success: true, restored: true });
    }

    // action === 'list'
    const filter: any = { platform: 'meta', match_level: 'campaign' };
    if (body.ad_account_id) filter.ad_account_id = String(body.ad_account_id);
    if (body.supplier_id) filter.supplier_id = String(body.supplier_id);
    const rows = await svc.entities.AdSpendMapping.filter(filter);
    return Response.json({
      success: true,
      mappings: rows.map((m: any) => ({
        id: m.id,
        ad_account_id: m.ad_account_id,
        ad_account_name: m.ad_account_name || '',
        meta_campaign_id: m.meta_campaign_id || '',
        meta_campaign_name: m.meta_campaign_name || m.meta_campaign_id || '',
        supplier_id: m.supplier_id || '',
        supplier_name: m.supplier_name || '',
        vertical: m.vertical || '',
        brand: m.brand || '',
      })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
