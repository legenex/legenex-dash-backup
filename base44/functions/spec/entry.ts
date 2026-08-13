import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public posting-spec endpoint (/functions/spec)
// Returns the integration spec a supplier needs to post leads and get them
// accepted & sold: endpoint, headers, required + optional fields, examples.
// Keyed by the supplier's sid + a token derived from their API key, so an
// external supplier can open it without logging into the operator app.
//
// The spec is generated from the SAME system required fields + the supplier's
// mapping that processLead enforces, so it always reflects what is needed to
// accept and sell a lead.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function parseJsonArray(val: unknown) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val as string); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Deterministic spec token derived from the supplier's API key. No new storage.
async function specToken(apiKey: string) {
  const buf = new TextEncoder().encode(`legenex-spec:${apiKey}`);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

Deno.serve(async (req) => {
  const method = req.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (method !== 'GET') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS });
  }

  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const url = new URL(req.url);
    const sid = (url.searchParams.get('sid') || '').trim();
    const token = (url.searchParams.get('t') || url.searchParams.get('token') || '').trim();

    if (!sid) {
      return Response.json({ ok: false, error: 'Missing sid' }, { status: 400, headers: CORS_HEADERS });
    }

    // Resolve supplier by sid.
    const suppliers = await db.entities.Supplier.filter({ sid });
    const supplier = suppliers[0];
    if (!supplier) {
      return Response.json({ ok: false, error: 'Unknown sid' }, { status: 404, headers: CORS_HEADERS });
    }

    // Resolve this supplier's API key.
    const allKeys = await db.entities.ApiKey.list();
    const key = allKeys.find((k: any) => k.supplier_id === supplier.id || k.supplier_name === supplier.name);
    if (!key || !key.key) {
      return Response.json({ ok: false, error: 'No API key for this supplier' }, { status: 404, headers: CORS_HEADERS });
    }

    // Validate the token.
    const expected = await specToken(key.key);
    if (!token || token !== expected) {
      return Response.json({ ok: false, error: 'Invalid token' }, { status: 401, headers: CORS_HEADERS });
    }

    const [appSettingsArr, customFields, campaigns, verticals, buyers] = await Promise.all([
      db.entities.AppSettings.list(),
      db.entities.CustomField.list(),
      db.entities.Campaign.list(),
      db.entities.Vertical.list(),
      db.entities.Buyer.list(),
    ]);
    const appSettings = appSettingsArr[0] || {};
    const baseUrl = (appSettings.public_base_url || 'https://api.legenex.com').replace(/\/+$/, '');

    const spec = buildSpec({
      supplier, key, baseUrl,
      customFields, campaigns, verticals, buyers, token: expected,
    });

    return Response.json({ ok: true, spec }, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message || 'Internal error' }, { status: 500, headers: CORS_HEADERS });
  }
});

