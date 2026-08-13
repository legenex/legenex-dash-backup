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

// Admin only, explicit one-off migration to the supplier-first Meta connector.
// Idempotent: safe to run more than once. Never deletes legacy data.
//
// What it does:
// 1. Converts every legacy token in IntegrationConfig(name="meta").config
//    (config.tokens[] or a lone access_token / system_user_token) into a
//    MetaConnection row, matched by legacy_token_id or identical token.
// 2. Converts enabled account-level AdSpendMapping rows that carry a
//    supplier_name into SupplierAdAccount rows, resolving the supplier by
//    case-insensitive name and the connection by the legacy token whose
//    account_ids listed the account (first connection as fallback).
// 3. Stamps supplier_id, supplier_ad_account_id onto existing AdSpend rows for
//    each migrated account.
// Accounts in synced_account_ids with no supplier mapping are reported as
// unassigned; they cannot be migrated without a supplier choice.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const now = new Date().toISOString();
    const report: any = { connections_created: 0, connections_skipped: 0, accounts_linked: 0, accounts_skipped: 0, adspend_rows_stamped: 0, unassigned_accounts: [], warnings: [] };

    // Load legacy config.
    const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'meta' });
    let cfg: any = {};
    try { cfg = JSON.parse(cfgList[0]?.config || '{}'); } catch { cfg = {}; }
    let legacyTokens: { id: string; label: string; token: string; account_ids: string[] }[] = [];
    if (Array.isArray(cfg.tokens) && cfg.tokens.length) {
      legacyTokens = cfg.tokens
        .filter((t: any) => t && t.token)
        .map((t: any, i: number) => ({ id: t.id || `token_${i}`, label: t.label || `Token ${i + 1}`, token: t.token, account_ids: Array.isArray(t.account_ids) ? t.account_ids : [] }));
    } else {
      const legacy = cfg.system_user_token || cfg.master_token || cfg.access_token || '';
      if (legacy) legacyTokens = [{ id: 'default', label: 'Migrated Meta token', token: legacy, account_ids: Array.isArray(cfg.synced_account_ids) ? cfg.synced_account_ids : [] }];
    }

    // 1. Tokens -> MetaConnection.
    const existingConns = await svc.entities.MetaConnection.filter({ platform: 'meta' });
    const connByLegacyId: Record<string, any> = {};
    for (const c of existingConns) {
      if (c.legacy_token_id) connByLegacyId[c.legacy_token_id] = c;
    }
    const existingTokens = new Set(existingConns.map((c: any) => c.token));
    const connections: any[] = [...existingConns];
    for (const t of legacyTokens) {
      if (connByLegacyId[t.id] || existingTokens.has(t.token)) {
        report.connections_skipped++;
        if (!connByLegacyId[t.id]) {
          const found = connections.find((c: any) => c.token === t.token);
          if (found) connByLegacyId[t.id] = found;
        }
        continue;
      }
      const row = await svc.entities.MetaConnection.create({
        name: t.label,
        platform: 'meta',
        auth_type: 'system_user',
        token: t.token,
        token_expires_at: null,
        status: 'active',
        last_validated_at: now,
        last_error: '',
        legacy_token_id: t.id,
      });
      connByLegacyId[t.id] = row;
      connections.push(row);
      existingTokens.add(t.token);
      report.connections_created++;
    }

    if (!connections.length) {
      report.warnings.push('No Meta connections exist and no legacy tokens were found. Nothing to migrate.');
      return Response.json({ success: true, ...report });
    }

    // Resolve which connection reaches a given ad account, by legacy account_ids.
    const connForAccount = (adAccountId: string) => {
      for (const t of legacyTokens) {
        if (t.account_ids.includes(adAccountId) && connByLegacyId[t.id]) return connByLegacyId[t.id];
      }
      return connections[0];
    };

    // 2. Account-level mappings with a supplier -> SupplierAdAccount.
    const suppliers = await svc.entities.Supplier.list();
    const supplierByKey: Record<string, any> = {};
    for (const s of suppliers) supplierByKey[(s.name || '').trim().toLowerCase()] = s;

    const mappings = await svc.entities.AdSpendMapping.list();
    const acctMappings = mappings.filter((m: any) => m.platform === 'meta' && m.enabled && m.match_level === 'ad_account' && m.ad_account_id);

    const existingAssocs = await svc.entities.SupplierAdAccount.filter({ platform: 'meta' });
    const assocByAccount: Record<string, any> = {};
    for (const a of existingAssocs) assocByAccount[a.ad_account_id] = a;

    const mappedAccountIds = new Set<string>();
    const stampTargets: { ad_account_id: string; supplier_id: string; assoc_id: string; supplier_name: string }[] = [];

    for (const m of acctMappings) {
      mappedAccountIds.add(m.ad_account_id);
      if (assocByAccount[m.ad_account_id]) { report.accounts_skipped++; continue; }
      const supplier = supplierByKey[(m.supplier_name || '').trim().toLowerCase()];
      if (!supplier) {
        if (m.supplier_name) report.warnings.push(`Mapping for ${m.ad_account_id} names supplier "${m.supplier_name}" which does not exist. Skipped.`);
        else report.unassigned_accounts.push({ ad_account_id: m.ad_account_id, ad_account_name: m.ad_account_name || '' });
        continue;
      }
      const conn = connForAccount(m.ad_account_id);
      const row = await svc.entities.SupplierAdAccount.create({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        connection_id: conn.id,
        platform: 'meta',
        ad_account_id: m.ad_account_id,
        ad_account_name: m.ad_account_name || '',
        enabled: true,
        backfill_days: 30,
        backfill_done: true, // history already imported by the legacy sync
        last_synced_at: m.last_synced_at || null,
        last_success_at: m.last_synced_at || null,
        last_sync_status: 'Migrated from AdSpendMapping',
        last_sync_error: '',
      });
      assocByAccount[m.ad_account_id] = row;
      stampTargets.push({ ad_account_id: m.ad_account_id, supplier_id: supplier.id, assoc_id: row.id, supplier_name: supplier.name });
      report.accounts_linked++;
    }

    // Selected-but-unmapped accounts cannot be attributed without a supplier.
    const syncedIds: string[] = Array.isArray(cfg.synced_account_ids) ? cfg.synced_account_ids : [];
    for (const id of syncedIds) {
      if (!mappedAccountIds.has(id) && !assocByAccount[id]) {
        report.unassigned_accounts.push({ ad_account_id: id });
      }
    }

    // 3. Stamp attribution onto existing AdSpend rows. One large fetch per
    // account, then update only rows that still lack supplier_id.
    for (const t of stampTargets) {
      let stamped = 0;
      const rows = await svc.entities.AdSpend.filter({ ad_account_id: t.ad_account_id }, '-date', 10000);
      for (const r of rows) {
        if (r.supplier_id) continue;
        await svc.entities.AdSpend.update(r.id, {
          supplier_id: t.supplier_id,
          supplier_ad_account_id: t.assoc_id,
          supplier_name: r.supplier_name || t.supplier_name,
          supplier_key: (r.supplier_name || t.supplier_name).trim().toLowerCase(),
        });
        stamped++;
      }
      report.adspend_rows_stamped += stamped;
    }

    return Response.json({ success: true, ...report });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
