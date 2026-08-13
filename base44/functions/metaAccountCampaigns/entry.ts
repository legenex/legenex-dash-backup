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

// Operator only. Lists the Meta campaigns inside one ad account so the map
// modal can show them with Active/Paused status. Follows paging up to a cap.
// Payload: { ad_account_id: string, connection_id: string }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const adAccountId = String(body.ad_account_id || '');
    const connectionId = String(body.connection_id || '');
    if (!adAccountId || !connectionId) return Response.json({ error: 'ad_account_id and connection_id are required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const conn = await svc.entities.MetaConnection.get(connectionId).catch(() => null);
    if (!conn || !conn.token) return Response.json({ error: 'Connection not found or has no token' }, { status: 404 });

    const ver = 'v21.0';
    const node = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    let url = `https://graph.facebook.com/${ver}/${node}/campaigns?fields=id,name,effective_status,status&limit=200&access_token=${encodeURIComponent(conn.token)}`;
    const campaigns: any[] = [];
    let pages = 0;
    while (url && pages < 15) {
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) {
        const msg = json.error.error_user_msg || json.error.message || 'Failed to load campaigns';
        return Response.json({ error: msg, meta_code: json.error.code || null });
      }
      for (const c of json.data || []) {
        const eff = String(c.effective_status || c.status || '').toUpperCase();
        campaigns.push({ id: c.id, name: c.name || c.id, status: eff === 'ACTIVE' ? 'active' : 'paused', raw_status: eff });
      }
      url = json.paging?.next || '';
      pages++;
    }

    campaigns.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
    return Response.json({
      success: true,
      campaigns,
      counts: { total: campaigns.length, active: campaigns.filter(c => c.status === 'active').length, paused: campaigns.filter(c => c.status === 'paused').length },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
