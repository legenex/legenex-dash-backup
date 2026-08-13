import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function sha256Hex(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULT_CAPI_TEMPLATE = JSON.stringify({
  data: [{
    event_name: "{{lead_event}}",
    event_time: "{{event_time}}",
    action_source: "website",
    event_id: "{{event_id}}",
    event_source_url: "{{optin_url}}",
    user_data: {
      client_user_agent: "{{user_agent}}",
      client_ip_address: "{{ip_address}}",
      fbc: "{{fbc}}",
      fbp: "{{fbp}}",
      em: "{{email}}",
      ph: "{{mobile}}",
      fn: "{{first_name}}",
      ln: "{{last_name}}",
      ct: "{{geoip_city}}",
      st: "{{geoip_state}}",
      zp: "{{zip}}",
      country: "{{geoip_country}}",
      external_id: "{{lead_id}}"
    },
    custom_data: {
      content_name: "{{content_name}}",
      content_category: "{{content_category}}",
      vertical: "{{vertical}}",
      brand: "{{brand}}",
      funnel_name: "{{funnel_name}}",
      qualification_status: "{{qualification_status}}",
      event_category: "{{event_category}}",
      lead_event_type: "{{lead_event_type}}",
      value: "{{value}}"
    }
  }]
}, null, 2);

// Test lead data used to resolve template tokens when sending a CAPI test event.
const DEFAULT_TEST_LEAD_DATA = {
  email: 'test@example.com',
  first_name: 'John',
  last_name: 'Doe',
  mobile: '4249449001',
  ip_address: '10.10.10.10',
  optin_url: 'https://example.com/landing',
  user_agent: 'Mozilla/5.0 (Test Browser)',
  fbc: 'fb.1.1234567890.abcdef',
  fbp: 'fb.1.1234567890.123456',
  city: 'Los Angeles',
  state: 'CA',
  zip: '90210',
  country: 'USA',
  lead_id: 999,
  conv_value: 0,
  revenue: 25,
  event_id: 'test-event-001',
};

function phoneUs(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 10) return '1' + digits;
  return digits;
}

function escapeJsonString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

function resolveTokenValue(token, d, leadId) {
  switch (token) {
    case '_c_eventtime':
    case 'event_time':
      return String(Math.floor(Date.now() / 1000));
    case '_c_eventurl':
    case 'optin_url':
      return d.optin_url || d.optinurl || '';
    case '_device_userAgent':
    case 'user_agent':
      return d.user_agent || d.useragent || '';
    case '_tracking__fbc':
    case 'fbc':
      return d.fbc || d._tracking__fbc || '';
    case '_tracking__fbp':
    case 'fbp':
      return d.fbp || d._tracking__fbp || '';
    case '_geoip_city':
    case 'geoip_city':
    case 'city':
      return d.geoip_city || d.city || d._geoip_city || '';
    case '_geoip_regionName':
    case 'geoip_state':
    case 'state':
      return d.geoip_state || d.state || d._geoip_regionName || '';
    case '_geoip_countryName':
    case 'geoip_country':
    case 'country':
      return d.geoip_country || d.country || d._geoip_countryName || '';
    case 'mobile_raw':
    case 'mobile':
      return d.mobile || d.phone1 || d.phone || d.phone_number || '';
    case 'conv_value':
      return d.conv_value != null ? String(d.conv_value) : '';
    case 'event_id':
      return d.event_id || d.eventId || (leadId ? String(leadId) : '');
    case 'ip_address':
      return d.ip_address || d.ipaddress || '';
    case 'lead_id':
      return d.lead_id != null ? String(d.lead_id) : '';
    case 'email':
      return d.email || '';
    case 'first_name':
      return d.first_name || d.firstname || '';
    case 'last_name':
      return d.last_name || d.lastname || '';
    case 'zip':
      return d.zip || d.zipcode || '';
    case 'lead_event':
      return d.lead_event || '';
    default:
      const val = d[token];
      return val !== undefined && val !== null ? String(val) : '';
  }
}

async function applyTransform(value, transform) {
  switch (transform) {
    case 'sha256': return await sha256Hex(value);
    case 'lowercase': return String(value).toLowerCase();
    case 'uppercase': return String(value).toUpperCase();
    case 'trim': return String(value).trim();
    case 'phone_us': return phoneUs(value);
    default: return value;
  }
}

async function resolveTemplate(templateStr, data, leadId) {
  const pattern = /\{\{([\w.]+(?:\|[\w]+)*)\}\}/g;
  const matches = [];
  let m;
  while ((m = pattern.exec(templateStr)) !== null) {
    matches.push({ expr: m[1], index: m.index, length: m[0].length });
  }
  const resolved = await Promise.all(matches.map(async (match) => {
    const parts = match.expr.split('|').map(s => s.trim());
    const token = parts[0];
    const transforms = parts.slice(1);
    let value = resolveTokenValue(token, data || {}, leadId);
    for (const t of transforms) {
      value = await applyTransform(value, t);
    }
    return escapeJsonString(value);
  }));
  let result = templateStr;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    result = result.slice(0, match.index) + resolved[i] + result.slice(match.index + match.length);
  }
  return result;
}

const AUTO_HASH_KEYS = new Set(['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id', 'db', 'ge']);

function normalizeForHashing(key, value) {
  const v = String(value || '');
  if (key === 'ph') return phoneUs(v);
  return v.trim().toLowerCase();
}

