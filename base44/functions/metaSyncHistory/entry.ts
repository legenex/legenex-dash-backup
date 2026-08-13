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

// Operator only. Returns recent Meta sync-run history for the View sync history
// panel. Filterable by supplier or by a single ad-account mapping.
// Payload: { supplier_id?: string, supplier_ad_account_id?: string, limit?: number }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

    const svc = base44.asServiceRole;
    const filter: any = { platform: 'meta' };
    if (body.supplier_id) filter.supplier_id = body.supplier_id;
    if (body.supplier_ad_account_id) filter.supplier_ad_account_id = body.supplier_ad_account_id;

    const runs = await svc.entities.MetaSyncRun.filter(filter, '-started_at', limit);
    return Response.json({
      success: true,
      runs: runs.map((r: any) => ({
        id: r.id,
        status: r.status,
        trigger: r.trigger,
        supplier_name: r.supplier_name || '',
        ad_account_name: r.ad_account_name || r.ad_account_id,
        ad_account_id: r.ad_account_id,
        currency: r.currency || '',
        account_rows: r.account_rows || 0,
        spend_days: r.spend_days || 0,
        spend_total: r.spend_total || 0,
        error_message: r.error_message || '',
        started_at: r.started_at || r.created_date,
        finished_at: r.finished_at || null,
        duration_ms: r.duration_ms || 0,
      })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
