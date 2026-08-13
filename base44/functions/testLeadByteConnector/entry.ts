import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Shared payload resolver (mirrors processLead exactly) ──────────────────
// Same canonical aliases + transforms as the live pipeline, so a Send Test Lead
// resolves tokens identically to a real lead send.

async function sha256Hex(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function phoneUs(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 10) return '1' + digits;
  return digits;
}

function escapeJsonString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

function resolveTokenValue(token, d) {
  switch (token) {
    case '_c_eventtime':
    case 'event_time':
      return String(Math.floor(Date.now() / 1000));
    case '_c_eventurl':
    case 'optin_url':
      return d.optin_url || d.optinurl || d.landing_page_url || d.landingpage_url || '';
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
    case 'ip_address':
      return d.ip_address || d.ipaddress || '';
    case 'email':
      return d.email || '';
    case 'first_name':
      return d.first_name || d.firstname || '';
    case 'last_name':
      return d.last_name || d.lastname || '';
    case 'zip':
      return d.zip || d.zipcode || d.zip_code || '';
    case 'lead_event':
      return d.lead_event || '';
    case 'accident_state':
      return d.accident_state || d.state || '';
    case 'trustedform_url':
      return d.trustedform_url || d.trustedform_cert_url || d.trustedform_cert || '';
    case 'jornaya_token':
      return d.jornaya_token || d.leadid_token || d.jornayaid || '';
    case 'fault':
      return d.fault || d.at_fault || d.atfault || '';
    case 'treatment':
      return d.treatment || d.physical_injury || d.injury || '';
    case 'attorney':
      return d.attorney || d.with_lawyer || d.has_attorney || d.lawyer || '';
    case 'incident_date_2':
      return d.incident_date_2 || d.incident_date || d.accident_date || '';
    case 'incident_date_3':
      return d.incident_date_3 || d.incident_date || d.accident_date || '';
    case 'accident_details':
      return d.accident_details || d.case_description || d.accident_description || '';
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

async function resolveTemplate(templateStr, data) {
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
    let value = resolveTokenValue(token, data || {});
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

async function buildPayloadFromTemplate(template, data) {
  if (!template) return data;
  const tmpl = typeof template === 'string' ? template : JSON.stringify(template);
  const resolved = await resolveTemplate(tmpl, data);
  try { return JSON.parse(resolved); } catch { return resolved; }
}

// ── Handler ───────────────────────────────────────────────────────────────

// Caller model: operator-only. Fires an outbound POST to an operator-configured
// LeadByte destination using operator credentials, so it is gated to operators
// BEFORE any service-role read. Portal accounts and unauthenticated callers are
// rejected.
const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

async function assertOperator(base44, user) {
  const record = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
  const caller = record || user;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions = {};
  try {
    permissions = typeof caller.permissions === 'string'
      ? JSON.parse(caller.permissions || '{}')
      : (caller.permissions || {});
  } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
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
  let user = null;
  try { user = await base44.auth.me(); } catch { user = null; }
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertOperator(base44, user))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { connector_id, test_payload } = body;

  if (!connector_id || !test_payload) {
    return Response.json({ error: 'connector_id and test_payload are required' }, { status: 400 });
  }

  // Load connector via service role
  const db = base44.asServiceRole;
  const connectors = await db.entities.LeadByteConnector.filter({ id: connector_id });
  const connector = connectors[0];
  if (!connector) return Response.json({ error: 'Connector not found' }, { status: 404 });

  // Resolve the Payload Template against the sample inbound lead using the SAME
  // resolver the live pipeline uses (canonical aliases + |transforms).
  const mode = connector.forwarding_mode || 'template';
  const outboundPayload = await buildPayloadFromTemplate(connector.payload_template, test_payload);

  // Build headers from connector header rows
  const headerRowsParsed = typeof connector.headers === 'string'
    ? JSON.parse(connector.headers || '[]')
    : (connector.headers || []);

  const lbHeaders = {};
  if (Array.isArray(headerRowsParsed)) {
    headerRowsParsed.forEach(row => { if (row.key) lbHeaders[row.key] = row.value; });
  } else {
    Object.assign(lbHeaders, headerRowsParsed);
  }

  const contentType = connector.content_type || 'application/json';
  lbHeaders['Content-Type'] = contentType;

  let bodyStr;
  if (contentType === 'application/x-www-form-urlencoded') {
    bodyStr = new URLSearchParams(typeof outboundPayload === 'object' ? outboundPayload : {}).toString();
  } else {
    bodyStr = typeof outboundPayload === 'string' ? outboundPayload : JSON.stringify(outboundPayload);
  }

  // POST directly to the destination
  let lbResponse = null;
  let httpStatus = null;
  try {
    const resp = await fetch(connector.target_url, {
      method: connector.http_method || 'POST',
      headers: lbHeaders,
      body: bodyStr,
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try { lbResponse = JSON.parse(text); } catch { lbResponse = { raw: text }; }
  } catch (err) {
    lbResponse = { error: err.message };
  }

  return Response.json({
    request_body: outboundPayload,
    lb_response: lbResponse,
    http_status: httpStatus,
    forwarding_mode: mode,
    target_url: connector.target_url,
  });
});