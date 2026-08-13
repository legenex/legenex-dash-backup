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

// Syncs Meta ad spend for every enabled SupplierAdAccount association.
// Attribution model: each SupplierAdAccount row links one Meta ad account to
// exactly one Supplier (enforced by a unique constraint), and every imported
// AdSpend row inherits supplier_id from that association at sync time.
//
// Windows:
//   - First sync per account: today minus backfill_days .. today (account level).
//   - Later syncs: last success minus 3 days .. today, to absorb Meta's spend
//     restatement window.
//   - Campaign and ad level rows (used by the Ad Manager pages, not by cost
//     totals) always cover only the trailing 30 days to keep sync time bounded.
// Insights calls use time_increment=1, limit=500 and follow paging.next, and
// long ranges are chunked into 180 day segments.
//
// Cost totals must only ever read level=account rows; campaign and ad rows are
// granular views and would double count if summed alongside account rows.
//
// Manual calls carry a user token and require admin; scheduled service-role
// calls carry no user. Optional payload filters: { supplier_id, ad_account_ids }.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (user && !isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const svc = base44.asServiceRole;
    const ver = 'v21.0';
    const trigger = body.trigger || (user ? 'manual' : 'scheduled');

    // Load the associations to sync.
    let assocs = await svc.entities.SupplierAdAccount.filter({ platform: 'meta', enabled: true });
    if (body.supplier_id) assocs = assocs.filter((a: any) => a.supplier_id === body.supplier_id);
    if (Array.isArray(body.ad_account_ids) && body.ad_account_ids.length) {
      assocs = assocs.filter((a: any) => body.ad_account_ids.includes(a.ad_account_id));
    }

    if (!assocs.length) {
      // Point legacy setups at the migration instead of silently doing nothing.
      const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'meta' });
      let hasLegacy = false;
      try {
        const cfg = JSON.parse(cfgList[0]?.config || '{}');
        hasLegacy = Boolean((Array.isArray(cfg.tokens) && cfg.tokens.length) || cfg.system_user_token || cfg.access_token);
      } catch { hasLegacy = false; }
      return Response.json({
        success: true,
        accounts_synced: 0,
        rows_synced: 0,
        hint: hasLegacy
          ? 'No supplier ad account associations found, but legacy Meta tokens exist. Run migrateMetaConnector to convert them.'
          : 'No supplier ad account associations to sync. Link an ad account to a supplier first.',
      });
    }

    // Load connections referenced by the associations.
    const connIds: string[] = Array.from(new Set(assocs.map((a: any) => String(a.connection_id || '')).filter(Boolean)));
    const connections: Record<string, any> = {};
    for (const id of connIds) {
      const c = await svc.entities.MetaConnection.get(id).catch(() => null);
      if (c) connections[id] = c;
    }

    // Account-level AdSpendMapping rows still supply vertical and brand tags.
    const allMappings = await svc.entities.AdSpendMapping.list();
    const acctMappingById: Record<string, any> = {};
    for (const m of allMappings) {
      if (m.platform === 'meta' && m.enabled && m.match_level === 'ad_account' && m.ad_account_id) {
        acctMappingById[m.ad_account_id] = m;
      }
    }

    const dayMs = 86400000;
    const dateStr = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const todayStr = dateStr(today);
    const daysAgoStr = (n: number) => dateStr(new Date(today.getTime() - n * dayMs));
    const MAX_HISTORY_DAYS = 1100; // Meta insights history limit is about 37 months.

    // Meta restates spend for days after the fact, so every pass re-pulls a
    // trailing tail. A deep pass additionally re-pulls the whole current month,
    // which is what makes month to date converge on the Ads Manager total
    // instead of freezing at whatever Meta reported on the first pull.
    // Manual syncs are deep. Scheduled syncs are shallow by default so an
    // hourly cadence across every ad account stays cheap; schedule a second
    // daily job with { "mode": "month" } for the deep pass.
    const RESTATEMENT_DAYS = 3;
    const mode = String(body.mode || (user ? 'month' : 'incremental'));
    const deepPass = mode === 'month';
    const monthStart = `${todayStr.slice(0, 7)}-01`;

    const LEAD_ACTION_PRIORITY = ['offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.lead_grouped'];
    const extractLeads = (actions: any): number => {
      if (!Array.isArray(actions)) return 0;
      for (const type of LEAD_ACTION_PRIORITY) {
        const matches = actions.filter((a: any) => a && a.action_type === type);
        if (matches.length) return matches.reduce((sum: number, a: any) => sum + (Number(a.value) || 0), 0);
      }
      return 0;
    };
    const sumActionValues = (actions: any): number => {
      if (!Array.isArray(actions)) return 0;
      return actions.reduce((sum: number, a: any) => sum + (Number(a?.value) || 0), 0);
    };

    // Fetch daily insights for one level across [since, until], chunked and paginated.
    // Throws on Graph errors, tagging auth failures so the connection can be flagged.
    const fetchInsights = async (token: string, node: string, level: string, fields: string, since: string, until: string): Promise<any[]> => {
      const rows: any[] = [];
      let chunkStart = new Date(`${since}T00:00:00Z`);
      const rangeEnd = new Date(`${until}T00:00:00Z`);
      while (chunkStart <= rangeEnd) {
        const chunkEnd = new Date(Math.min(chunkStart.getTime() + 179 * dayMs, rangeEnd.getTime()));
        const params = new URLSearchParams({
          level,
          fields,
          time_increment: '1',
          time_range: JSON.stringify({ since: dateStr(chunkStart), until: dateStr(chunkEnd) }),
          limit: '500',
        });
        let url = `https://graph.facebook.com/${ver}/${node}/insights?${params}&access_token=${encodeURIComponent(token)}`;
        for (let page = 0; page < 20 && url; page++) {
          const r = await fetch(url);
          const j = await r.json();
          if (j.error) {
            const err: any = new Error(j.error.error_user_msg || j.error.message || 'Graph API error');
            err.metaCode = j.error.code;
            throw err;
          }
          for (const row of j.data || []) rows.push(row);
          url = j.paging?.next || '';
        }
        chunkStart = new Date(chunkEnd.getTime() + dayMs);
      }
      return rows;
    };

    // Bulk upsert: load existing rows for this account and level once, then
    // delete the ones being replaced and insert fresh rows.
    let skippedNoDate = 0;
    let unchangedRows = 0;
    const upsertLevel = async (node: string, level: string, keyOf: (r: any) => string, rows: any[], build: (r: any) => any): Promise<number> => {
      const existing = await svc.entities.AdSpend.filter({ ad_account_id: node, level }, '-date', 10000);
      const existingByKey: Record<string, any[]> = {};
      for (const e of existing) {
        const k = keyOf(e);
        (existingByKey[k] = existingByKey[k] || []).push(e);
      }
      let inserted = 0;
      let unchanged = 0;
      let skipped = 0;
      const sameNum = (a: any, b: any) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
      for (const row of rows) {
        // Build first, then derive the dedup key from the built row. The built
        // row uses AdSpend field names, which is how existing rows are keyed, so
        // this stays correct for raw Meta insight rows and for aggregated
        // attribution rows alike. Keying off raw Meta field names broke dedup on
        // the aggregated path and let duplicates accumulate on every sync.
        const doc = build(row);
        if (!doc || !doc.date) { skipped++; continue; }
        const k = keyOf(doc);
        const prior = existingByKey[k] || [];
        // Settled days come back identical on every pass. Rewriting an unchanged
        // row costs a delete plus a create, and that write volume is the whole
        // reason an hourly cadence across every ad account would be expensive.
        if (prior.length === 1
          && sameNum(prior[0].spend, doc.spend)
          && sameNum(prior[0].impressions, doc.impressions)
          && sameNum(prior[0].clicks, doc.clicks)
          && sameNum(prior[0].leads, doc.leads)
          && String(prior[0].supplier_id || '') === String(doc.supplier_id || '')) {
          delete existingByKey[k];
          unchanged++;
          continue;
        }
        for (const e of prior) await svc.entities.AdSpend.delete(e.id);
        delete existingByKey[k];
        await svc.entities.AdSpend.create(doc);
        inserted++;
      }
      if (skipped) skippedNoDate += skipped;
      unchangedRows += unchanged;
      return inserted;
    };

    let accountsSynced = 0;
    let accountsFailed = 0;
    // Spend on campaigns that resolve to no supplier at all. Never silently
    // dropped without being reported, since it is the gap between the Ads
    // Manager total and the platform cost total.
    let unattributedSpend = 0;
    let accountRows = 0;
    let campaignRows = 0;
    let adRows = 0;
    const accountErrors: any[] = [];
    const now = new Date().toISOString();

    // Campaign-level supplier mappings, indexed by account then campaign id.
    const campMapsRaw = await svc.entities.AdSpendMapping.filter({ platform: 'meta', match_level: 'campaign' });
    const campMapsByAcct: Record<string, Record<string, any>> = {};
    for (const m of campMapsRaw) {
      if (!m.ad_account_id || !m.meta_campaign_id) continue;
      (campMapsByAcct[m.ad_account_id] = campMapsByAcct[m.ad_account_id] || {})[m.meta_campaign_id] = m;
    }

    for (const assoc of assocs) {
      const node = assoc.ad_account_id;
      const conn = connections[assoc.connection_id];
      const runStart = Date.now();
      let levelError = '';

      // Records one MetaSyncRun history row for this account.
      const logRun = async (fields: any) => {
        await svc.entities.MetaSyncRun.create({
          platform: 'meta',
          connection_id: assoc.connection_id || '',
          supplier_ad_account_id: assoc.id,
          supplier_id: assoc.supplier_id || '',
          supplier_name: assoc.supplier_name || '',
          ad_account_id: node,
          ad_account_name: assoc.ad_account_name || '',
          currency: assoc.currency || '',
          trigger,
          started_at: new Date(runStart).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - runStart,
          account_rows: 0,
          spend_days: 0,
          spend_total: 0,
          ...fields,
        }).catch(() => {});
      };

      const failAccount = async (message: string) => {
        accountsFailed++;
        accountErrors.push({ ad_account_id: node, supplier: assoc.supplier_name || assoc.supplier_id, error: message });
        await svc.entities.SupplierAdAccount.update(assoc.id, {
          last_synced_at: now,
          last_sync_status: 'Error',
          last_sync_error: message,
        }).catch(() => {});
        await logRun({ status: 'error', error_message: message });
      };

      if (!conn || !conn.token) {
        await failAccount('Connection missing or has no token');
        continue;
      }
      if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now()) {
        await svc.entities.MetaConnection.update(conn.id, { status: 'expired', last_error: 'Token expired' }).catch(() => {});
        await failAccount('Connection token expired. Reconnect Meta.');
        continue;
      }

      // Resolve the account-level window.
      const backfillDays = Math.min(Math.max(Number(assoc.backfill_days) || 30, 1), MAX_HISTORY_DAYS);
      let since: string;
      if (!assoc.backfill_done) {
        if (assoc.backfill_since && /^\d{4}-\d{2}-\d{2}$/.test(assoc.backfill_since)) {
          since = assoc.backfill_since;
          if (since < daysAgoStr(MAX_HISTORY_DAYS)) since = daysAgoStr(MAX_HISTORY_DAYS);
          if (since > todayStr) since = todayStr;
        } else {
          since = daysAgoStr(backfillDays - 1);
        }
      } else {
        const lastSuccess = assoc.last_success_at ? assoc.last_success_at.slice(0, 10) : daysAgoStr(30);
        const base = new Date(`${lastSuccess}T00:00:00Z`);
        since = dateStr(new Date(base.getTime() - RESTATEMENT_DAYS * dayMs));
        if (deepPass && monthStart < since) since = monthStart;
        if (since < daysAgoStr(MAX_HISTORY_DAYS)) since = daysAgoStr(MAX_HISTORY_DAYS);
      }
      const granularSince = since > daysAgoStr(29) ? since : daysAgoStr(29);

      const mapping = acctMappingById[node];
      const supplierName = assoc.supplier_name || mapping?.supplier_name || '';
      const supplierKey = supplierName.trim().toLowerCase();
      const baseRow = (row: any) => ({
        platform: 'meta',
        mapping_id: mapping?.id || '',
        supplier_id: assoc.supplier_id,
        supplier_ad_account_id: assoc.id,
        date: row.date_start,
        ad_account_id: node,
        spend: Number(row.spend) || 0,
        currency: assoc.currency || '',
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        leads: extractLeads(row.actions),
        vertical: mapping?.vertical || '',
        brand: mapping?.brand || '',
        supplier_name: supplierName,
        supplier_key: supplierKey,
        cost_source: assoc.ad_account_name || node,
      });

      try {
        const acctCampMaps = campMapsByAcct[node] || {};
        // Campaign mappings created by older tooling carry supplier_name but no
        // supplier_id. The aggregation below keys on the id, so without this
        // fallback every campaign is treated as unattributed, no account level
        // rows are written at all, and cost totals silently read zero while the
        // campaign rows still look populated. Fall back to the supplier the ad
        // account itself is associated with.
        const resolveSupplier = (cm: any) => ({
          id: cm?.supplier_id || assoc.supplier_id || '',
          name: cm?.supplier_name || assoc.supplier_name || '',
          vertical: cm?.vertical || '',
          brand: cm?.brand || '',
        });
        // Campaign attribution when the account is in campaign mode, has no
        // single supplier, or has any campaign mappings. Otherwise legacy
        // whole-account attribution.
        const useCampaign = (assoc.mapping_mode === 'campaign') || (!assoc.supplier_id) || (Object.keys(acctCampMaps).length > 0);
        const daysCovered = Math.round((new Date(`${todayStr}T00:00:00Z`).getTime() - new Date(`${since}T00:00:00Z`).getTime()) / dayMs) + 1;
        let spendTotal = 0;
        let acctRowCount = 0;

        if (useCampaign) {
          // CAMPAIGN ATTRIBUTION: spend follows the campaign to supplier map.
          const campInsights = await fetchInsights(conn.token, node, 'campaign', 'spend,impressions,clicks,date_start,actions,campaign_id,campaign_name', since, todayStr);

          // Detail rows per campaign per day, stamped with the mapped supplier
          // for display. Only account-level rows drive cost, so these never
          // double count.
          campaignRows += await upsertLevel(node, 'campaign', (r) => `${r.date}|${r.meta_campaign_id || ''}`, campInsights, (row) => {
            const sup = resolveSupplier(acctCampMaps[row.campaign_id || '']);
            return {
              platform: 'meta',
              supplier_id: sup.id,
              supplier_ad_account_id: assoc.id,
              date: row.date_start,
              ad_account_id: node,
              level: 'campaign',
              spend: Number(row.spend) || 0,
              currency: assoc.currency || '',
              impressions: Number(row.impressions) || 0,
              clicks: Number(row.clicks) || 0,
              leads: extractLeads(row.actions),
              vertical: sup.vertical,
              brand: sup.brand,
              supplier_name: sup.name,
              supplier_key: sup.name.trim().toLowerCase(),
              cost_source: assoc.ad_account_name || node,
              meta_campaign_id: row.campaign_id || '',
              meta_campaign_name: row.campaign_name || '',
              adset_id: '', adset_name: '', ad_id: '', ad_name: '',
            };
          });

          // Aggregate mapped campaigns into per (supplier, day) account rows that
          // drive supplier cost. Unmapped campaigns are skipped (unattributed).
          const bySupDay: Record<string, any> = {};
          for (const row of campInsights) {
            const sup = resolveSupplier(acctCampMaps[row.campaign_id || '']);
            if (!sup.id) { unattributedSpend += Number(row.spend) || 0; continue; }
            const key = `${sup.id}|${row.date_start}`;
            const agg = bySupDay[key] || (bySupDay[key] = { sup, date: row.date_start, spend: 0, impressions: 0, clicks: 0, leads: 0 });
            agg.spend += Number(row.spend) || 0;
            agg.impressions += Number(row.impressions) || 0;
            agg.clicks += Number(row.clicks) || 0;
            agg.leads += extractLeads(row.actions);
          }
          const attribution = Object.values(bySupDay) as any[];
          spendTotal = attribution.reduce((s, r) => s + r.spend, 0);
          acctRowCount = attribution.length;

          // Remove any legacy single-supplier account rows for this account in
          // the window, then write the per-supplier attribution rows.
          const legacyAcct = await svc.entities.AdSpend.filter({ ad_account_id: node, level: 'account' }, '-date', 10000);
          for (const e of legacyAcct) {
            if ((e.date || '') >= since && !String(e.meta_campaign_id || '').startsWith('__sup__')) await svc.entities.AdSpend.delete(e.id).catch(() => {});
          }
          accountRows += await upsertLevel(node, 'account', (r) => `${r.date}|${r.meta_campaign_id}`, attribution, (agg) => ({
            platform: 'meta',
            supplier_id: agg.sup.id,
            supplier_ad_account_id: assoc.id,
            date: agg.date,
            ad_account_id: node,
            level: 'account',
            spend: agg.spend,
            currency: assoc.currency || '',
            impressions: agg.impressions,
            clicks: agg.clicks,
            leads: agg.leads,
            vertical: agg.sup.vertical,
            brand: agg.sup.brand,
            supplier_name: agg.sup.name,
            supplier_key: agg.sup.name.trim().toLowerCase(),
            cost_source: assoc.ad_account_name || node,
            meta_campaign_id: `__sup__${agg.sup.id}`,
            meta_campaign_name: '', adset_id: '', adset_name: '', ad_id: '', ad_name: '',
          }));
        } else {
          // LEGACY ACCOUNT ATTRIBUTION: whole account to supplier_id.
          const acctInsights = await fetchInsights(conn.token, node, 'account', 'spend,impressions,clicks,date_start,actions', since, todayStr);
          acctRowCount = acctInsights.length;
          spendTotal = acctInsights.reduce((s: number, r: any) => s + (Number(r.spend) || 0), 0);
          accountRows += await upsertLevel(node, 'account', (r) => r.date, acctInsights, (row) => ({
            ...baseRow(row),
            level: 'account',
            meta_campaign_id: '', meta_campaign_name: '', adset_id: '', adset_name: '', ad_id: '', ad_name: '',
          }));
          try {
            const campInsights = await fetchInsights(conn.token, node, 'campaign', 'spend,impressions,clicks,date_start,actions,campaign_id,campaign_name', granularSince, todayStr);
            campaignRows += await upsertLevel(node, 'campaign', (r) => `${r.date}|${r.meta_campaign_id || ''}`, campInsights, (row) => ({
              ...baseRow(row),
              level: 'campaign',
              meta_campaign_id: row.campaign_id || '', meta_campaign_name: row.campaign_name || '',
              adset_id: '', adset_name: '', ad_id: '', ad_name: '',
            }));
          } catch (e) {
            levelError = `Campaign level: ${(e as Error).message}`;
            accountErrors.push({ ad_account_id: node, level: 'campaign', error: (e as Error).message });
          }
          try {
            const adInsights = await fetchInsights(conn.token, node, 'ad', 'spend,impressions,clicks,date_start,actions,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,video_play_actions,video_thruplay_watched_actions', granularSince, todayStr);
            adRows += await upsertLevel(node, 'ad', (r) => `${r.date}|${r.ad_id || ''}`, adInsights, (row) => ({
              ...baseRow(row),
              level: 'ad',
              meta_campaign_id: row.campaign_id || '', meta_campaign_name: row.campaign_name || '',
              adset_id: row.adset_id || '', adset_name: row.adset_name || '',
              ad_id: row.ad_id || '', ad_name: row.ad_name || '',
              video_3s_views: sumActionValues(row.video_play_actions),
              video_thruplays: sumActionValues(row.video_thruplay_watched_actions),
            }));
          } catch (e) {
            levelError = `Ad level: ${(e as Error).message}`;
            accountErrors.push({ ad_account_id: node, level: 'ad', error: (e as Error).message });
          }
        }

        accountsSynced++;
        await svc.entities.SupplierAdAccount.update(assoc.id, {
          last_synced_at: now,
          last_success_at: now,
          last_sync_status: `Imported ${daysCovered} day${daysCovered === 1 ? '' : 's'}`,
          last_sync_error: '',
          backfill_done: true,
        }).catch(() => {});
        await logRun({
          status: levelError ? 'partial' : 'success',
          error_message: levelError,
          account_rows: acctRowCount,
          spend_days: daysCovered,
          spend_total: spendTotal,
        });
      } catch (e) {
        const err = e as any;
        // Graph auth errors (code 190) invalidate the whole connection.
        if (err.metaCode === 190) {
          await svc.entities.MetaConnection.update(conn.id, { status: 'invalid', last_error: err.message }).catch(() => {});
        }
        await failAccount(err.message || 'Sync failed');
      }
    }

    // Refresh validation timestamps on connections that worked this run.
    for (const id of Object.keys(connections)) {
      const failed = accountErrors.some((e: any) => {
        const a = assocs.find((x: any) => x.ad_account_id === e.ad_account_id);
        return a && a.connection_id === id && !e.level;
      });
      if (!failed) {
        await svc.entities.MetaConnection.update(id, { status: 'active', last_validated_at: now, last_error: '' }).catch(() => {});
      }
    }

    return Response.json({
      success: true,
      accounts_synced: accountsSynced,
      accounts_failed: accountsFailed,
      rows_synced: accountRows,
      campaign_rows_inserted: campaignRows,
      ad_rows_inserted: adRows,
      skipped_no_date: skippedNoDate,
      unchanged_rows: unchangedRows,
      unattributed_spend: Number(unattributedSpend.toFixed(2)),
      mode,
      account_errors: accountErrors,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
