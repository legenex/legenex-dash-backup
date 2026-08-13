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

// Admin only. Validates a pasted Meta system-user token against the Graph API
// and saves it as a MetaConnection (auth_type system_user). The token never
// needs to be stored client-side: the wizard posts it here once and afterwards
// only receives the connection id and a masked tail.
// Payload: { name: string, token: string }
// Returns { success, connection: { id, name, auth_type, status, token_last4,
//           connected_account_name }, error }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const name = String(body.name || '').trim();
    const token = String(body.token || '').trim();
    if (!name) return Response.json({ success: false, error: 'Connection label is required' });
    if (!token) return Response.json({ success: false, error: 'Token is required' });

    const ver = 'v21.0';
    const meRes = await fetch(`https://graph.facebook.com/${ver}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const meJson = await meRes.json();
    if (meJson.error) {
      return Response.json({ success: false, error: meJson.error.error_user_msg || meJson.error.message || 'Meta rejected this token' });
    }
    // Confirms ads_read coverage; an empty list is allowed (accounts can be granted later).
    const acctRes = await fetch(`https://graph.facebook.com/${ver}/me/adaccounts?fields=id&limit=1&access_token=${encodeURIComponent(token)}`);
    const acctJson = await acctRes.json();
    if (acctJson.error) {
      return Response.json({ success: false, error: acctJson.error.error_user_msg || acctJson.error.message || 'Token cannot list ad accounts. It needs ads_read.' });
    }

    const svc = base44.asServiceRole;
    const now = new Date().toISOString();
    const row = await svc.entities.MetaConnection.create({
      name,
      platform: 'meta',
      auth_type: 'system_user',
      token,
      token_expires_at: null,
      connected_account_id: meJson.id,
      connected_account_name: meJson.name || meJson.id,
      status: 'active',
      last_validated_at: now,
      last_error: '',
    });

    return Response.json({
      success: true,
      connection: {
        id: row.id,
        name,
        auth_type: 'system_user',
        status: 'active',
        token_last4: token.slice(-4),
        connected_account_name: meJson.name || meJson.id,
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: (error as Error).message }, { status: 200 });
  }
});