async function applyAutoHash(body, templateStr) {
  if (!body.data || !Array.isArray(body.data)) return body;
  const manuallyHashed = new Set();
  try {
    const tmplObj = JSON.parse(templateStr);
    for (let i = 0; i < (tmplObj.data || []).length; i++) {
      const ud = tmplObj.data[i]?.user_data;
      if (!ud) continue;
      for (const key of Object.keys(ud)) {
        if (String(ud[key] || '').includes('|sha256')) manuallyHashed.add(`${i}.${key}`);
      }
    }
  } catch {}
  for (let i = 0; i < body.data.length; i++) {
    const ud = body.data[i]?.user_data;
    if (!ud) continue;
    for (const key of Object.keys(ud)) {
      if (!AUTO_HASH_KEYS.has(key)) continue;
      if (manuallyHashed.has(`${i}.${key}`)) continue;
      const val = String(ud[key] || '');
      if (!val) continue;
      ud[key] = await sha256Hex(normalizeForHashing(key, val));
    }
  }
  return body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { connector_id, test_payload, event_name, trigger } = body;

  if (!connector_id) {
    return Response.json({ error: 'connector_id is required' }, { status: 400 });
  }

  const db = base44.asServiceRole;
  const connectors = await db.entities.ApiConnector.filter({ id: connector_id });
  const conn = connectors[0];
  if (!conn) return Response.json({ error: 'Connector not found' }, { status: 404 });
  if (conn.kind !== 'facebook_capi') return Response.json({ error: 'Connector is not a Facebook CAPI type' }, { status: 400 });

  // Derive the event name from the selected trigger when not explicitly provided.
  const triggerEventMap = {
    on_received: conn.received_event_name || conn.lead_event_name || 'Lead',
    on_sold: conn.sold_event_name || 'Qualified_Lead',
    on_unsold: conn.unsold_event_name || 'Lead',
    on_queued: conn.queued_event_name || 'Lead',
    on_dq: conn.dq_event_name || 'DQLead',
    on_rejected: conn.rejected_event_name || 'Lead',
    on_duplicates: conn.duplicates_event_name || 'Lead',
  };
  const eventName = event_name || (trigger && triggerEventMap[trigger]) || conn.received_event_name || conn.lead_event_name || 'Lead';
  const apiVer = conn.fb_api_version || 'v21.0';
  const pixel = conn.fb_pixel_id;
  const token = conn.fb_access_token;
  if (!pixel || !token) return Response.json({ error: 'Pixel ID and access token are required' }, { status: 400 });

  const url = `https://graph.facebook.com/${apiVer}/${pixel}/events?access_token=${token}`;

  // Use the test payload (from the textarea) as the template, or fall back to the connector's, or the default.
  let templateStr;
  if (typeof test_payload === 'string') {
    templateStr = test_payload;
  } else if (test_payload && typeof test_payload === 'object') {
    templateStr = JSON.stringify(test_payload, null, 2);
  } else {
    templateStr = (conn.payload_template && conn.payload_template.trim() && conn.payload_template.trim() !== '{}')
      ? conn.payload_template
      : DEFAULT_CAPI_TEMPLATE;
  }

  let requestBody;
  try {
    const ctx = { ...DEFAULT_TEST_LEAD_DATA, lead_event: eventName };
    // Resolve per-trigger custom_data overrides and expose them as tokens
    // (e.g. {{content_name}}, {{value}}) so the template pulls them dynamically.
    const ctxWithOverrides = { ...ctx };
    if (conn.trigger_data_overrides) {
      try {
        const overrides = JSON.parse(conn.trigger_data_overrides);
        const ov = overrides[trigger || 'on_received'] || overrides.on_received;
        if (ov && typeof ov === 'object') {
          for (const k of Object.keys(ov)) {
            if (!ov[k]) continue;
            const resolved = await resolveTemplate(String(ov[k]), ctx, 'test-lead-id');
            const trimmed = resolved.trim();
            try { ctxWithOverrides[k] = JSON.parse(trimmed); }
            catch { ctxWithOverrides[k] = resolved; }
          }
        }
      } catch {}
    }
    const resolved = await resolveTemplate(templateStr, ctxWithOverrides, 'test-lead-id');
    requestBody = JSON.parse(resolved);
  } catch (err) {
    return Response.json({ error: `Template resolution failed: ${err.message}` }, { status: 500 });
  }

  if (conn.auto_hash_capi !== false) {
    requestBody = await applyAutoHash(requestBody, templateStr);
  }

  // Override event_name with the actual trigger event name
  if (requestBody.data && requestBody.data[0]) {
    requestBody.data[0].event_name = eventName;
  }

  // Apply the selected trigger's custom_data overrides so the test reflects per-trigger config.
  if (conn.trigger_data_overrides && requestBody.data && requestBody.data[0]) {
    try {
      const overrides = JSON.parse(conn.trigger_data_overrides);
      const ov = overrides[trigger || 'on_received'] || overrides.on_received;
      if (ov && typeof ov === 'object') {
        if (!requestBody.data[0].custom_data) requestBody.data[0].custom_data = {};
        const testCtx = { ...DEFAULT_TEST_LEAD_DATA, lead_event: eventName };
        for (const k of Object.keys(ov)) {
          if (!ov[k]) continue;
          const resolved = await resolveTemplate(String(ov[k]), testCtx, 'test-lead-id');
          const trimmed = resolved.trim();
          try { requestBody.data[0].custom_data[k] = JSON.parse(trimmed); }
          catch { requestBody.data[0].custom_data[k] = resolved; }
        }
      }
    } catch {}
  }

  if (conn.fb_test_event_code) requestBody.test_event_code = conn.fb_test_event_code;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const text = await resp.text();
    let fbResult;
    try { fbResult = JSON.parse(text); } catch { fbResult = { raw: text }; }

    return Response.json({
      request_body: requestBody,
      fb_response: fbResult,
      http_status: resp.status,
      fbtrace_id: fbResult.fbtrace_id || '',
      target_url: url,
    });
  } catch (err) {
    return Response.json({ error: err.message, request_body: requestBody }, { status: 500 });
  }
});