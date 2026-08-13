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

// Admin only. Returns everything the UI needs to render Meta connection state:
// every MetaConnection (token masked to its last 4 characters), every
// SupplierAdAccount association with its last sync outcome, and yesterday's
// account-level spend per association so the status cards can show a live
// number without loading the whole AdSpend table.
// Payload: { supplier_id?: string } narrows associations to one supplier.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const svc = base44.asServiceRole;
    const now = Date.now();
    const soon = now + 7 * 86400000;

    const conns = await svc.entities.MetaConnection.filter({ platform: 'meta' });
    const connections = conns.map((c: any) => {
      let status = c.status || 'active';
      let expiryWarning = '';
      if (c.token_expires_at) {
        const exp = new Date(c.token_expires_at).getTime();
        if (exp < now) status = 'expired';
        else if (exp < soon) expiryWarning = `Token expires ${c.token_expires_at.slice(0, 10)}. Reconnect soon.`;
      }
      const actionRequired = status === 'expired' || status === 'invalid';
      return {
        id: c.id,
        name: c.name,
        auth_type: c.auth_type,
        status,
        action_required: actionRequired,
        expiry_warning: expiryWarning,
        token_last4: (c.token || '').slice(-4),
        token_expires_at: c.token_expires_at || null,
        connected_account_name: c.connected_account_name || '',
        business_id: c.business_id || '',
        business_name: c.business_name || '',
        last_validated_at: c.last_validated_at || null,
        last_error: c.last_error || '',
      };
    });

    let assocs = await svc.entities.SupplierAdAccount.filter({ platform: 'meta' });
    if (body.supplier_id) assocs = assocs.filter((a: any) => a.supplier_id === body.supplier_id);

    // Yesterday's account-level spend, one query, grouped per ad account.
    const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
    const ySpend = await svc.entities.AdSpend.filter({ level: 'account', date: yesterday });
    const spendByAccount: Record<string, number> = {};
    for (const r of ySpend) {
      spendByAccount[r.ad_account_id] = (spendByAccount[r.ad_account_id] || 0) + (Number(r.spend) || 0);
    }

    // Last 30 days of account-level spend per account (the selected-period total).
    const since30 = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const spend30ByAccount: Record<string, number> = {};
    const s30all = await svc.entities.AdSpend.filter({ level: 'account' }, '-date', 10000).catch(() => []);
    for (const r of s30all) {
      if ((r.date || '') >= since30) spend30ByAccount[r.ad_account_id] = (spend30ByAccount[r.ad_account_id] || 0) + (Number(r.spend) || 0);
    }

    // Scheduled-sync cadence, used to show the next run. The real cron is set up
    // in the Base44 dashboard; this only reflects the configured cadence.
    let syncEnabled = true;
    let intervalMinutes = 60;
    try {
      const syncCfg = await svc.entities.IntegrationConfig.filter({ name: 'meta_sync' });
      const parsed = JSON.parse(syncCfg[0]?.config || '{}');
      if (parsed.enabled === false) syncEnabled = false;
      if (Number(parsed.interval_minutes) > 0) intervalMinutes = Number(parsed.interval_minutes);
    } catch { /* defaults */ }
    const intervalMs = intervalMinutes * 60000;
    const nextScheduled = syncEnabled ? new Date(Math.ceil(now / intervalMs) * intervalMs).toISOString() : null;

    const accounts = assocs.map((a: any) => ({
      id: a.id,
      supplier_id: a.supplier_id,
      supplier_name: a.supplier_name || '',
      connection_id: a.connection_id,
      ad_account_id: a.ad_account_id,
      ad_account_name: a.ad_account_name || '',
      business_name: a.business_name || '',
      currency: a.currency || '',
      timezone_name: a.timezone_name || '',
      enabled: a.enabled !== false,
      backfill_days: a.backfill_days || 30,
      backfill_done: !!a.backfill_done,
      last_synced_at: a.last_synced_at || null,
      last_success_at: a.last_success_at || null,
      last_sync_status: a.last_sync_status || '',
      last_sync_error: a.last_sync_error || '',
      yesterday_spend: spendByAccount[a.ad_account_id] || 0,
      period_spend_30d: spend30ByAccount[a.ad_account_id] || 0,
      business_id: a.business_id || '',
      platform: a.platform || 'meta',
      backfill_since: a.backfill_since || '',
      next_scheduled_sync: (syncEnabled && a.enabled !== false) ? nextScheduled : null,
    }));

    // Meta app credential status (in-app config, else environment vars).
    let metaAppStatus = { configured: false, app_id: '', secret_last4: '', source: 'none' };
    try {
      const appList = await svc.entities.IntegrationConfig.filter({ name: 'meta_app' });
      const cfg = JSON.parse(appList[0]?.config || '{}');
      const aid = String(cfg.app_id || '').trim();
      const sec = String(cfg.app_secret || '').trim();
      const envId = Deno.env.get('META_APP_ID') || '';
      const envSecret = Deno.env.get('META_APP_SECRET') || '';
      const effId = aid || envId;
      const effSecret = sec || envSecret;
      metaAppStatus = {
        configured: !!(effId && effSecret),
        app_id: effId,
        secret_last4: effSecret ? effSecret.slice(-4) : '',
        source: aid ? 'in_app' : (envId ? 'env' : 'none'),
      };
    } catch { /* ignore */ }

    return Response.json({ success: true, yesterday, connections, accounts, meta_app: metaAppStatus, sync: { enabled: syncEnabled, interval_minutes: intervalMinutes, next_scheduled_sync: nextScheduled } });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
