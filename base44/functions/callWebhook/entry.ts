import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Inbound call webhook for Ringba and TrueCall. Each call source has its own
// endpoint key (?key=...). Incoming call events are mapped from the call payload
// to our lead schema and ingested through processLead, so validation, dedup,
// CAPI and revenue all run there. Leads appear in the leads views with
// source = the call provider.
//
// URL: /functions/callWebhook?key=<webhook_key>
// The key identifies which LeadSource (and therefore provider + mapping +
// supplier/campaign attribution) this event belongs to.

function parseJsonObject(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { const p = JSON.parse(val); return p && typeof p === 'object' ? p : {}; } catch { return {}; }
}

// Read a value from the payload by dotted path (supports nested Ringba shapes).
function getPath(obj, path) {
  if (!path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
  return cur;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    if (req.method === 'GET') return Response.json({ status: 'ok' }, { status: 200 });
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const urlObj = new URL(req.url);
    const key = urlObj.searchParams.get('key') || '';
    if (!key) return Response.json({ error: 'Missing key' }, { status: 401 });

    const sources = await db.entities.LeadSource.filter({ webhook_key: key });
    const source = (sources || []).find(s => s.kind === 'ringba' || s.kind === 'truecall');
    if (!source) return Response.json({ error: 'Invalid key' }, { status: 401 });
    if (!source.enabled) return Response.json({ error: 'Source disabled' }, { status: 403 });

    let payload = {};
    try { payload = await req.json(); } catch {
      // Some call platforms post form-encoded — fall back to form parsing.
      try {
        const text = await req.text();
        payload = Object.fromEntries(new URLSearchParams(text));
      } catch {}
    }

    // Resolve the supplier API key for ingestion.
    let supplierKey = null;
    if (source.api_key_id) {
      const keys = await db.entities.ApiKey.filter({ id: source.api_key_id });
      if (keys[0]) supplierKey = keys[0].key;
    }
    if (!supplierKey) {
      await db.entities.LeadSource.update(source.id, {
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'Error: no API key linked',
      }).catch(() => {});
      return Response.json({ error: 'Source not fully configured' }, { status: 500 });
    }

    // Map call payload -> our lead fields.
    const mapping = parseJsonObject(source.mapping);
    const leadPayload = {};
    for (const [srcKey, field] of Object.entries(mapping)) {
      if (!field || field === '__ignore__') continue;
      const val = getPath(payload, srcKey);
      if (val !== undefined) leadPayload[field] = val;
    }

    // Attribution + source label.
    leadPayload.lead_source = source.name;
    leadPayload.source_channel = source.kind;
    if (source.campaign_id) leadPayload.campaign_id = source.campaign_id;
    leadPayload._supplier_key = supplierKey;

    let ingestOk = true;
    let ingestResp = null;
    try {
      const res = await base44.asServiceRole.functions.invoke('processLead', leadPayload);
      ingestResp = res?.data ?? res ?? null;
    } catch (err) {
      ingestOk = false;
      await db.entities.ErrorLog.create({
        stage: 'system', severity: 'warning',
        message: `${source.kind} call ingest failed: ${source.name}`,
        detail: JSON.stringify({ error: err.message }),
        supplier_name: source.supplier_name || 'Unknown',
      }).catch(() => {});
    }

    await db.entities.LeadSource.update(source.id, {
      last_synced_at: new Date().toISOString(),
      last_sync_status: ingestOk ? 'Ingested 1 call' : 'Error ingesting call',
      ingested_count: (source.ingested_count || 0) + (ingestOk ? 1 : 0),
    }).catch(() => {});

    return Response.json({ ok: ingestOk, response: ingestResp }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});