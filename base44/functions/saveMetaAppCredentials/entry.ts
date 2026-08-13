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

// Operator only. Stores the Meta app's App ID and App Secret in
// IntegrationConfig(name='meta_app') so the OAuth functions can read them
// without environment variables. The secret is write-only from the UI's point
// of view: this returns only the App ID and the last 4 of the secret. Passing a
// blank App ID or Secret keeps the currently stored value, so the App ID can be
// updated without re-entering the secret.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const appId = String(body.app_id || '').trim();
    const appSecret = String(body.app_secret || '').trim();

    const svc = base44.asServiceRole;
    const list = await svc.entities.IntegrationConfig.filter({ name: 'meta_app' });
    const record = list[0] || null;
    let existing: any = {};
    try { existing = JSON.parse(record?.config || '{}'); } catch { existing = {}; }

    const finalId = appId || String(existing.app_id || '');
    const finalSecret = appSecret || String(existing.app_secret || '');
    if (!finalId) return Response.json({ success: false, error: 'App ID is required' });
    if (!finalSecret) return Response.json({ success: false, error: 'App Secret is required' });

    const payload = JSON.stringify({ app_id: finalId, app_secret: finalSecret });
    if (record) await svc.entities.IntegrationConfig.update(record.id, { config: payload });
    else await svc.entities.IntegrationConfig.create({ name: 'meta_app', config: payload });

    return Response.json({ success: true, app_id: finalId, secret_last4: finalSecret.slice(-4), configured: true });
  } catch (error) {
    return Response.json({ success: false, error: (error as Error).message }, { status: 200 });
  }
});
