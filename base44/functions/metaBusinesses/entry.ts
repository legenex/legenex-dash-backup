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

// Admin only. Lists the Businesses and ad accounts a Meta token can reach, for
// the connect wizard's business and account selection step.
// Payload: { connection_id?: string, token?: string }
//   - token given: use the pasted token (pre-save validation while adding a connection).
//   - connection_id given: use the stored MetaConnection token.
// Returns:
// { valid, account: {id,name}, businesses: [{ id, name, ad_accounts: [...] }],
//   unassigned_ad_accounts: [...], error }
// Each ad account carries { id, account_id, name, currency, timezone_name }.
// Accounts reachable via /me/adaccounts but not under any listed business land
// in unassigned_ad_accounts, which keeps system-user tokens without
// business_management listing rights usable.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    let token = (body.token || '').trim();
    if (!token && body.connection_id) {
      const conn = await base44.asServiceRole.entities.MetaConnection.get(body.connection_id).catch(() => null);
      token = conn?.token || '';
    }
    if (!token) return Response.json({ valid: false, error: 'No token. Pass token or connection_id.' });

    const ver = 'v21.0';
    const ACCOUNT_FIELDS = 'id,name,account_id,currency,timezone_name';

    // Fetch a Graph collection, following paging.next up to maxPages.
    const gPaged = async (path: string, params: string, maxPages = 10): Promise<any[]> => {
      const out: any[] = [];
      let url = `https://graph.facebook.com/${ver}/${path}?${params}&access_token=${encodeURIComponent(token)}`;
      for (let i = 0; i < maxPages && url; i++) {
        const r = await fetch(url);
        const j = await r.json();
        if (j.error) throw new Error(j.error.error_user_msg || j.error.message || 'Graph API error');
        for (const item of j.data || []) out.push(item);
        url = j.paging?.next || '';
      }
      return out;
    };

    const gOne = async (path: string, params: string) => {
      const r = await fetch(`https://graph.facebook.com/${ver}/${path}?${params}&access_token=${encodeURIComponent(token)}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.error_user_msg || j.error.message || 'Graph API error');
      return j;
    };

    const me = await gOne('me', 'fields=id,name');

    // Businesses are best-effort: a token without business listing rights still
    // works through the unassigned bucket below.
    let bizList: any[] = [];
    try {
      bizList = await gPaged('me/businesses', 'fields=id,name&limit=100');
    } catch { bizList = []; }

    const businesses: any[] = [];
    const seenAccountIds = new Set<string>();
    for (const b of bizList) {
      const owned = await gPaged(`${b.id}/owned_ad_accounts`, `fields=${ACCOUNT_FIELDS}&limit=100`).catch(() => []);
      const client = await gPaged(`${b.id}/client_ad_accounts`, `fields=${ACCOUNT_FIELDS}&limit=100`).catch(() => []);
      const accounts: any[] = [];
      for (const a of [...owned, ...client]) {
        if (seenAccountIds.has(a.id)) continue;
        seenAccountIds.add(a.id);
        accounts.push(a);
      }
      businesses.push({ id: b.id, name: b.name, ad_accounts: accounts });
    }

    // Anything the token reaches directly that no listed business claimed.
    const direct = await gPaged('me/adaccounts', `fields=${ACCOUNT_FIELDS}&limit=100`).catch(() => []);
    const unassigned: any[] = [];
    for (const a of direct) {
      if (seenAccountIds.has(a.id)) continue;
      seenAccountIds.add(a.id);
      unassigned.push(a);
    }

    return Response.json({
      valid: true,
      account: { id: me.id, name: me.name || me.id },
      businesses,
      unassigned_ad_accounts: unassigned,
    });
  } catch (error) {
    return Response.json({ valid: false, error: (error as Error).message }, { status: 200 });
  }
});
