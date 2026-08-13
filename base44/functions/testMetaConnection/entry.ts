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

// Operator only. Tests a Meta connection (or a raw token) against the Graph API
// and updates the MetaConnection health so the UI can show Active, Expired or
// Action required. Used both by the "Test connection" button and to validate a
// token before it is saved.
// Payload: { connection_id?: string, token?: string }
// Returns: { valid, account: {id,name}, reachable_accounts, status, error }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const svc = base44.asServiceRole;

    let token = String(body.token || '').trim();
    let conn: any = null;
    if (!token && body.connection_id) {
      conn = await svc.entities.MetaConnection.get(body.connection_id).catch(() => null);
      token = conn?.token || '';
    }
    if (!token) return Response.json({ valid: false, error: 'No token to test. Pass connection_id or token.' });

    const ver = 'v21.0';
    const now = new Date().toISOString();

    const meRes = await fetch(`https://graph.facebook.com/${ver}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const meJson = await meRes.json();
    if (meJson.error) {
      const code = meJson.error.code;
      const status = (code === 190) ? 'invalid' : 'invalid';
      const message = meJson.error.error_user_msg || meJson.error.message || 'Token rejected by Meta';
      if (conn) await svc.entities.MetaConnection.update(conn.id, { status, last_error: message, last_validated_at: now }).catch(() => {});
      return Response.json({ valid: false, status, error: message });
    }

    // Count reachable ad accounts to confirm ads_read coverage.
    let reachable = 0;
    let accountsError = '';
    const acctRes = await fetch(`https://graph.facebook.com/${ver}/me/adaccounts?fields=id&limit=200&access_token=${encodeURIComponent(token)}`);
    const acctJson = await acctRes.json();
    if (acctJson.error) {
      accountsError = acctJson.error.error_user_msg || acctJson.error.message || 'Cannot list ad accounts (needs ads_read).';
    } else {
      reachable = (acctJson.data || []).length;
    }

    if (conn) {
      // Respect a known expiry even if the token still resolves.
      let status = 'active';
      let lastError = '';
      if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now()) {
        status = 'expired';
        lastError = 'Token expired. Reconnect Meta.';
      } else if (accountsError) {
        status = 'active';
        lastError = accountsError;
      }
      await svc.entities.MetaConnection.update(conn.id, { status, last_error: lastError, last_validated_at: now }).catch(() => {});
    }

    return Response.json({
      valid: true,
      account: { id: meJson.id, name: meJson.name || meJson.id },
      reachable_accounts: reachable,
      accounts_error: accountsError,
      status: 'active',
    });
  } catch (error) {
    return Response.json({ valid: false, error: (error as Error).message }, { status: 200 });
  }
});
