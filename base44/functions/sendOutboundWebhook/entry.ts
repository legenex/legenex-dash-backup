import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { passesFilters, buildPayload } from './outboundPayload.generated.js';

// Outbound webhook dispatcher.
//
// Sends a record out to a third party: filters decide whether it fires, the
// payload builder decides what the body looks like, and the credential is
// resolved here from an environment secret so it never touches a record or the
// browser.
//
// SCOPE, deliberately narrow: this does NOT deliver leads to buyers. Buyer
// delivery runs through Lead Distribution (Deliveries and SubDeliveries against
// the canonical routing engine), which owns caps, reservations, the wallet
// ledger and the parity gate. A second lead-delivery path would break the "one
// pipeline, one routing engine" boundary. This is for notifications and
// integrations: Slack, Zapier, a CRM, an internal tool.
//
// Modes:
//   { webhook_id, record_id, record_type }  send one record
//   { webhook_id, test: true, record_id? }  build and report the body, send nothing
//   { webhook_id, record_id, dry_run: true } same as test, kept for symmetry

const RECORD_ENTITIES = {
  lead: 'Lead',
  call: 'CallRecord',
};

function jsonObject(val) {
  if (!val) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  try {
    const p = JSON.parse(val);
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch { return {}; }
}

// A sample record so an operator can build and preview a payload before any
// real record exists. Never sent anywhere: preview only.
const SAMPLE_LEAD = {
  id: 'sample',
  email: 'sample@example.com',
  first_name: 'Sample',
  last_name: 'Lead',
  mobile: '5555550123',
  state: 'TX',
  final_status: 'Sold',
  revenue: 250,
  sid: 'LGNX',
  supplier_name: 'Legenex',
  custom_fields: JSON.stringify({ law_type: 'MVA' }),
};

async function loadRecord(db, recordType, recordId) {
  if (!recordId) return { ...SAMPLE_LEAD, _sample: true };
  const entity = RECORD_ENTITIES[String(recordType || 'lead')] || 'Lead';
  const rec = await db.entities[entity].get(recordId);
  return rec || null;
}

// Send the body. The secret is injected here and nowhere else. A failure never
// echoes the response body, because a receiver can reflect the request back and
// that would put the token into last_error.
async function post(webhook, secret, body) {
  const headers = { 'Content-Type': 'application/json', ...jsonObject(webhook.headers) };
  if (webhook.auth_header) {
    headers.Authorization = String(webhook.auth_header).replaceAll('{{secret}}', secret);
  }
  const res = await fetch(webhook.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Caller model: an admin operator, or an internal scheduled call with no
    // user. Anything else is refused before a record is read.
    let isInternal = false;
    try {
      const user = await base44.auth.me();
      if (!user) isInternal = true;
      else if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch {
      isInternal = true;
    }

    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole;

    if (!body.webhook_id) {
      return Response.json({ error: 'webhook_id is required' }, { status: 400 });
    }

    const webhook = await db.entities.OutboundWebhook.get(body.webhook_id);
    if (!webhook) return Response.json({ error: 'Outbound webhook not found' }, { status: 404 });

    const record = await loadRecord(db, body.record_type, body.record_id);
    if (!record) return Response.json({ error: 'Record not found' }, { status: 404 });

    const preview = !!(body.test || body.dry_run);

    // Filters first: an operator wants to know a payload was FILTERED OUT, not
    // that it silently did nothing.
    const passed = passesFilters(record, webhook.filters);
    const built = buildPayload(webhook, record);

    if (preview) {
      return Response.json({
        status: 'ok',
        preview: true,
        sample: !!record._sample,
        passes_filters: passed,
        payload_valid: built.ok,
        payload_error: built.ok ? null : built.error,
        body: built.ok ? built.body : null,
        raw: built.raw,
      });
    }

    if (!passed) {
      await db.entities.OutboundWebhook.update(webhook.id, { last_status: 'Filtered out', last_error: '' });
      return Response.json({ status: 'ok', sent: false, reason: 'filtered_out' });
    }

    if (!built.ok) {
      await db.entities.OutboundWebhook.update(webhook.id, {
        error_count: (Number(webhook.error_count) || 0) + 1,
        last_status: 'Payload error',
        last_error: String(built.error || '').slice(0, 300),
      });
      return Response.json({ status: 'error', error: built.error }, { status: 400 });
    }

    if (webhook.enabled === false) {
      return Response.json({ status: 'ok', sent: false, reason: 'disabled' });
    }

    if (!/^https:\/\//i.test(String(webhook.url || ''))) {
      return Response.json({ error: 'Webhook URL must be an absolute https URL' }, { status: 400 });
    }

    // The key stored on the record wins; an environment secret NAME is still
    // honoured as a fallback. Read server side, never returned in a response.
    const direct = String(webhook.api_key || '').trim();
    const envName = String(webhook.credential_env || '').trim();
    const secret = direct || (envName ? (Deno.env.get(envName) || '') : '');
    if (webhook.auth_header && !secret) {
      return Response.json({ error: 'This webhook sends an Authorization header but has no API key set.' }, { status: 400 });
    }

    try {
      const res = await post(webhook, secret, built.body);
      await db.entities.OutboundWebhook.update(webhook.id, {
        last_sent_at: new Date().toISOString(),
        last_status: `HTTP ${res.status}`,
        sent_count: (Number(webhook.sent_count) || 0) + (res.ok ? 1 : 0),
        error_count: (Number(webhook.error_count) || 0) + (res.ok ? 0 : 1),
        last_error: res.ok ? '' : `Receiver responded ${res.status}`,
      });
      return Response.json({ status: res.ok ? 'ok' : 'error', sent: res.ok, http_status: res.status, internal: isInternal });
    } catch (e) {
      const message = (e as Error).message || 'Send failed';
      await db.entities.OutboundWebhook.update(webhook.id, {
        error_count: (Number(webhook.error_count) || 0) + 1,
        last_status: 'Failed',
        last_error: message.slice(0, 300),
      });
      return Response.json({ status: 'error', error: message }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ status: 'error', error: (error as Error).message }, { status: 500 });
  }
});
