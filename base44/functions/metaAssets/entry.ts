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

// Lists Meta (Facebook) Marketing assets across every configured token.
// Tokens now come from MetaConnection rows (the connector's source of truth);
// for backward compatibility, legacy tokens stored in
// IntegrationConfig(name="meta") as config.tokens or a lone
// config.access_token / system_user_token are appended when no connection has
// migrated them yet. Returns combined accounts, pages and lead forms plus a
// per-token summary.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;

    // Primary: MetaConnection rows that are not marked invalid.
    let tokens: { id: string; label: string; token: string }[] = [];
    const conns = await svc.entities.MetaConnection.filter({ platform: 'meta' }).catch(() => []);
    for (const c of conns) {
      if (!c.token || c.status === 'invalid') continue;
      if (c.token_expires_at && new Date(c.token_expires_at).getTime() < Date.now()) continue;
      tokens.push({ id: c.id, label: c.name || 'Connection', token: c.token });
    }

    // Legacy fallback: the old IntegrationConfig blob, skipping tokens that a
    // migrated connection already carries.
    const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'meta' });
    const cfg = cfgList[0];
    if (cfg) {
      try {
        const parsed = JSON.parse(cfg.config || '{}');
        const known = new Set(tokens.map(t => t.token));
        const legacyList: any[] = Array.isArray(parsed.tokens) && parsed.tokens.length
          ? parsed.tokens
          : [];
        for (let i = 0; i < legacyList.length; i++) {
          const t = legacyList[i];
          if (t && t.token && !known.has(t.token)) {
            tokens.push({ id: t.id || `legacy_${i}`, label: t.label || `Legacy token ${i + 1}`, token: t.token });
            known.add(t.token);
          }
        }
        if (!legacyList.length) {
          const legacy = parsed.system_user_token || parsed.master_token || parsed.access_token || '';
          if (legacy && !known.has(legacy)) tokens.push({ id: 'legacy_default', label: 'Legacy token', token: legacy });
        }
      } catch { /* ignore malformed legacy config */ }
    }

    if (!tokens.length) return Response.json({ connected: false });

    const ver = 'v21.0';
    const g = async (token: string, path: string, params: string) => {
      const url = `https://graph.facebook.com/${ver}/${path}?${params}&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.data || j;
    };

    const accountsById: Record<string, any> = {};
    const pagesById: Record<string, any> = {};
    const leadForms: any[] = [];
    const tokenSummaries: any[] = [];
    let firstAccount: any = null;

    for (const t of tokens) {
      const summary: any = { id: t.id, label: t.label, valid: false, accounts: 0, error: '' };
      try {
        const me = await g(t.token, 'me', 'fields=id,name');
        summary.valid = true;
        if (!firstAccount) firstAccount = me;

        const adAccounts = await g(t.token, 'me/adaccounts', 'fields=id,name,account_id,currency,timezone_name&limit=200').catch(() => []);
        let reached = 0;
        for (const a of adAccounts || []) {
          reached++;
          if (!accountsById[a.id]) accountsById[a.id] = { ...a, token_id: t.id, token_label: t.label };
        }
        summary.accounts = reached;

        const pages = await g(t.token, 'me/accounts', 'fields=id,name&limit=100').catch(() => []);
        const newPages: any[] = [];
        for (const p of pages || []) {
          if (!pagesById[p.id]) { pagesById[p.id] = { ...p, token_id: t.id }; newPages.push(p); }
        }
        // Lead forms per newly seen page (best-effort, first few pages).
        for (const p of newPages.slice(0, 10)) {
          const forms = await g(t.token, `${p.id}/leadgen_forms`, `fields=id,name,status&limit=50`).catch(() => []);
          for (const f of forms || []) leadForms.push({ ...f, page_id: p.id, page_name: p.name });
        }
      } catch (e) {
        summary.error = (e as Error).message;
      }
      tokenSummaries.push(summary);
    }

    return Response.json({
      connected: true,
      account: firstAccount,
      ad_accounts: Object.values(accountsById),
      pages: Object.values(pagesById),
      lead_forms: leadForms,
      tokens: tokenSummaries,
    });
  } catch (error) {
    return Response.json({ connected: false, error: (error as Error).message }, { status: 200 });
  }
});
