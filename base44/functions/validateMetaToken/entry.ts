import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Validates a Meta (Facebook) access token against the Graph API.
// Payload: { token?: string }
//   - token given: validate that pasted token (used before saving the master token).
//   - token omitted: validate the currently active stored token, preferring the
//     system-user / master token, falling back to the Facebook login token.
// Returns { valid, account_name, account_count, ad_accounts, error }.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    let token = (body.token || '').trim();

    if (!token) {
      const cfgList = await base44.asServiceRole.entities.IntegrationConfig.filter({ name: 'meta' });
      const cfg = cfgList[0];
      if (cfg) {
        try {
          const parsed = JSON.parse(cfg.config || '{}');
          token = parsed.system_user_token || parsed.master_token || parsed.access_token || '';
        } catch { token = ''; }
      }
    }
    if (!token) return Response.json({ valid: false, error: 'No Meta token to validate. Connect first or paste a token.' });

    const ver = 'v21.0';
    const g = async (path: string, params: string) => {
      const url = `https://graph.facebook.com/${ver}/${path}?${params}&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) {
        const e = j.error;
        // Surface the clearest Meta message we can (expired, invalid, missing scope).
        throw new Error(e.error_user_msg || e.message || 'Meta rejected the token');
      }
      return j;
    };

    // GET /me confirms the token authenticates and gives the connected account name.
    const me = await g('me', 'fields=id,name');
    // GET /me/adaccounts confirms ads_read scope and coverage.
    const acctRes = await g('me/adaccounts', 'fields=id,name,account_id,currency&limit=200');
    const adAccounts = acctRes.data || [];

    return Response.json({
      valid: true,
      account_name: me.name || me.id,
      account_count: adAccounts.length,
      ad_accounts: adAccounts,
    });
  } catch (error) {
    return Response.json({ valid: false, error: (error as Error).message }, { status: 200 });
  }
});