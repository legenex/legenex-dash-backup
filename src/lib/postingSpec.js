// Builds the supplier posting spec on the client so the Posting Specs tab
// renders identical data to the public /functions/spec endpoint (same required
// fields + supplier mapping). Kept intentionally in sync with base44/functions/spec.

function parseArr(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Deterministic spec token derived from the supplier's API key (matches backend).
export async function specToken(apiKey) {
  if (!apiKey) return '';
  const buf = new TextEncoder().encode(`legenex-spec:${apiKey}`);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

function sampleFor(f, sid, vertical) {
  if (f.sample_value) return f.sample_value;
  const name = String(f.field_name || '').toLowerCase();
  const map = {
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

function envelope(over) {
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

export function exampleResponses() {
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

// supplier, key (ApiKey record), customFields, campaigns, verticals, buyers, baseUrl, token
export function buildPostingSpec({ supplier, key, customFields = [], campaigns = [], verticals = [], buyers = [], baseUrl = 'https://api.legenex.com', token = '' }) {
  const base = String(baseUrl || 'https://api.legenex.com').replace(/\/+$/, '');
  const supplierSid = supplier.sid || supplier.name || '';
  const supplierVertical = supplier.vertical || '';

  const accepted = customFields
    .filter(f => f.field_type !== 'Calculated')
    .map(f => ({
      field_name: f.field_name,
      type: f.field_type === 'system' ? 'system' : (f.field_type || 'string'),
      required: !!f.required && f.field_type !== 'system' && !f.system_role,
      system: f.field_type === 'system' || !!f.system_role,
      example: sampleFor(f, supplierSid, supplierVertical),
    }));

  const assignedCampaignIds = parseArr(supplier.campaign_ids);
  const mappedCampaigns = campaigns.filter(c => assignedCampaignIds.includes(c.id));
  const routingRequired = new Set(['sid', 'vertical']);
  if (mappedCampaigns.length > 0 || verticals.length > 0 || buyers.length > 0) {
    routingRequired.add('trustedform_url');
  }

  const byName = new Map();
  for (const f of accepted) byName.set(f.field_name, f);
  for (const rf of routingRequired) {
    const existing = byName.get(rf);
    if (existing) { existing.required = true; }
    else {
      const injected = { field_name: rf, type: 'string', required: true, system: false, example: sampleFor({ field_name: rf }, supplierSid, supplierVertical) };
      byName.set(rf, injected);
      accepted.push(injected);
    }
  }

  const requiredFields = accepted.filter(f => f.required && !f.system);
  const optionalFields = accepted.filter(f => !f.required && !f.system);

  const exampleBody = {};
  for (const f of requiredFields) exampleBody[f.field_name] = f.example;
  if (!exampleBody.sid) exampleBody.sid = supplierSid;
  if (!exampleBody.vertical) exampleBody.vertical = supplierVertical || 'mva';

  return {
    supplier_name: supplier.name,
    sid: supplierSid,
    vertical: supplierVertical,
    endpoint: `${base}/functions/leads`,
    method: 'POST',
    content_type: 'application/json',
    apiKey: key?.key || '',
    keyPrefix: key?.key_prefix || '',
    spec_url: token ? `${base}/functions/spec?sid=${encodeURIComponent(supplierSid)}&t=${token}` : '',
    required_fields: requiredFields,
    optional_fields: optionalFields,
    example_body: exampleBody,
    example_responses: exampleResponses(),
  };
}