// ── Spec builder (kept in sync with processLead's required-fields gate) ──────
// A field is required if CustomField.required is true (and it is not a system /
// system_role field, which are system-populated and never inbound-gated). We
// also fold in the fields the supplier's mapped campaigns / verticals / buyers
// depend on for routing (vertical, sid, brand).
function buildSpec(ctx: any) {
  const { supplier, key, baseUrl, customFields, campaigns, verticals, buyers, token } = ctx;

  const supplierSid = supplier.sid || supplier.name || '';
  const supplierVertical = supplier.vertical || '';

  // System-required fields (from CustomFields), excluding system-populated ones.
  const accepted = (customFields || [])
    .filter((f: any) => f.field_type !== 'Calculated')
    .map((f: any) => ({
      field_name: f.field_name,
      type: f.field_type === 'system' ? 'system' : (f.field_type || 'string'),
      required: !!f.required && f.field_type !== 'system' && !f.system_role,
      system: f.field_type === 'system' || !!f.system_role,
      example: sampleFor(f, supplierSid, supplierVertical),
    }));

  // Routing fields the supplier's mapped campaigns / verticals / buyers depend on.
  const assignedCampaignIds = parseJsonArray(supplier.campaign_ids);
  const mappedCampaigns = (campaigns || []).filter((c: any) => assignedCampaignIds.includes(c.id));
  const routingRequired = new Set<string>(['sid', 'vertical']);
  // If any mapped campaign / vertical / buyer is present, brand helps routing.
  if (mappedCampaigns.length > 0 || (verticals || []).length > 0 || (buyers || []).length > 0) {
    routingRequired.add('trustedform_url');
  }

  // Ensure routing-required fields appear as required even if not flagged.
  const byName = new Map<string, any>();
  for (const f of accepted) byName.set(f.field_name, f);
  for (const rf of routingRequired) {
    const existing = byName.get(rf);
    if (existing) { existing.required = true; }
    else {
      const injected = {
        field_name: rf, type: 'string', required: true, system: false,
        example: sampleFor({ field_name: rf }, supplierSid, supplierVertical),
      };
      byName.set(rf, injected);
      accepted.push(injected);
    }
  }

  const requiredFields = accepted.filter((f: any) => f.required && !f.system);
  const optionalFields = accepted.filter((f: any) => !f.required && !f.system);

  // Example request body from the required + a few common fields.
  const exampleBody: Record<string, any> = {};
  for (const f of requiredFields) exampleBody[f.field_name] = f.example;
  if (!exampleBody.sid) exampleBody.sid = supplierSid;
  if (!exampleBody.vertical) exampleBody.vertical = supplierVertical || 'mva';

  const nowIso = new Date().toISOString();

  return {
    supplier_name: supplier.name,
    sid: supplierSid,
    vertical: supplierVertical,
    endpoint: `${baseUrl}/functions/leads`,
    method: 'POST',
    content_type: 'application/json',
    headers: [
      { key: 'X-API-KEY', value: key.key, description: 'Your supplier API key' },
      { key: 'Content-Type', value: 'application/json', description: '' },
    ],
    spec_url: `${baseUrl}/functions/spec?sid=${encodeURIComponent(supplierSid)}&t=${token}`,
    required_fields: requiredFields,
    optional_fields: optionalFields,
    example_body: exampleBody,
    example_responses: buildExampleResponses(nowIso),
    generated_at: nowIso,
  };
}

function sampleFor(f: any, sid: string, vertical: string) {
  if (f.sample_value) return f.sample_value;
  const name = String(f.field_name || '').toLowerCase();
  const map: Record<string, string> = {
    sid, vertical: vertical || 'mva',
    first_name: 'John', last_name: 'Doe', firstname: 'John', lastname: 'Doe',
    email: 'john.doe@example.com',
    mobile: '13105551234', phone: '13105551234', phone1: '13105551234',
    zip: '90210', zipcode: '90210', state: 'CA', city: 'Los Angeles',
    trustedform_url: 'https://cert.trustedform.com/0000000000000000000000000000000000000000',
    ip_address: '203.0.113.10', optin_url: 'https://landing.example.com/offer',
    lead_status: 'Qualified',
  };
  if (map[name] !== undefined) return map[name];
  if (f.field_type === 'number') return '0';
  if (f.field_type === 'boolean') return 'true';
  if (f.field_type === 'date') return '1990-01-15';
  return 'sample';
}

// Layered envelope examples — same shape processLead returns (buildEnvelope).
function envelope(over: Record<string, any>) {
  return {
    ok: true,
    trace_id: 't_example_0001',
    received_at: '2026-01-01T12:00:00.000Z',
    acceptance: 'accepted',
    lead_id: '100234',
    lead_status: 'sold',
    sold: true,
    revenue: 42,
    currency: 'USD',
    code: 'SOLD',
    reason: null,
    message: 'Lead sold',
    Response: 'Sold',
    ...over,
  };
}

function buildExampleResponses(_nowIso: string) {
  return {
    accepted_sold: envelope({}),
    unsold: envelope({
      acceptance: 'accepted', lead_status: 'unsold', sold: false, revenue: null,
      code: 'UNSOLD', reason: 'No buyer match for this lead',
      message: 'No buyer match for this lead', Response: 'Unsold',
    }),
    queued: envelope({
      acceptance: 'queued', lead_status: 'queued', sold: false, revenue: null,
      code: 'MISSING_FIELDS', reason: 'Missing required fields: trustedform_url',
      message: 'Missing required fields: trustedform_url', Response: 'Queued',
    }),
  };
}