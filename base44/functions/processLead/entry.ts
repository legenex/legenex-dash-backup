import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { normalizeEmail, toE164Us, titleCaseName } from './leadIdentity.generated.js';

// Resolve phone_verified value from HLR result based on configured source
function resolvePhoneVerified(hlrResult, source) {
  if (!hlrResult) return '';
  if (source === 'lh_hlr_response') return hlrResult.lh_hlr_response || '';
  if (source === 'summary_score') return String(hlrResult.summary_score ?? '');
  if (source === 'boolean') return hlrResult.lh_hlr_response === 'Exact Match' ? 'true' : 'false';
  return hlrResult.lh_hlr_response || '';
}

// The app operates on America/Regina (Saskatchewan, UTC-6, no DST) for ALL
// reporting. Every lead timestamp must be stamped in this zone, never UTC, so
// the Leads table (which interprets mapped_fields.timestamp as APP_TZ local)
// shows the correct local time.
const APP_TZ = 'America/Regina';

// Extract America/Regina wall-clock parts from a Date via Intl, then render the
// requested format string. Falls back to UTC parts only if Intl is unavailable.
function formatTimestamp(date, fmt) {
  const pad = (n) => String(n).padStart(2, '0');
  let parts;
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    for (const { type, value } of dtf.formatToParts(date)) p[type] = value;
    parts = {
      YYYY: p.year, MM: p.month, DD: p.day,
      hh: p.hour, mm: p.minute, ss: p.second,
    };
  } catch {
    parts = {
      YYYY: String(date.getUTCFullYear()), MM: pad(date.getUTCMonth() + 1), DD: pad(date.getUTCDate()),
      hh: pad(date.getUTCHours()), mm: pad(date.getUTCMinutes()), ss: pad(date.getUTCSeconds()),
    };
  }
  // Replace largest tokens first; time tokens use distinct placeholders so the
  // second MM (minutes) is not clobbered by the month replacement.
  return (fmt || 'MM/DD/YYYY HH:MM:SS')
    .replace('YYYY', parts.YYYY)
    .replace('DD', parts.DD)
    .replace('HH', parts.hh)
    .replace('SS', parts.ss)
    .replace(/MM/, parts.MM)   // first MM = month
    .replace(/MM/, parts.mm);  // second MM = minutes
}

// Evaluate a single conditional condition against the full lead context.
// All string comparisons are case-insensitive and trimmed.
function evalConditionalCondition(ctx, cond) {
  const raw = ctx[cond.field];
  const actual = String(raw ?? '').trim().toLowerCase();
  const expected = String(cond.value ?? '').trim().toLowerCase();
  switch (cond.operator) {
    case 'equals': return actual === expected;
    case 'not_equals': return actual !== expected;
    case 'contains': return actual.includes(expected);
    case 'not_contains': return !actual.includes(expected);
    case 'in': return expected.split(',').map(s => s.trim()).some(item => item !== '' && item === actual);
    case 'not_in': return !expected.split(',').map(s => s.trim()).some(item => item !== '' && item === actual);
    case 'exists': return raw !== null && raw !== undefined && String(raw).trim() !== '';
    case 'not_exists': return raw === null || raw === undefined || String(raw).trim() === '';
    default: return false;
  }
}

// Normalize a calc rule's conditions value into an AND/OR group tree. Accepts a
// legacy flat array of {field, operator, value}, an already-built group object,
// or null/undefined. The value is already parsed, not a JSON string. Uses the
// calc operator set via evalConditionalCondition, not the delivery-side operators.
function normalizeCalcConditions(raw) {
  if (Array.isArray(raw)) {
    return {
      type: 'group',
      match: 'all',
      children: raw.map((c) => ({ type: 'condition', field: c.field, operator: c.operator, value: c.value })),
    };
  }
  if (raw && typeof raw === 'object' && raw.type === 'group') {
    return raw;
  }
  return { type: 'group', match: 'all', children: [] };
}

// Recursively evaluate a calc condition group. Leaf conditions run through
// evalConditionalCondition (the calc operator set). An empty group matches, so a
// rule with no conditions still fires, exactly as [].every(...) returned true.
function evalCalcNode(ctx, node, depth = 0) {
  if (depth > 25) return true;
  if (node.type === 'condition') return evalConditionalCondition(ctx, node);
  if (node.type === 'group') {
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length === 0) return true;
    if (node.match === 'any') return children.some((c) => evalCalcNode(ctx, c, depth + 1));
    return children.every((c) => evalCalcNode(ctx, c, depth + 1));
  }
  return true;
}

// Resolve {{token}} placeholders in a calculated field output against the
// evaluation context. Unknown tokens resolve to an empty string. Plain text
// with no placeholders is returned unchanged.
function resolveCalcOutput(text, ctx) {
  const s = String(text ?? '');
  if (!s.includes('{{')) return s;
  return s.replace(/\{\{\s*([\w. ]+)\s*\}\}/g, (_m, token) => {
    const v = ctx[String(token).trim()];
    return v == null ? '' : String(v);
  });
}

function runCalculations(calcs, leadData, hlrResult, phoneVerifiedSource, phoneVerifiedFieldName, supplierType) {
  const enriched = { ...leadData };
  enriched[phoneVerifiedFieldName || 'phone_verified'] = resolvePhoneVerified(hlrResult, phoneVerifiedSource);
  const sorted = [...calcs].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (const calc of sorted) {
    if (!calc.enabled) continue;
    let cfg = {};
    try { cfg = JSON.parse(calc.config || '{}'); } catch {}
    const inputValue = enriched[calc.input_field] ?? '';
    // Full-lead context: every enriched field, plus supplier_type from the
    // supplier record, plus lead_status / final_status when already set (they
    // may be empty during enrichment, which is expected).
    const ctx = {
      ...enriched,
      supplier_type: supplierType || enriched.supplier_type || '',
      lead_status: enriched.lead_status ?? '',
      final_status: enriched.final_status ?? '',
    };
    try {
      if (calc.transform_type === 'date_age_bucket') {
        const fmt = cfg.date_format || 'MM/DD/YYYY';
        let parsed = null;
        if (fmt === 'MM/DD/YYYY') {
          const parts = String(inputValue).split('/');
          if (parts.length === 3) parsed = new Date(`${parts[2]}-${parts[0]}-${parts[1]}T00:00:00Z`);
        } else if (fmt === 'YYYY-MM-DD') {
          parsed = new Date(inputValue + 'T00:00:00Z');
        } else {
          parsed = new Date(inputValue);
        }
        if (parsed && !isNaN(parsed)) {
          const ageDays = Math.floor((Date.now() - parsed.getTime()) / 86400000);
          const buckets = (cfg.buckets || []).slice().sort((a, b) => a.max_days - b.max_days);
          let matched = cfg.fallback || '';
          for (const b of buckets) { if (ageDays <= b.max_days) { matched = b.label; break; } }
          enriched[calc.output_token] = matched;
        } else { enriched[calc.output_token] = cfg.fallback || ''; }
      } else if (calc.transform_type === 'value_map') {
        const map = cfg.map || {};
        const normalized = String(inputValue).trim().toLowerCase();
        if (map[inputValue] !== undefined) { enriched[calc.output_token] = map[inputValue]; }
        else {
          const matchKey = Object.keys(map).find(k => k.trim().toLowerCase() === normalized);
          enriched[calc.output_token] = matchKey !== undefined ? map[matchKey] : inputValue;
        }
      } else if (calc.transform_type === 'conditional') {
        const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
        let output = resolveCalcOutput(cfg.fallback ?? '', ctx);
        for (const rule of rules) {
          const allMatch = evalCalcNode(ctx, normalizeCalcConditions(rule.conditions));
          if (allMatch) { output = resolveCalcOutput(rule.output ?? '', ctx); break; }
        }
        enriched[calc.output_token] = output;
      } else if (calc.transform_type === 'clone') {
        enriched[calc.output_token] = inputValue;
      } else if (calc.transform_type === 'script') {
        enriched[calc.output_token] = inputValue;
      }
    } catch { enriched[calc.output_token] = inputValue; }
  }
  return enriched;
}

async function buildPayloadFromTemplate(template, data) {
  if (!template) return data;
  const tmpl = typeof template === 'string' ? template : JSON.stringify(template);
  const resolved = await resolveTemplate(tmpl, data, null);
  try { return JSON.parse(resolved); } catch { return resolved; }
}

// ── CAPI helpers ──────────────────────────────────────────────────────────

async function sha256Hex(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Atomically increment the lead_id counter and return the next unique value.
// Uses optimistic locking: read current value, conditional-write next value,
// retry if another request changed it first.
async function nextLeadId(db) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const counters = await db.entities.Counter.filter({ name: 'lead_id' });
    let counter = counters[0];
    if (!counter) {
      try {
        counter = await db.entities.Counter.create({ name: 'lead_id', value: 0, updated_at: new Date().toISOString() });
      } catch { continue; }
    }
    const nextValue = (counter.value || 0) + 1;
    const result = await db.entities.Counter.updateMany(
      { name: 'lead_id', value: counter.value },
      { $set: { value: nextValue, updated_at: new Date().toISOString() } }
    );
    if (result.updated > 0) return nextValue;
  }
  throw new Error('Failed to acquire lead_id after retries');
}

function normalizeStr(s) { return String(s || '').trim().toLowerCase(); }

function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '1' + digits;
  return digits;
}

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Build Facebook CAPI user_data object from lead data. Uses pre-hashed values
// from inbound if available, otherwise computes SHA-256.
async function buildCapiUserData(d) {
  const ud = {};
  if (d.email_hash) ud.em = [d.email_hash];
  else if (d.email) ud.em = [await sha256Hex(normalizeStr(d.email))];
  if (d.phone_hash) ud.ph = [d.phone_hash];
  else if (d.mobile) ud.ph = [await sha256Hex(normalizePhone(d.mobile))];
  if (d.first_name_hash) ud.fn = [d.first_name_hash];
  else if (d.first_name) ud.fn = [await sha256Hex(normalizeStr(d.first_name))];
  if (d.last_name_hash) ud.ln = [d.last_name_hash];
  else if (d.last_name) ud.ln = [await sha256Hex(normalizeStr(d.last_name))];
  if (d.city_hash) ud.ct = [d.city_hash];
  else if (d.city) ud.ct = [await sha256Hex(normalizeStr(d.city))];
  if (d.state_hash) ud.st = [d.state_hash];
  else if (d.state) ud.st = [await sha256Hex(normalizeStr(d.state))];
  if (d.zip_hash) ud.zp = [d.zip_hash];
  else if (d.zip) ud.zp = [await sha256Hex(normalizeStr(d.zip))];
  if (d.country_hash) ud.country = [d.country_hash];
  else if (d.country) ud.country = [await sha256Hex(normalizeStr(d.country))];
  if (d.ip_address || d.ipaddress) ud.client_ip_address = d.ip_address || d.ipaddress;
  if (d.user_agent) ud.client_user_agent = d.user_agent;
  if (d.fbc) ud.fbc = d.fbc;
  if (d.fbp) ud.fbp = d.fbp;
  if (d.external_id_hash) ud.external_id = d.external_id_hash;
  else if (d.external_id) ud.external_id = await sha256Hex(normalizeStr(d.external_id));
  else if (d.lead_id != null) ud.external_id = await sha256Hex(String(d.lead_id));
  return ud;
}

// Default Facebook CAPI payload template using unified {{token}} syntax.
// Auto-hash (auto_hash_capi=true) handles SHA-256 of user_data fields automatically.
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

// Normalize a US phone to 1XXXXXXXXXX: strip non-digits, remove leading 1, prepend 1 + 10 digits.
function phoneUs(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 10) return '1' + digits;
  return digits;
}

// Escape a string for safe insertion into a JSON string value position.
function escapeJsonString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

// Unified token resolver - same engine for LeadByte and CAPI templates.
// Resolves {{token}} and {{token|transform}} against the lead data object.
function resolveTokenValue(token, d, leadId) {
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

// Apply a single pipe transform to a string value.
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

// Resolve all {{token|transform}} placeholders in a template string.
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

// Auto-hash Meta-required user_data fields after normalization.
// Skips fields whose template token already includes |sha256 (manual override).
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

// Send a single Facebook CAPI event using the connector's payload template.
async function sendCapiEvent(conn, leadData, leadId, eventName, trigger) {
  const apiVer = conn.fb_api_version || 'v21.0';
  const pixel = conn.fb_pixel_id;
  const token = conn.fb_access_token;
  const url = `https://graph.facebook.com/${apiVer}/${pixel}/events?access_token=${token}`;

  const templateStr = (conn.payload_template && conn.payload_template.trim() && conn.payload_template.trim() !== '{}')
    ? conn.payload_template
    : DEFAULT_CAPI_TEMPLATE;

  const ctx = { ...leadData, lead_event: eventName };

  // Resolve per-trigger custom_data overrides first and expose them as tokens
  // (e.g. {{content_name}}, {{value}}) so the template pulls them dynamically.
  const ctxWithOverrides = { ...ctx };
  if (trigger && conn.trigger_data_overrides) {
    try {
      const overrides = JSON.parse(conn.trigger_data_overrides);
      const ov = overrides[trigger];
      if (ov && typeof ov === 'object') {
        for (const k of Object.keys(ov)) {
          if (!ov[k]) continue;
          const resolved = await resolveTemplate(String(ov[k]), ctx, leadId);
          const trimmed = resolved.trim();
          try { ctxWithOverrides[k] = JSON.parse(trimmed); }
          catch { ctxWithOverrides[k] = resolved; }
        }
      }
    } catch {}
  }

  let body;
  try {
    const resolved = await resolveTemplate(templateStr, ctxWithOverrides, leadId);
    body = JSON.parse(resolved);
  } catch (err) {
    return {
      connector: conn.name, event_name: eventName, pixel,
      http_status: null, fbtrace_id: '', success: false,
      error: `Template resolution failed: ${err.message}`, value: '', payload: null,
    };
  }

  if (conn.auto_hash_capi !== false) {
    body = await applyAutoHash(body, templateStr);
  }

  if (body.data && body.data[0]) {
    body.data[0].event_name = eventName;
  }

  // Apply per-trigger custom_data overrides (merge into data[0].custom_data).
  if (trigger && conn.trigger_data_overrides && body.data && body.data[0]) {
    try {
      const overrides = JSON.parse(conn.trigger_data_overrides);
      const ov = overrides[trigger];
      if (ov && typeof ov === 'object') {
        if (!body.data[0].custom_data) body.data[0].custom_data = {};
        for (const k of Object.keys(ov)) {
          if (!ov[k]) continue;
          const resolved = await resolveTemplate(String(ov[k]), ctx, leadId);
          const trimmed = resolved.trim();
          try { body.data[0].custom_data[k] = JSON.parse(trimmed); }
          catch { body.data[0].custom_data[k] = resolved; }
        }
      }
    } catch {}
  }

  if (conn.fb_test_event_code) body.test_event_code = conn.fb_test_event_code;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let fbResult;
    try { fbResult = JSON.parse(text); } catch { fbResult = { raw: text }; }
    const eventsReceived = fbResult.events_received;
    // A 200 with events_received:0 (or an error object) is a real failure.
    const fbOk = resp.ok && !fbResult.error && (eventsReceived == null || eventsReceived >= 1);
    const sentValue = body?.data?.[0]?.custom_data?.value ?? '';
    const errMsg = fbResult.error
      ? (typeof fbResult.error === 'object' ? JSON.stringify(fbResult.error) : String(fbResult.error))
      : (eventsReceived === 0 ? 'events_received: 0' : '');
    return {
      connector: conn.name, event_name: eventName, pixel,
      http_status: resp.status, fbtrace_id: fbResult.fbtrace_id || '',
      success: fbOk, value: sentValue, fb_response: fbResult, error: errMsg,
      payload: body || null,
    };
  } catch (err) {
    return {
      connector: conn.name, event_name: eventName, pixel,
      http_status: null, fbtrace_id: '', success: false, error: err.message,
      value: body?.data?.[0]?.custom_data?.value ?? '', payload: body || null,
    };
  }
}

// Send a webhook/generic_http event.
async function sendHttpEvent(conn, leadData, leadId, eventName) {
  const ctx = { ...leadData };
  if (ctx.lead_id == null) ctx.lead_id = leadId;
  if (eventName) ctx.lead_event = eventName;
  const payload = await buildPayloadFromTemplate(conn.payload_template, ctx);
  const headerRows = parseJsonArray(conn.headers);
  const hdrs = {};
  for (const r of headerRows) { if (r.key) hdrs[r.key] = r.value; }
  const ct = conn.content_type || 'application/json';
  hdrs['Content-Type'] = ct;
  let bodyStr;
  if (ct === 'application/x-www-form-urlencoded') {
    bodyStr = new URLSearchParams(typeof payload === 'object' ? payload : {}).toString();
  } else {
    bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
  try {
    const resp = await fetch(conn.target_url, { method: conn.http_method || 'POST', headers: hdrs, body: bodyStr });
    return { connector: conn.name, http_status: resp.status, success: resp.ok };
  } catch (err) {
    return { connector: conn.name, http_status: null, success: false, error: err.message };
  }
}

// Send to a delivery destination and capture the payload + full response body.
// Used by the pre-classified (Disqualified / custom) bypass path, which must
// await sends (so logs populate) and return the actual endpoint response.
async function sendDestinationAwait(dest, leadData, leadId, trigger) {
  const ctx = { ...leadData };
  if (ctx.lead_id == null) ctx.lead_id = leadId;
  const payload = await buildPayloadFromTemplate(dest.payload_template, ctx);
  const headerRows = parseJsonArray(dest.headers);
  const hdrs = {};
  for (const r of headerRows) { if (r.key) hdrs[r.key] = r.value; }
  const ct = dest.content_type || 'application/json';
  hdrs['Content-Type'] = ct;
  let bodyStr;
  if (ct === 'application/x-www-form-urlencoded') {
    bodyStr = new URLSearchParams(typeof payload === 'object' ? payload : {}).toString();
  } else {
    bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
  try {
    const resp = await fetch(dest.target_url, { method: dest.http_method || 'POST', headers: hdrs, body: bodyStr });
    const text = await resp.text();
    return { connector: dest.api_name, trigger, http_status: resp.status, success: resp.ok, error: '', payload: bodyStr, response: text };
  } catch (err) {
    return { connector: dest.api_name, trigger, http_status: null, success: false, error: err.message, payload: bodyStr, response: '' };
  }
}

// Built-in lead statuses that fire via lifecycle triggers. Any other lead_status
// value (e.g. "24m Lead") fires via the custom-status trigger point after enrichment.
const BUILTIN_LEAD_STATUSES = ['Qualified', 'Disqualified', 'Sold', 'Unsold', 'Rejected', 'Duplicates', 'Queued', 'Error'];
function triggerKeyForStatus(statusLabel) {
  const map = { Qualified: 'on_received', Sold: 'on_sold', Unsold: 'on_unsold', Disqualified: 'on_dq', Queued: 'on_queued', Rejected: 'on_rejected', Duplicates: 'on_duplicates', Error: 'on_error' };
  if (map[statusLabel]) return map[statusLabel];
  const slug = String(statusLabel || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `on_${slug || 'status'}`;
}

// Check if a connector's filters match the current lead.
function connectorMatchesFilters(conn, leadData, supplierAttribution, supplierRecord) {
  const verticals = parseJsonArray(conn.filter_verticals);
  if (verticals.length > 0) {
    const lv = leadData.vertical || '';
    if (!verticals.includes(lv)) return false;
  }
  const brands = parseJsonArray(conn.filter_brands);
  if (brands.length > 0) {
    const lb = leadData.supplier_brand || leadData.brand || '';
    if (!brands.includes(lb)) return false;
  }
  const suppliers = parseJsonArray(conn.filter_suppliers);
  if (suppliers.length > 0) {
    const sn = supplierAttribution || '';
    const sid = leadData.sid || leadData.supplier_sid || '';
    if (!suppliers.includes(sn) && !suppliers.includes(sid)) return false;
  }
  const types = parseJsonArray(conn.filter_supplier_types);
  if (types.length > 0) {
    const st = supplierRecord?.supplier_type || '';
    if (!types.includes(st)) return false;
  }
  const routes = parseJsonArray(conn.filter_routes);
  if (routes.length > 0) {
    const lr = String(leadData.lead_route || 'standard').trim().toLowerCase();
    const ri = {
      direct: lr.includes('direct'),
      data: lr.includes('data'),
      event: lr.includes('event'),
      queue: lr.includes('queue'),
    };
    ri.standard = !ri.direct && !ri.data && !ri.event && !ri.queue;
    if (!routes.some(r => ri[r])) return false;
  }
  return true;
}

// Normalize a raw filter_conditions value into a recursive AND/OR group tree.
// Accepts a JSON string, an array, an object, null, or undefined. Legacy flat
// arrays of {field, operator, value} become an all-match group so every saved
// record keeps behaving exactly as before.
function normalizeConditionTree(raw) {
  if (!raw) return { type: 'group', match: 'all', children: [] };
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); }
    catch { return { type: 'group', match: 'all', children: [] }; }
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return { type: 'group', match: 'all', children: [] };
    return {
      type: 'group',
      match: 'all',
      children: parsed.map((c) => ({ type: 'condition', field: c.field, operator: c.operator, value: c.value })),
    };
  }
  if (parsed && typeof parsed === 'object' && parsed.type === 'group') {
    return parsed;
  }
  return { type: 'group', match: 'all', children: [] };
}

// Recursively evaluate a condition tree node against the enriched lead data.
// A depth cap guards against cycles; beyond it, and for any unrecognised node
// type, we return true so a malformed node never silently blocks a delivery.
function evalConditionNode(node, leadData, depth = 0) {
  if (depth > 25) return true;
  if (!node || typeof node !== 'object') return true;
  if (node.type === 'condition') {
    return applyOperator(leadData[node.field], node.operator, node.value || '');
  }
  if (node.type === 'group') {
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length === 0) return true;
    if (node.match === 'any') return children.some((c) => evalConditionNode(c, leadData, depth + 1));
    return children.every((c) => evalConditionNode(c, leadData, depth + 1));
  }
  return true;
}

// Check if a connector's field conditions match the enriched lead data.
// Uses the same applyOperator used for response mapping.
function connectorMatchesConditions(conn, leadData) {
  const root = normalizeConditionTree(conn.filter_conditions);
  return evalConditionNode(root, leadData);
}

// Does the current lead_route match a verification settings' route filter?
// Empty filter defaults to the original HLR/email routes (standard, direct, data)
// plus gateway, which is the legacy standard behaviour under its own name and so
// must verify identically.
function routeMatchesFilter(settings, routeIs) {
  const defaultRoutes = (r) => r.standard || r.gateway || r.direct || r.data;
  if (!settings) return defaultRoutes(routeIs);
  const routes = parseJsonArray(settings.filter_routes);
  if (routes.length === 0) return defaultRoutes(routeIs);
  return routes.some(r => routeIs[r]);
}

// Does the current supplier match a verification settings' supplier filter?
function supplierMatchesFilter(settings, supplierAttribution, supplierRecord) {
  if (!settings) return true;
  const suppliers = parseJsonArray(settings.filter_suppliers);
  if (suppliers.length > 0) {
    const sn = supplierAttribution || '';
    const sid = supplierRecord?.sid || '';
    if (!suppliers.includes(sn) && !suppliers.includes(sid)) return false;
  }
  const types = parseJsonArray(settings.filter_supplier_types);
  if (types.length > 0) {
    const st = supplierRecord?.supplier_type || '';
    if (!types.includes(st)) return false;
  }
  return true;
}

// Resolve the event name for a given trigger from the connector's per-trigger fields.
// on_received: received_event_name || lead_event_name || 'Lead'
// on_unsold: unsold_event_name || 'Lead'
// on_queued: queued_event_name || 'Lead'
// on_sold: sold_event_name (no fallback - blank means skip)
// on_dq: dq_event_name (no fallback - blank means skip)
function getTriggerEventName(conn, trigger) {
  switch (trigger) {
    case 'on_received': return conn.received_event_name || conn.lead_event_name || 'Lead';
    case 'on_unsold': return conn.unsold_event_name || 'Lead';
    case 'on_queued': return conn.queued_event_name || 'Lead';
    case 'on_sold': return conn.sold_event_name || '';
    case 'on_dq': return conn.dq_event_name || '';
    case 'on_rejected': return conn.rejected_event_name || 'Lead';
    case 'on_duplicates': return conn.duplicates_event_name || 'Lead';
    default: return '';
  }
}

// Fire all matching connectors for a given trigger. Fire-and-forget: returns
// immediately, results handled in background.
function fireConnectors(db, connectors, trigger, leadData, leadId, supplierAttribution, supplierRecord) {
  for (const conn of connectors) {
    if (!conn.enabled) continue;
    const triggers = parseJsonArray(conn.triggers);
    // No triggers selected = fire on every lead (gated only by filters). Only fire once - at intake (on_received).
    if (triggers.length > 0 && !triggers.includes(trigger)) continue;
    if (triggers.length === 0 && trigger !== 'on_received') continue;
    if (!connectorMatchesFilters(conn, leadData, supplierAttribution, supplierRecord)) continue;
    if (!connectorMatchesConditions(conn, leadData)) continue;

    const eventName = getTriggerEventName(conn, trigger);
    // Sold and DQ have no fallback - skip if blank
    if (!eventName && (trigger === 'on_sold' || trigger === 'on_dq')) continue;

    if (conn.kind === 'facebook_capi') {
      sendCapiEvent(conn, leadData, leadId, eventName, trigger)
        .then(async (result) => {
          await appendCapiLog(db, leadId, result);
          if (!result.success) {
            await db.entities.ErrorLog.create({
              lead_id: leadId, stage: 'leadbyte', severity: 'warning',
              message: `CAPI failure: ${conn.name} (${eventName})`,
              detail: JSON.stringify(result), supplier_name: supplierAttribution,
            }).catch(() => {});
            await evaluateNotifications(db, ['capi_failure', 'api_error'], { id: leadId }, supplierAttribution,
              { message: `CAPI failure: ${conn.name} (${eventName}) - ${result.error || result.http_status}` }).catch(() => {});
          }
        })
        .catch(async (err) => {
          await appendCapiLog(db, leadId, { connector: conn.name, event_name: eventName, pixel: conn.fb_pixel_id, http_status: null, fbtrace_id: '', success: false, error: err.message });
          await db.entities.ErrorLog.create({
            lead_id: leadId, stage: 'leadbyte', severity: 'warning',
            message: `CAPI error: ${conn.name} (${eventName})`,
            detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
          }).catch(() => {});
        });
    } else {
      // webhook or generic_http
      sendHttpEvent(conn, leadData, leadId, eventName)
        .then(async (result) => {
          if (!result.success) {
            await db.entities.ErrorLog.create({
              lead_id: leadId, stage: 'leadbyte', severity: 'warning',
              message: `API error: ${conn.name}`,
              detail: JSON.stringify(result), supplier_name: supplierAttribution,
            }).catch(() => {});
            await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution,
              { message: `API error: ${conn.name} - ${result.error || result.http_status}` }).catch(() => {});
          }
        })
        .catch(async (err) => {
          await db.entities.ErrorLog.create({
            lead_id: leadId, stage: 'leadbyte', severity: 'warning',
            message: `API error: ${conn.name}`,
            detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
          }).catch(() => {});
        });
    }
  }
}

// ── Native distribution helpers (ADDITIVE) ────────────────────────────────
// Resolve an opaque SubDelivery credential_ref into real auth headers, server
// side, at send time. The secret never enters a snapshot, a trace, an operator
// response, or anything browser-facing. Returns {} when the secret store holds
// nothing for the ref, so a misconfigured destination fails as an unauthenticated
// rejection rather than leaking or crashing the pipeline.
async function resolveSubDeliveryCredential(db, ref) {
  if (!ref) return {};
  try {
    const rows = await db.entities.IntegrationConfig.filter({ key: ref });
    const val = rows && rows[0] && rows[0].value;
    if (val && typeof val === 'string') return { Authorization: val };
  } catch { /* secret store not configured in this environment */ }
  return {};
}

// Canary traffic allowlist. Canary sends NOTHING unless an explicit allowlist is
// configured, so an operator who moves to canary without one keeps legacy fully
// authoritative instead of quietly going live.
function parseCanaryAllowlist(appSettings) {
  try {
    const raw = appSettings && appSettings.distribution_canary_allowlist;
    if (!raw) return {};
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

// Whether the submitting key is allowed to see revenue on the response envelope.
// Same rule the legacy LeadByte path applies further down; kept as one helper so
// the native path can never diverge from it.
function exposeRevenueFor(apiKeyRecord, supplierRecord) {
  return apiKeyRecord.type === 'master'
    || (apiKeyRecord.type === 'supplier' && supplierRecord?.supplier_type === 'Internal')
    || apiKeyRecord.expose_revenue === true;
}

// Fire matching Deliveries destinations (non-default LeadByteConnector records).
// Same filter/condition/trigger logic as Conversion Events connectors.
function fireDeliveries(db, destinations, trigger, leadData, leadId, supplierAttribution, supplierRecord) {
  for (const dest of destinations) {
    if (!dest.enabled) continue;
    if (dest.is_default) continue;
    const triggers = parseJsonArray(dest.triggers);
    // No triggers selected = fire on every lead (gated only by filters). Only fire once - at intake (on_received).
    if (triggers.length > 0 && !triggers.includes(trigger)) continue;
    if (triggers.length === 0 && trigger !== 'on_received') continue;
    if (!connectorMatchesFilters(dest, leadData, supplierAttribution, supplierRecord)) continue;
    if (!connectorMatchesConditions(dest, leadData)) continue;

    sendDestinationAwait(dest, leadData, leadId, trigger)
      .then(async (result) => {
        await appendDeliveryLog(db, leadId, {
          connector: dest.api_name, trigger, http_status: result.http_status,
          success: !!result.success, error: result.error || '',
          payload: result.payload, response: result.response,
          timestamp: new Date().toISOString(),
        });
        if (!result.success) {
          await db.entities.ErrorLog.create({
            lead_id: leadId, stage: 'leadbyte', severity: 'warning',
            message: `Delivery failure: ${dest.api_name}`,
            detail: JSON.stringify(result), supplier_name: supplierAttribution,
          }).catch(() => {});
          await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution,
            { message: `Delivery failure: ${dest.api_name} - ${result.error || result.http_status}` }).catch(() => {});
        }
      })
      .catch(async (err) => {
        await appendDeliveryLog(db, leadId, {
          connector: dest.api_name, trigger, http_status: null,
          success: false, error: err.message || '',
          timestamp: new Date().toISOString(),
        });
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'leadbyte', severity: 'warning',
          message: `Delivery error: ${dest.api_name}`,
          detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
        }).catch(() => {});
      });
  }
}

// Append a CAPI result to the lead's capi_log field.
async function appendCapiLog(db, leadId, result) {
  try {
    const leads = await db.entities.Lead.filter({ id: leadId });
    const lead = leads[0];
    if (!lead) return;
    let log = [];
    try { log = JSON.parse(lead.capi_log || '[]'); } catch {}
    log.push({
      connector: result.connector, event_name: result.event_name, pixel: result.pixel,
      http_status: result.http_status, fbtrace_id: result.fbtrace_id,
      value: result.value ?? '', events_received: result.fb_response?.events_received,
      fb_response: result.fb_response, payload: result.payload || null,
      success: !!result.success, error: result.error || '', timestamp: new Date().toISOString(),
    });
    await db.entities.Lead.update(leadId, { capi_log: JSON.stringify(log) });
  } catch {}
}

// Append a Delivery result to the lead's delivery_log field.
async function appendDeliveryLog(db, leadId, entry) {
  try {
    const leads = await db.entities.Lead.filter({ id: leadId });
    const lead = leads[0];
    if (!lead) return;
    let log = [];
    try { log = JSON.parse(lead.delivery_log || '[]'); } catch {}
    log.push(entry);
    await db.entities.Lead.update(leadId, { delivery_log: JSON.stringify(log) });
  } catch {}
}

// Evaluate notification rules matching the given condition types.
async function evaluateNotifications(db, conditionTypes, lead, supplierAttribution, context = {}) {
  try {
    const rules = await db.entities.NotificationRule.filter({ enabled: true });
    for (const rule of rules) {
      if (!conditionTypes.includes(rule.condition_type)) continue;
      let summary = '';
      if (rule.condition_type === 'capi_failure' || rule.condition_type === 'api_error') {
        summary = `${rule.name}: ${context.message || 'API connector failure'}`;
      } else if (rule.condition_type === 'lead_queued') {
        summary = `${rule.name}: Lead queued - ${context.queue_reason || lead.queue_reason || 'unknown'}`;
      } else if (rule.condition_type === 'missing_fields') {
        summary = `${rule.name}: Missing required fields - ${context.queue_reason || ''}`;
      } else {
        continue;
      }
      const channels = parseJsonArray(rule.channels);
      const recipients = parseJsonArray(rule.recipients);
      await db.entities.NotificationEvent.create({
        rule_id: rule.id, triggered_at: new Date().toISOString(),
        summary, channel: channels.join(',') || 'email', delivered: false,
      }).catch(() => {});
      if (channels.includes('email') && recipients.length > 0) {
        try {
          await db.integrations.Core.SendEmail({
            to: recipients[0],
            subject: `Legenex Alert: ${rule.name}`,
            body: `${summary}\n\nLead ID: ${lead.id}\nSupplier: ${supplierAttribution}`,
          });
        } catch {}
      }
    }
  } catch {}
}

// ── Response Mapping ──────────────────────────────────────────────────────

function getPathValue(obj, path) {
  if (!path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function applyOperator(actual, operator, expected) {
  let act = actual == null ? '' : actual;
  if (typeof act === 'object') act = JSON.stringify(act);
  else act = String(act);
  const exp = expected || '';
  // Case-insensitive comparison for all string operators. This ensures
  // delivery/connector conditions match regardless of how the supplier
  // formatted the value (e.g. "yes" matches "Yes", "loss of life" matches
  // "Loss Of Life"). Numeric operators (gt, lt) are unaffected.
  const actLower = act.trim().toLowerCase();
  const expLower = exp.trim().toLowerCase();
  switch (operator) {
    case 'equals':
      if (actLower === expLower) return true;
      // For non-trivial values (> 3 chars), allow bidirectional contains so
      // "Loss of Life." matches "Loss Of Life" etc. Skip for very short
      // values to avoid false positives like "No" matching "Not at all".
      if (expLower.length > 3 && actLower.length > 3) {
        return actLower.includes(expLower) || expLower.includes(actLower);
      }
      return false;
    case 'not_equals':
      if (actLower === expLower) return false;
      if (expLower.length > 3 && actLower.length > 3) {
        return !(actLower.includes(expLower) || expLower.includes(actLower));
      }
      return true;
    case 'contains': return actLower.includes(expLower);
    case 'not_contains': return !actLower.includes(expLower);
    case 'starts_with': return actLower.startsWith(expLower);
    case 'ends_with': return actLower.endsWith(expLower);
    case 'is_empty': return act === '';
    case 'is_not_empty': return act !== '';
    case 'gt': return parseFloat(act) > parseFloat(exp);
    case 'lt': return parseFloat(act) < parseFloat(exp);
    default: return actLower.includes(expLower);
  }
}

async function resolveResponseMapping(db, lbResult, fallbackResponse, fallbackStatus) {
  try {
    const mappings = await db.entities.ResponseMapping.list('sort_order', 50);
    const incomingReason = fallbackResponse?.reason || fallbackResponse?.message || '';
    if (mappings.length === 0) return { response: fallbackResponse, status: fallbackStatus };
    const sorted = mappings.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const m of sorted) {
      if (m.is_fallback) continue;
      const actual = getPathValue(lbResult, m.field_path || 'records[0].status');
      if (applyOperator(actual, m.operator || 'contains', m.lb_status)) {
        const resp = { Response: m.response_label };
        if (incomingReason) resp.reason = incomingReason;
        return { response: resp, status: m.final_status };
      }
    }
    const fb = sorted.find(m => m.is_fallback);
    if (fb) {
      const resp = { Response: fb.response_label };
      if (incomingReason) resp.reason = incomingReason;
      return { response: resp, status: fb.final_status };
    }
    return { response: fallbackResponse, status: fallbackStatus };
  } catch {
    return { response: fallbackResponse, status: fallbackStatus };
  }
}

// ── TrustedForm validation ────────────────────────────────────────────────

const TRUSTEDFORM_RE = /^https?:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}(\?.*)?$/;

function isValidTrustedForm(url) {
  if (!url || typeof url !== 'string') return false;
  return TRUSTEDFORM_RE.test(url.trim());
}

// Check required custom fields against the lead payload.
function checkRequiredFields(customFields, leadData) {
  const missing = [];
  for (const f of customFields) {
    if (!f.required) continue;
    if (f.field_type === 'system') continue; // system fields are system-populated, not gated
    if (f.system_role) continue; // HLR/email-derived fields (phone_verified, email_valid) are enriched, not inbound-gated
    const val = leadData[f.field_name];
    if (val === undefined || val === null || String(val).trim() === '') {
      missing.push(f.field_name);
    }
  }
  return missing;
}

// Normalize incoming dropdown field values to their canonical option labels.
// Progressive matching: case-insensitive exact → bidirectional contains →
// token overlap. Prevents leads from being rejected by LeadByte or missing
// delivery conditions just because a supplier sent "yes" instead of "Yes" or
// "Loss of Life" instead of "Loss Of Life".
function normalizeDropdownValues(customFields, leadData) {
  const enriched = { ...leadData };
  for (const f of customFields) {
    if (!['system', 'dropdown'].includes(f.field_type)) continue;
    if (f.system_role) continue; // skip HLR/email-derived system fields
    let opts = [];
    if (Array.isArray(f.options)) opts = f.options;
    else if (typeof f.options === 'string') {
      try { const p = JSON.parse(f.options); if (Array.isArray(p)) opts = p; } catch {}
    }
    if (opts.length === 0) continue;

    const raw = enriched[f.field_name];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;

    const incoming = String(raw).trim().toLowerCase().replace(/[.\,!;:]+$/, '');
    if (!incoming) continue;

    // 1. Case-insensitive exact match (handles "yes" → "Yes", "loss of life" → "Loss Of Life")
    let match = opts.find(opt => String(opt).trim().toLowerCase().replace(/[.\,!;:]+$/, '') === incoming);

    // 2. Bidirectional contains: option contains incoming OR incoming contains option
    //    (handles "Loss of Life." → "Loss Of Life", "broken bones fracture" → "Broken Bones")
    if (!match) {
      match = opts.find(opt => {
        const optNorm = String(opt).trim().toLowerCase().replace(/[.\,!;:]+$/, '');
        if (optNorm.length < 2) return false;
        return optNorm.includes(incoming) || incoming.includes(optNorm);
      });
    }

    // 3. Token overlap: split both into word tokens, check if any token from
    //    the incoming value appears in any option (handles "bone fracture" → "Broken Bones"
    //    via the shared "bone" token, "spine injury" → "Back Or Neck Pain" won't match but
    //    "back pain" → "Back Or Neck Pain" will via "back" + "pain").
    if (!match) {
      const incomingTokens = incoming.split(/[\s,\/\-|]+/).filter(t => t.length > 2);
      if (incomingTokens.length > 0) {
        match = opts.find(opt => {
          const optTokens = String(opt).trim().toLowerCase().replace(/[.\,!;:]+$/, '')
            .split(/[\s,\/\-|]+/).filter(t => t.length > 2);
          return optTokens.some(ot => incomingTokens.some(it =>
            it === ot || it.includes(ot) || ot.includes(it)
          ));
        });
      }
    }

    if (match) {
      enriched[f.field_name] = String(match).trim();
    }
  }
  return enriched;
}

// Evaluate a single dry-run qualification condition (advisory only). Supports a
// fixed op set. Malformed inputs never throw here; the caller wraps parsing in
// try/catch and treats any failure as no advisory.
function evalDryRunCondition(leadData, cond) {
  const raw = leadData[cond.field];
  const present = raw !== null && raw !== undefined && String(raw).trim() !== '';
  switch (cond.op) {
    case 'eq': return String(raw ?? '') === String(cond.value ?? '');
    case 'neq': return String(raw ?? '') !== String(cond.value ?? '');
    case 'in': return Array.isArray(cond.value) && cond.value.map(String).includes(String(raw ?? ''));
    case 'not_in': return Array.isArray(cond.value) && !cond.value.map(String).includes(String(raw ?? ''));
    case 'gt': return parseFloat(raw) > parseFloat(cond.value);
    case 'gte': return parseFloat(raw) >= parseFloat(cond.value);
    case 'lt': return parseFloat(raw) < parseFloat(cond.value);
    case 'lte': return parseFloat(raw) <= parseFloat(cond.value);
    case 'exists': return present;
    case 'not_exists': return !present;
    case 'matches': return new RegExp(String(cond.value)).test(String(raw ?? ''));
    case 'within_months': {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return false;
      const months = Number(cond.value);
      if (isNaN(months)) return false;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      return d >= cutoff && d <= new Date();
    }
    case 'between': {
      if (!Array.isArray(cond.value) || cond.value.length !== 2) return false;
      const n = parseFloat(raw);
      return n >= parseFloat(cond.value[0]) && n <= parseFloat(cond.value[1]);
    }
    default: return false;
  }
}

// Recursively evaluate a dry-run qualification node. Groups: all, any, not.
// Leaves are {field, op, value}. Depth-capped; unrecognised nodes pass.
function evalDryRunNode(leadData, node, depth = 0) {
  if (depth > 25) return true;
  if (!node || typeof node !== 'object') return true;
  if (Array.isArray(node.all)) return node.all.every((c) => evalDryRunNode(leadData, c, depth + 1));
  if (Array.isArray(node.any)) return node.any.some((c) => evalDryRunNode(leadData, c, depth + 1));
  if (node.not !== undefined) return !evalDryRunNode(leadData, node.not, depth + 1);
  if (node.field && node.op) return evalDryRunCondition(leadData, node);
  return true;
}

// Normalize inbound field aliases onto leadPayload and return the resolved
// core identity locals. Pure: same coalescing and same leadPayload assignments,
// in the same order, as the original inline block.
function applyInboundAliases(leadPayload) {
  const mobile = leadPayload.mobile || leadPayload.phone1 || leadPayload.phone || leadPayload.phone_number || '';
  const firstName = leadPayload.first_name || leadPayload.firstname || '';
  const lastName = leadPayload.last_name || leadPayload.lastname || '';
  const email = leadPayload.email || '';

  if (!leadPayload.first_name && firstName) leadPayload.first_name = firstName;
  if (!leadPayload.last_name && lastName) leadPayload.last_name = lastName;
  if (!leadPayload.mobile && mobile) leadPayload.mobile = mobile;
  if (!leadPayload.ip_address && leadPayload.ipaddress) leadPayload.ip_address = leadPayload.ipaddress;
  if (!leadPayload.optin_url && leadPayload.optinurl) leadPayload.optin_url = leadPayload.optinurl;
  if (!leadPayload.trustedform_url && leadPayload.trustedform_cert) leadPayload.trustedform_url = leadPayload.trustedform_cert;
  if (!leadPayload.jornaya_token && leadPayload.jornaya_leadid) leadPayload.jornaya_token = leadPayload.jornaya_leadid;
  if (!leadPayload.supplier_brand && leadPayload.brand) leadPayload.supplier_brand = leadPayload.brand;
  if (!leadPayload.ad_label && leadPayload.utm_ad_label) leadPayload.ad_label = leadPayload.utm_ad_label;

  // Standardise identity before anything downstream reads it. Suppliers send
  // the same person as Blackicedane@ / blackicedane@ and as +1 404 979 1133 /
  // 4049791133, which previously produced two Lead records for one person.
  // Canonical stored form: email lowercased, mobile E.164, names Title Case.
  // The *_normalized keys are the match keys and are null when the value
  // cannot be resolved, so junk never becomes a match key.
  const emailNormalized = normalizeEmail(email);
  const mobileNormalized = toE164Us(mobile);
  const cleanEmail = emailNormalized || String(email || '').trim();
  const cleanMobile = mobileNormalized || String(mobile || '').trim();
  const cleanFirst = titleCaseName(firstName) || String(firstName || '').trim();
  const cleanLast = titleCaseName(lastName) || String(lastName || '').trim();

  // Write the standardised values back onto the payload so mapped_fields and
  // every downstream mapping see the same canonical form as the columns.
  if (cleanEmail) leadPayload.email = cleanEmail;
  if (cleanMobile) leadPayload.mobile = cleanMobile;
  if (cleanFirst) leadPayload.first_name = cleanFirst;
  if (cleanLast) leadPayload.last_name = cleanLast;

  return {
    firstName: cleanFirst,
    lastName: cleanLast,
    mobile: cleanMobile,
    email: cleanEmail,
    emailNormalized,
    mobileNormalized: mobileNormalized ? mobileNormalized.slice(2) : null,
  };
}

// Patterns that indicate a LeadByte rejection is due to missing/invalid fields
const QUEUE_REJECTION_PATTERNS = ['missing', 'required', 'invalid', 'not provided'];

function isQueueableRejection(reasonText) {
  const lower = String(reasonText || '').toLowerCase();
  return QUEUE_REJECTION_PATTERNS.some(p => lower.includes(p));
}

// Patterns that indicate a LeadByte rejection is a content/value mismatch, which
// should classify as Disqualified (fires on_dq) rather than a catch-all Error.
const CONTENT_REJECTION_PATTERNS = ['not an expected value', 'not accepted', 'not allowed', 'out of range', 'does not match'];

function isContentRejection(reasonText) {
  const lower = String(reasonText || '').toLowerCase();
  return CONTENT_REJECTION_PATTERNS.some(p => lower.includes(p));
}

// ── Response envelope ──────────────────────────────────────────────────────
// Builds the layered response returned to suppliers. Keeps the legacy `Response`
// field as a mirror so existing suppliers keep working. The `Response` value is
// whatever the legacy flow returns today (Sold/Unsold/Queued/Duplicate/Error).
function buildEnvelope(traceId, {
  ok, acceptance, lead_id = null, lead_status, sold = false,
  revenue = null, code, reason = null, message, Response,
}) {
  return {
    ok,
    trace_id: traceId,
    received_at: new Date().toISOString(),
    acceptance,
    lead_id: lead_id != null ? String(lead_id) : null,
    lead_status,
    sold,
    revenue: revenue != null && !isNaN(revenue) ? Number(revenue) : null,
    currency: 'USD',
    code,
    reason: reason || null,
    message,
    Response,
  };
}

// Map an inbound-status-bypass final_status to the envelope lead_status.
function bypassLeadStatus(finalForBypass) {
  const map = { Disqualified: 'disqualified', Returned: 'returned', Sold: 'sold' };
  return map[finalForBypass] || 'sold';
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;
  const method = req.method;

  if (method === 'GET') return Response.json({ status: 'ok' }, { status: 200 });

  const traceId = (globalThis.crypto?.randomUUID?.() || `t_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  if (method !== 'POST') {
    return Response.json(buildEnvelope(traceId, {
      ok: false, acceptance: 'rejected', lead_status: 'rejected',
      code: 'METHOD_NOT_ALLOWED', reason: 'Method not allowed',
      message: 'Method not allowed', Response: 'Error',
    }), { status: 405 });
  }

  const startTime = Date.now();
  let leadId = null;
  let capturedRevenue = null;

  try {
    const body = await req.json();
    const payload = body.payload || body;

    let supplierKeyRaw =
      req.headers.get('X-API-KEY') ||
      req.headers.get('X_KEY') ||
      req.headers.get('x-api-key') ||
      req.headers.get('x_key') ||
      payload['X-API-KEY'] ||
      payload['X_KEY'] ||
      payload._supplier_key ||
      payload.api_key ||
      payload.apiKey ||
      null;
    if (!supplierKeyRaw) {
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader.startsWith('Basic ')) {
        const decoded = atob(authHeader.slice(6));
        supplierKeyRaw = decoded.split(':')[0] || null;
      }
    }

    const leadPayload = { ...payload };
    const inboundPhoneVerified = String(payload.phone_verified || '').trim();
    const isDryRun = payload._dry_run === true;
    const dryRunCampaignRef = payload._campaign;
    delete leadPayload['X-API-KEY'];
    delete leadPayload._supplier_key;
    delete leadPayload._dry_run;
    delete leadPayload._campaign;
    delete leadPayload.phone_verified;
    delete leadPayload.api_key;
    delete leadPayload.apiKey;

    // ── a. AUTH ──────────────────────────────────────────────────────────
    let apiKeyRecord = null;
    if (supplierKeyRaw) {
      const keys = await db.entities.ApiKey.filter({ key: supplierKeyRaw });
      if (keys.length > 0 && keys[0].active) apiKeyRecord = keys[0];
    }
    if (!apiKeyRecord) {
      await db.entities.ErrorLog.create({
        stage: 'auth', severity: 'error',
        message: 'Invalid or missing API key',
        detail: JSON.stringify({ key_provided: supplierKeyRaw ? 'yes' : 'no' }),
        supplier_name: 'Unknown',
      });
      return Response.json(buildEnvelope(traceId, {
        ok: false, acceptance: 'unauthorized', lead_status: 'rejected',
        code: 'BAD_KEY', reason: 'Invalid or missing API key',
        message: 'Invalid or missing API key', Response: 'Error',
      }), { status: 401 });
    }

    const supplierAttribution = apiKeyRecord.type === 'master'
      ? 'Master' : (apiKeyRecord.supplier_name || 'Unknown');

    // ── DRY RUN: validate only, zero side effects ─────────────────────────
    // Runs after auth + supplierAttribution, before any entity write. A
    // validation is not a request: the ApiKey usage counters are NOT touched.
    if (isDryRun) {
      const dryCustomFields = await db.entities.CustomField.list();
      applyInboundAliases(leadPayload);
      const missing = checkRequiredFields(dryCustomFields, leadPayload);

      const trustedformUrl = leadPayload.trustedform_url || leadPayload.trustedform_cert || '';
      const certMissing = String(trustedformUrl).trim() === '';

      // Optional qualification advisory. Never influences live routing.
      let qualification = null;
      let certRequired = false;
      if (dryRunCampaignRef !== undefined && dryRunCampaignRef !== null && String(dryRunCampaignRef).trim() !== '') {
        let campaign = null;
        try {
          const byId = await db.entities.Campaign.filter({ id: String(dryRunCampaignRef) });
          if (byId.length > 0) campaign = byId[0];
          if (!campaign) {
            const byName = await db.entities.Campaign.filter({ name: String(dryRunCampaignRef) });
            if (byName.length > 0) campaign = byName[0];
          }
        } catch { campaign = null; }
        if (campaign) {
          certRequired = campaign.trustedform_required === true;
          if (campaign.qualification_rules) {
            try {
              const rules = JSON.parse(campaign.qualification_rules);
              qualification = { passed: evalDryRunNode(leadPayload, rules) };
            } catch { qualification = null; }
          }
        }
      }

      const certBlocked = certRequired && certMissing;
      const disqualified = qualification && qualification.passed === false;
      let wouldBeStatus;
      if (missing.length > 0 || certBlocked) wouldBeStatus = 'Queued';
      else if (disqualified) wouldBeStatus = 'Disqualified';
      else wouldBeStatus = 'Accepted';

      const valid = missing.length === 0 && !certBlocked && !disqualified;

      return Response.json({
        dry_run: true,
        valid,
        missing,
        invalid: [],
        cert_missing: certMissing,
        qualification,
        would_be_status: wouldBeStatus,
        trace_id: traceId,
      }, { status: 200 });
    }

    await db.entities.ApiKey.update(apiKeyRecord.id, {
      last_used_at: new Date().toISOString(),
      request_count: (apiKeyRecord.request_count || 0) + 1,
    });

    // ── a. CREATE LEAD ────────────────────────────────────────────────────
    const now = new Date();
    const appSettingsArr = await db.entities.AppSettings.list();
    const appSettings = appSettingsArr[0] || {};
    // Gateway mode: live (default), test, or capture_only. Anything missing,
    // blank, or unrecognised is treated as live. Never throws.
    const gatewayModeRaw = String(appSettings.gateway_mode || '').trim().toLowerCase();
    const gatewayMode = ['live', 'test', 'capture_only'].includes(gatewayModeRaw) ? gatewayModeRaw : 'live';
    const captureOnly = gatewayMode === 'capture_only';
    // Distribution engine mode (ADDITIVE, flag-gated). Default legacy_only keeps
    // the existing LeadByte path fully authoritative and runs no new code.
    const distModeRaw = String(appSettings.distribution_mode || '').trim().toLowerCase();
    const distributionMode = ['legacy_only', 'shadow', 'canary', 'new_primary_with_legacy_fallback', 'new_only']
      .includes(distModeRaw) ? distModeRaw : 'legacy_only';
    const tsFmt = appSettings.timestamp_format || 'MM/DD/YYYY HH:MM:SS';
    leadPayload.timestamp = formatTimestamp(now, tsFmt);

    const lead = await db.entities.Lead.create({
      supplier_name: supplierAttribution,
      supplier_key_id: apiKeyRecord.id,
      raw_payload: JSON.stringify(leadPayload),
      final_status: 'Processing',
    });
    leadId = lead.id;

    // Assign unique numeric lead_id before any CAPI event or response
    const systemLeadId = await nextLeadId(db);
    leadPayload.lead_id = systemLeadId;
    await db.entities.Lead.update(leadId, { lead_id: systemLeadId });

    // ── Distribution engine SHADOW hook (ADDITIVE, flag-gated) ────────────────
    // Runs ONLY in shadow mode. Calls the ONE canonical engine (via the generated
    // bundle) through the snapshot loader and writes ONLY a RouteDecisionTrace. It
    // sends/reserves/bills nothing and is
    // fully isolated: the dynamic import runs only when enabled (so production on
    // legacy_only never loads it), and any error is caught so it can never alter
    // the legacy LeadByte outcome or the supplier response envelope. Deployment of
    // the generated bundle to the function runtime is verified in staging (CAP-2).
    //
    // Delivering modes (canary, new_primary, new_only) are handled by the native
    // distribution block further down, which writes its own trace for the same
    // lead. Gating this to shadow keeps exactly one RouteDecisionTrace per lead so
    // the comparison report is not double counted.
    if (distributionMode === 'shadow') {
      try {
        const leadDist = await import('./routingEngine.generated.js');
        // Resolve the campaign the same way the live path does. Suppliers post no
        // campaign_id today, so without this every shadow trace would resolve to
        // no campaign and report no_route_config, making a healthy shadow run look
        // completely dead. A campaign IS a vertical, so the vertical picks it.
        const shadowCampaigns = await db.entities.Campaign.filter({ active: true }, 'sort_order', 200, 0);
        const shadowMatch = leadDist.resolveCampaign(leadPayload, shadowCampaigns || []);
        await leadDist.runShadow(db, {
          distributionMode,
          leadId,
          campaignId: shadowMatch.campaignId,
          idempotencyKey: String(systemLeadId),
          leadData: leadPayload,
          nowMs: Date.now(),
        });
      } catch (shadowErr) {
        // The new engine must never break the authoritative legacy path. Record
        // the failure best-effort; do not rethrow.
        try {
          await db.entities.RouteDecisionTrace.create({
            lead_id: leadId, distribution_mode: distributionMode, result: 'engine_load_error',
            error_message: String(shadowErr && (shadowErr as Error).message || shadowErr).slice(0, 300),
            created_at: new Date().toISOString(),
          });
        } catch (_ignore) { /* nothing else is safe to do */ }
      }
    }

    // Load all config in parallel
    const [hlrSettingsArr, emailSettingsArr, allDestinations, calcs, customFields, apiConnectors, responseMappings] = await Promise.all([
      db.entities.HlrSettings.list(),
      db.entities.EmailValidationSettings.list(),
      db.entities.LeadByteConnector.filter({ enabled: true }),
      db.entities.CustomCalculation.list(),
      db.entities.CustomField.list(),
      db.entities.ApiConnector.filter({ enabled: true }),
      db.entities.ResponseMapping.list('sort_order', 50),
    ]);
    const hlrSettings = hlrSettingsArr[0] || null;
    const emailSettings = emailSettingsArr[0] || null;
    const emailValidField = customFields.find(f => f.system_role === 'email_valid');
    const phoneVerifiedField = customFields.find(f => f.system_role === 'phone_verified');
    const emailValidFieldName = emailValidField?.field_name || 'email_valid';
    const phoneVerifiedFieldName = phoneVerifiedField?.field_name || 'phone_verified';
    const leadByteConnector = allDestinations.find(d => d.is_default) || null;

    // Look up supplier record for type-based filtering
    let supplierRecord = null;
    if (apiKeyRecord.supplier_id) {
      const ss = await db.entities.Supplier.filter({ id: apiKeyRecord.supplier_id });
      if (ss.length > 0) supplierRecord = ss[0];
    } else if (supplierAttribution !== 'Master') {
      const ss = await db.entities.Supplier.filter({ name: supplierAttribution });
      if (ss.length > 0) supplierRecord = ss[0];
    }

    // ── Normalize field aliases ──────────────────────────────────────────
    const { firstName, lastName, mobile, email, emailNormalized, mobileNormalized } = applyInboundAliases(leadPayload);

    await db.entities.Lead.update(leadId, {
      mapped_fields: JSON.stringify(leadPayload),
      first_name: firstName, last_name: lastName, mobile: mobile, email: email,
      email_normalized: emailNormalized, mobile_normalized: mobileNormalized,
    });

    // ── AUTO-DETECT UNKNOWN INBOUND FIELDS ──────────────────────────────
    // When adaptive_fields_enabled is true (default), inbound payload keys that
    // aren't in the CustomField catalog and aren't on the ignore list are
    // auto-created as CustomField records with auto_created=true. They appear in
    // the "X fields auto-detected" banner on the Custom Fields settings page for
    // the operator to review and confirm (Add) or delete (Ignore).
    //
    // Required fields gate the lead (checkRequiredFields below); non-required
    // fields accept any value. Auto-detected fields default to non-required,
    // include_in_leadbyte=false, so they never block or forward until confirmed.
    if (appSettings.adaptive_fields_enabled !== false) {
      const ignoreList = parseJsonArray(appSettings.adaptive_fields_ignore_list)
        .map(s => String(s).toLowerCase());
      const existingNames = new Set(customFields.map(f => (f.field_name || '').toLowerCase()));
      // System/routing keys that must never be cataloged as custom fields.
      const SYSTEM_KEYS = new Set([
        'lead_route', 'lead_status', 'lead_id', 'lead_type',
        'trustedform_url', 'trustedform_cert', 'jornaya_token', 'jornaya_leadid',
        'ssid', 'supplier_brand', 'brand', 'supplier_name',
        'ip_address', 'ipaddress', 'optin_url', 'optinurl',
        'utm_ad_label', 'utm_source', 'utm_medium', 'utm_campaign',
        'user_agent', 'browser', 'resolution', 'device',
      ]);
      let autoAdded = 0;
      for (const [key, value] of Object.entries(leadPayload)) {
        if (autoAdded >= 10) break; // cap per lead to prevent flooding
        const keyLower = key.toLowerCase();
        if (existingNames.has(keyLower)) continue;
        if (SYSTEM_KEYS.has(keyLower)) continue;
        if (ignoreList.includes(keyLower)) continue;
        // Skip PII fields that are already Lead entity columns.
        if (['first_name', 'firstname', 'last_name', 'lastname', 'mobile', 'phone', 'phone1', 'phone_number', 'email'].includes(keyLower)) continue;
        const sample = value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value)).trim();
        if (!sample) continue;
        let guessedType = 'string';
        if (typeof value === 'boolean') guessedType = 'boolean';
        else if (typeof value === 'number') guessedType = 'number';
        try {
          const newField = await db.entities.CustomField.create({
            field_name: key,
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            field_type: guessedType,
            source: 'inbound',
            include_in_leadbyte: false,
            leadbyte_field_name: key,
            auto_created: true,
            sample_value: sample.slice(0, 200),
            sort_order: customFields.length,
          });
          customFields.push(newField);
          existingNames.add(keyLower);
          autoAdded++;
        } catch {}
      }
    }

    // ── ROUTE: lead_route (case-insensitive contains) ────────────────────
    const leadRouteRaw = String(leadPayload.lead_route || 'standard').trim().toLowerCase();
    const routeIs = {
      direct: leadRouteRaw.includes('direct'),
      data: leadRouteRaw.includes('data'),
      event: leadRouteRaw.includes('event'),
      queue: leadRouteRaw.includes('queue'),
      test: leadRouteRaw.includes('test'),
      internal: leadRouteRaw.includes('internal'),
      // GATEWAY route: the legacy behaviour. Enrich and qualify the lead here,
      // then hand it to LeadByte to sell and read the value back. This is what
      // 'standard' has always done; naming it explicitly lets 'standard' become
      // the native distribution path without moving any live traffic. Phased out
      // once LeadByte is retired.
      gateway: leadRouteRaw.includes('gateway'),
    };
    // STANDARD route: the native lead distribution path. The lead is enriched and
    // qualified exactly as before, then sold through its Campaign to buyers.
    // Remains the default for a lead that posts no lead_route at all.
    //
    // IMPORTANT: this does NOT move live traffic on its own. Native selling still
    // requires distribution_mode to be past legacy_only; on legacy_only a standard
    // lead falls through to the LeadByte post exactly as it does today.
    routeIs.standard = !routeIs.direct && !routeIs.data && !routeIs.event && !routeIs.queue && !routeIs.test && !routeIs.internal && !routeIs.gateway;

    // Record the resolved route on the lead so reporting and the shadow/canary
    // comparison can answer "which path did this lead take". Reporting only: the
    // live decision above still comes from the inbound payload.
    const resolvedRouteName = ['test', 'internal', 'queue', 'event', 'data', 'direct', 'gateway']
      .find((r) => routeIs[r]) || 'standard';
    await db.entities.Lead.update(leadId, { lead_route: resolvedRouteName }).catch(() => {});

    // TEST route: save only - no processing, no triggers
    if (routeIs.test) {
      const testResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'queued',
        code: 'TEST_ROUTE', reason: 'Test route - lead saved for testing only',
        message: 'Test route - lead saved for testing only', Response: 'Queued',
      });
      await db.entities.Lead.update(leadId, {
        final_status: 'Queued',
        queue_reason: 'Test route - no downstream processing',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(testResponse),
      });
      return Response.json(testResponse, { status: 200 });
    }

    // INTERNAL route: save only - a real lead saved to the system with nothing
    // else fired. Same shape as the TEST route, but it is a genuine lead (not a
    // test record), so it keeps a reporting-visible final_status.
    if (routeIs.internal) {
      const internalInbound = String(leadPayload.lead_status || '').trim();
      const internalFinalStatus = (internalInbound && BUILTIN_LEAD_STATUSES.includes(internalInbound))
        ? internalInbound : 'Qualified';
      const internalResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'accepted',
        code: 'INTERNAL_ROUTE', reason: 'Internal route - lead saved to system only',
        message: 'Internal route - lead saved to system only', Response: internalFinalStatus,
      });
      await db.entities.Lead.update(leadId, {
        final_status: internalFinalStatus,
        queue_reason: '',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(internalResponse),
      });
      return Response.json(internalResponse, { status: 200 });
    }

    // QUEUE route: hold for manual processing - fire on_queued, skip LeadByte
    if (routeIs.queue) {
      fireConnectors(db, apiConnectors, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
      if (!routeIs.event) fireDeliveries(db, allDestinations, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
      await evaluateNotifications(db, ['lead_queued'], { id: leadId, queue_reason: 'Queue route - held for manual processing' }, supplierAttribution, { queue_reason: 'Queue route' });
      const queueResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'queued', lead_id: systemLeadId, lead_status: 'queued',
        code: 'QUEUE_ROUTE', reason: 'Queue route - held for manual processing',
        message: 'Queue route - held for manual processing', Response: 'Queued',
      });
      await db.entities.Lead.update(leadId, {
        final_status: 'Queued',
        queue_reason: 'Queue route - held for manual processing',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(queueResponse),
      });
      return Response.json(queueResponse, { status: 200 });
    }

    // ── PRE-CLASSIFIED LEADS: bypass the entire LeadByte system ────────
    // A Disqualified lead is NOT an Unsold lead (Unsold = a Qualified lead
    // that didn't sell). Disqualified leads and custom (non-builtin) lead
    // statuses (e.g. "24m Lead") are pre-classified - they skip HLR/phone
    // verification, email validation, TrustedForm, the payload delay, and
    // LeadByte. They fire their matching trigger (on_dq / on_<custom>),
    // AWAIT every send so CAPI + delivery logs populate, and return the
    // actual response from the destination endpoint. The inbound
    // lead_status is preserved as-is.
    const inboundLeadStatus = String(leadPayload.lead_status || '').trim();
    const isBuiltinStatus = BUILTIN_LEAD_STATUSES.includes(inboundLeadStatus);
    if (inboundLeadStatus && inboundLeadStatus !== 'Qualified' && (inboundLeadStatus === 'Disqualified' || !isBuiltinStatus)) {
      const bypassTrigger = triggerKeyForStatus(inboundLeadStatus);

      // CAPI / webhook connectors - awaited so logs populate before return.
      for (const conn of apiConnectors) {
        if (!conn.enabled) continue;
        const trig = parseJsonArray(conn.triggers);
        if (trig.length > 0 && !trig.includes(bypassTrigger)) continue;
        if (trig.length === 0 && bypassTrigger !== 'on_received') continue;
        if (!connectorMatchesFilters(conn, leadPayload, supplierAttribution, supplierRecord)) continue;
        if (!connectorMatchesConditions(conn, leadPayload)) continue;
        const eventName = getTriggerEventName(conn, bypassTrigger);
        if (!eventName && (bypassTrigger === 'on_sold' || bypassTrigger === 'on_dq')) continue;
        if (conn.kind === 'facebook_capi') {
          try {
            const result = await sendCapiEvent(conn, leadPayload, leadId, eventName, bypassTrigger);
            await appendCapiLog(db, leadId, result);
            if (!result.success) {
              await db.entities.ErrorLog.create({ lead_id: leadId, stage: 'leadbyte', severity: 'warning', message: `CAPI failure: ${conn.name} (${eventName})`, detail: JSON.stringify(result), supplier_name: supplierAttribution }).catch(() => {});
              await evaluateNotifications(db, ['capi_failure', 'api_error'], { id: leadId }, supplierAttribution, { message: `CAPI failure: ${conn.name} (${eventName}) - ${result.error || result.http_status}` }).catch(() => {});
            }
          } catch (err) {
            await appendCapiLog(db, leadId, { connector: conn.name, event_name: eventName, pixel: conn.fb_pixel_id, http_status: null, fbtrace_id: '', success: false, error: err.message, value: '', payload: null });
            await db.entities.ErrorLog.create({ lead_id: leadId, stage: 'leadbyte', severity: 'warning', message: `CAPI error: ${conn.name} (${eventName})`, detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution }).catch(() => {});
          }
        } else {
          try {
            const result = await sendHttpEvent(conn, leadPayload, leadId, eventName);
            if (!result.success) {
              await db.entities.ErrorLog.create({ lead_id: leadId, stage: 'leadbyte', severity: 'warning', message: `API error: ${conn.name}`, detail: JSON.stringify(result), supplier_name: supplierAttribution }).catch(() => {});
              await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution, { message: `API error: ${conn.name} - ${result.error || result.http_status}` }).catch(() => {});
            }
          } catch (err) {
            await db.entities.ErrorLog.create({ lead_id: leadId, stage: 'leadbyte', severity: 'warning', message: `API error: ${conn.name}`, detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution }).catch(() => {});
          }
        }
      }

      // Delivery destinations - awaited, capture payload + response body.
      const deliveryResults = [];
      if (!routeIs.event) {
        for (const dest of allDestinations) {
          if (!dest.enabled) continue;
          if (dest.is_default) continue;
          const trig = parseJsonArray(dest.triggers);
          if (trig.length > 0 && !trig.includes(bypassTrigger)) continue;
          if (trig.length === 0 && bypassTrigger !== 'on_received') continue;
          if (!connectorMatchesFilters(dest, leadPayload, supplierAttribution, supplierRecord)) continue;
          if (!connectorMatchesConditions(dest, leadPayload)) continue;
          try {
            const result = await sendDestinationAwait(dest, leadPayload, leadId, bypassTrigger);
            await appendDeliveryLog(db, leadId, {
              connector: dest.api_name, trigger: bypassTrigger,
              http_status: result.http_status, success: !!result.success,
              error: result.error || '', payload: result.payload, response: result.response,
              timestamp: new Date().toISOString(),
            });
            deliveryResults.push(result);
            if (!result.success) {
              await db.entities.ErrorLog.create({ lead_id: leadId, stage: 'leadbyte', severity: 'warning', message: `Delivery failure: ${dest.api_name}`, detail: JSON.stringify(result), supplier_name: supplierAttribution }).catch(() => {});
              await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution, { message: `Delivery failure: ${dest.api_name} - ${result.error || result.http_status}` }).catch(() => {});
            }
          } catch (err) {
            await appendDeliveryLog(db, leadId, { connector: dest.api_name, trigger: bypassTrigger, http_status: null, success: false, error: err.message, payload: '', response: '', timestamp: new Date().toISOString() });
            await db.entities.ErrorLog.create({ lead_id: leadId, stage: 'leadbyte', severity: 'warning', message: `Delivery error: ${dest.api_name}`, detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution }).catch(() => {});
          }
        }
      }

      // Build the supplier response from the actual destination response.
      let responseLabel;
      let bypassReason;
      if (deliveryResults.length > 0) {
        const primary = deliveryResults[0];
        const respBody = (primary.response || '').trim();
        responseLabel = primary.success ? 'Sent' : 'Error';
        if (respBody) {
          try { const j = JSON.parse(respBody); responseLabel = j.Response || j.response || j.status || j.message || respBody; }
          catch { responseLabel = respBody; }
        }
        bypassReason = `${inboundLeadStatus} lead - delivered to ${primary.connector} (HTTP ${primary.http_status || 'n/a'})`;
      } else {
        responseLabel = 'Sent';
        bypassReason = `${inboundLeadStatus} lead - no matching delivery destination`;
      }
      const finalForBypass = inboundLeadStatus === 'Disqualified' ? 'Disqualified' : (inboundLeadStatus === 'Returned' ? 'Returned' : 'Sold');
      const bypassResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'accepted', lead_id: systemLeadId,
        lead_status: bypassLeadStatus(finalForBypass), code: 'INBOUND_STATUS_BYPASS',
        reason: bypassReason, message: bypassReason, Response: responseLabel,
      });
      await db.entities.Lead.update(leadId, {
        final_status: finalForBypass,
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(bypassResponse),
      });
      return Response.json(bypassResponse, { status: 200 });
    }

    // ── b. FIRE ON RECEIVED (route-aware, fire-and-forget) ─────────────
    fireConnectors(db, apiConnectors, 'on_received', leadPayload, leadId, supplierAttribution, supplierRecord);
    // Event route: conversion events only - skip deliveries
    if (!routeIs.event) {
      fireDeliveries(db, allDestinations, 'on_received', leadPayload, leadId, supplierAttribution, supplierRecord);
    }

    // ── c. HLR LOOKUP ────────────────────────────────────────────────────
    let hlrResult = null;
    let hlrRequestBody = {};

    const hlrRouteAllowed = routeMatchesFilter(hlrSettings, routeIs);
    const hlrSupplierAllowed = supplierMatchesFilter(hlrSettings, supplierAttribution, supplierRecord);
    if (hlrSettings && hlrSettings.enabled && hlrRouteAllowed && hlrSupplierAllowed && !inboundPhoneVerified) {
      const reqFieldMap = typeof hlrSettings.request_field_map === 'string'
        ? JSON.parse(hlrSettings.request_field_map || '{}')
        : (hlrSettings.request_field_map || {});
      const mobileField = reqFieldMap.mobile || 'phone';
      const firstField = reqFieldMap.first_name || 'firstname';
      const lastField = reqFieldMap.last_name || 'lastname';

      hlrRequestBody = {
        mobile: leadPayload[mobileField] || mobile,
        first_name: leadPayload[firstField] || firstName,
        last_name: leadPayload[lastField] || lastName,
      };
      const failMode = hlrSettings.fail_mode || 'fail_open';
      const timeoutMs = hlrSettings.timeout_ms || 8000;

      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);
        const hlrResp = await fetch(hlrSettings.endpoint_url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hlrRequestBody), signal: controller.signal,
        });
        clearTimeout(tid);
        if (!hlrResp.ok) throw new Error(`HLR returned HTTP ${hlrResp.status}`);
        hlrResult = await hlrResp.json();
        await db.entities.Lead.update(leadId, {
          hlr_request: JSON.stringify(hlrRequestBody),
          hlr_response: JSON.stringify(hlrResult),
          hlr_status: hlrResult.lh_hlr_response || '',
          hlr_summary_score: hlrResult.summary_score ?? null,
        });
      } catch (err) {
        const hlrError = err.message || 'HLR lookup failed';
        await db.entities.Lead.update(leadId, {
          hlr_error: hlrError, hlr_request: JSON.stringify(hlrRequestBody),
        });
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'hlr', severity: 'error',
          message: hlrError, detail: JSON.stringify({ fail_mode: failMode }),
          supplier_name: supplierAttribution,
        });
        if (failMode === 'fail_closed') {
          const hlrFailResponse = buildEnvelope(traceId, {
            ok: false, acceptance: 'error', lead_id: systemLeadId, lead_status: 'error',
            code: 'HLR_FAILED', reason: 'HLR lookup failed',
            message: 'HLR lookup failed', Response: 'Error',
          });
          await db.entities.Lead.update(leadId, {
            final_status: 'Error', error_stage: 'hlr',
            processed_at: new Date().toISOString(),
            process_time_ms: Date.now() - startTime,
            response_returned: JSON.stringify(hlrFailResponse),
          });
          return Response.json(hlrFailResponse, { status: 200 });
        }
      }
    }

    // ── c2. EMAIL VALIDATION (configurable routes/suppliers) ─────────────
    const emailEnabled = emailSettings ? emailSettings.enabled !== false : true;
    const emailRouteAllowed = routeMatchesFilter(emailSettings, routeIs);
    const emailSupplierAllowed = supplierMatchesFilter(emailSettings, supplierAttribution, supplierRecord);
    let emailValidResult = null;
    if (emailEnabled && emailRouteAllowed && emailSupplierAllowed && email) {
      try {
        const ev = String(email).trim().toLowerCase();
        const formatOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ev);
        let mxOk = false;
        if (formatOk) {
          const domain = ev.split('@')[1];
          try {
            const dns = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
            const ddata = await dns.json();
            mxOk = Array.isArray(ddata.Answer) && ddata.Answer.some(a => a.type === 15);
          } catch {}
        }
        emailValidResult = (formatOk && mxOk) ? 'Yes' : 'No';
        await db.entities.Lead.update(leadId, { email_valid: emailValidResult });
      } catch {
        emailValidResult = 'No';
        await db.entities.Lead.update(leadId, { email_valid: 'No' });
      }
    }

    // ── Run custom calculations ──────────────────────────────────────────
    const phoneVerifiedSource = hlrSettings?.phone_verified_source || 'lh_hlr_response';
    let enrichedData = runCalculations(calcs, leadPayload, hlrResult, phoneVerifiedSource, phoneVerifiedFieldName, supplierRecord?.supplier_type);
    if (hlrResult) {
      enrichedData.hlr_status = hlrResult.lh_hlr_response || '';
      enrichedData.hlr_score = hlrResult.summary_score != null ? String(hlrResult.summary_score) : '';
      enrichedData.country_code = hlrResult.country_code || '';
    }
    // Precedence: HLR result (already set by runCalculations) > inbound phone_verified > configured static fallback.
    if (!hlrResult) {
      if (inboundPhoneVerified) {
        enrichedData[phoneVerifiedFieldName] = inboundPhoneVerified;
      } else if (String(enrichedData[phoneVerifiedFieldName] ?? '').trim() === '') {
        enrichedData[phoneVerifiedFieldName] = hlrSettings?.phone_verified_fallback ?? 'Not Verified';
      }
    }
    if (emailValidResult !== null) {
      enrichedData[emailValidFieldName] = emailValidResult;
    }

    // Normalize dropdown field values to their canonical option labels so
    // downstream systems (LeadByte, deliveries, conditions) receive the exact
    // values defined in the Custom Fields catalog, preventing rejections from
    // case differences, extra punctuation, or phrasing variations.
    enrichedData = normalizeDropdownValues(customFields, enrichedData);

    // Persist the enriched payload back to mapped_fields so calculated fields
    // (lead_type, Supplier Source, accident_date buckets, state maps, etc.) are
    // visible in the Leads table and lead summary, not just used for forwarding.
    await db.entities.Lead.update(leadId, { mapped_fields: JSON.stringify(enrichedData) });

    // ── d. GATE: TrustedForm cert (hard enforce) ─────────────────────────
    const requireCert = appSettings.require_trustedform_cert !== false;
    const trustedformUrl = leadPayload.trustedform_url || leadPayload.trustedform_cert || '';
    const tfValid = isValidTrustedForm(trustedformUrl);
    const missingFields = checkRequiredFields(customFields, leadPayload);

    // When require_trustedform_cert is true, no lead reaches LeadByte without a valid cert.
    if (requireCert && !tfValid) {
      const queueReason = 'Missing or invalid TrustedForm cert';

      fireConnectors(db, apiConnectors, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
      fireDeliveries(db, allDestinations, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
      await evaluateNotifications(db, ['lead_queued'], { id: leadId, queue_reason: queueReason }, supplierAttribution, { queue_reason: queueReason });

      const mapped = await resolveResponseMapping(db, {}, { Response: 'Queued', reason: queueReason }, 'Queued');
      const queueResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'queued', lead_id: systemLeadId, lead_status: 'queued',
        code: 'MISSING_CERT', reason: mapped.response?.reason || queueReason,
        message: queueReason, Response: mapped.response?.Response || 'Queued',
      });
      await db.entities.Lead.update(leadId, {
        final_status: 'Queued',
        queue_reason: queueReason,
        trustedform_valid: false,
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(queueResponse),
      });
      return Response.json(queueResponse, { status: 200 });
    }

    // ── d2. GATE: Required custom fields ─────────────────────────────────
    if (missingFields.length > 0) {
      const queueReason = `Missing required fields: ${missingFields.join(', ')}`;
      fireConnectors(db, apiConnectors, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
      fireDeliveries(db, allDestinations, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
      await evaluateNotifications(db, ['lead_queued', 'missing_fields'], { id: leadId, queue_reason: queueReason }, supplierAttribution, { queue_reason: queueReason });

      const mapped = await resolveResponseMapping(db, {}, { Response: 'Queued', reason: queueReason }, 'Queued');
      const queueResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'queued', lead_id: systemLeadId, lead_status: 'queued',
        code: 'MISSING_FIELDS', reason: mapped.response?.reason || queueReason,
        message: queueReason, Response: mapped.response?.Response || 'Queued',
      });
      await db.entities.Lead.update(leadId, {
        final_status: 'Queued',
        queue_reason: queueReason,
        trustedform_valid: tfValid,
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(queueResponse),
      });
      return Response.json(queueResponse, { status: 200 });
    }

    await db.entities.Lead.update(leadId, { trustedform_valid: tfValid });

    // ── Fire custom lead_status triggers (e.g. "24m Lead") ─────────────
    // Any lead_status value that isn't a built-in lifecycle status fires its own
    // trigger here (after enrichment + gates), so destinations keyed to that status
    // receive the lead. Empty-trigger destinations skip this (they fire at intake).
    const leadStatusVal = enrichedData.lead_status || '';
    if (leadStatusVal && !BUILTIN_LEAD_STATUSES.includes(leadStatusVal)) {
      const customTrigger = triggerKeyForStatus(leadStatusVal);
      fireConnectors(db, apiConnectors, customTrigger, enrichedData, leadId, supplierAttribution, supplierRecord);
      if (!routeIs.event) fireDeliveries(db, allDestinations, customTrigger, enrichedData, leadId, supplierAttribution, supplierRecord);
    }

    // ── CAPTURE-ONLY: enrich + evaluate, suppress all outbound delivery ──
    // Runs before the direct/event bypass and before the no-connector error
    // check, so capture-only never returns Sold and never errors/writes an
    // ErrorLog when no default LeadByte connector exists. The lead is still
    // fully enriched and gated above. We record which destinations WOULD have
    // fired (and why), then queue the lead with no outbound call made.
    if (captureOnly) {
      const suppressed = [];

      // Same trigger/filter/condition logic as fireConnectors / fireDeliveries,
      // evaluated at the on_received trigger since that is when they would fire.
      const evalTrigger = 'on_received';
      const evalWouldFire = (conn, kind, triggers) => {
        if (conn.enabled === false) return { would_fire: false, reason: 'Connector disabled' };
        if (triggers.length > 0 && !triggers.includes(evalTrigger)) {
          return { would_fire: false, reason: `Trigger mismatch: no ${evalTrigger} trigger` };
        }
        if (triggers.length === 0 && evalTrigger !== 'on_received') {
          return { would_fire: false, reason: 'Trigger mismatch: empty triggers fire at intake only' };
        }
        if (!connectorMatchesFilters(conn, enrichedData, supplierAttribution, supplierRecord)) {
          return { would_fire: false, reason: 'Filter mismatch' };
        }
        if (!connectorMatchesConditions(conn, enrichedData)) {
          return { would_fire: false, reason: 'Condition mismatch' };
        }
        return { would_fire: true, reason: `Matched filters and ${evalTrigger} trigger` };
      };

      for (const conn of apiConnectors) {
        const res = evalWouldFire(conn, conn.kind || 'facebook_capi', parseJsonArray(conn.triggers));
        suppressed.push({ connector: conn.name, kind: conn.kind || 'facebook_capi', trigger: evalTrigger, would_fire: res.would_fire, reason: res.reason });
      }
      for (const dest of allDestinations) {
        if (dest.is_default) continue; // default connector is evaluated separately as leadbyte
        const res = evalWouldFire(dest, 'delivery', parseJsonArray(dest.triggers));
        suppressed.push({ connector: dest.api_name, kind: 'delivery', trigger: evalTrigger, would_fire: res.would_fire, reason: res.reason });
      }
      if (leadByteConnector) {
        const lbTriggers = parseJsonArray(leadByteConnector.triggers);
        const lbAllowedByTrigger = lbTriggers.length === 0 || lbTriggers.includes(evalTrigger);
        let lbWouldFire;
        let lbReason;
        if (!lbAllowedByTrigger) {
          lbWouldFire = false; lbReason = `Trigger mismatch: no ${evalTrigger} trigger`;
        } else if (!connectorMatchesFilters(leadByteConnector, enrichedData, supplierAttribution, supplierRecord)) {
          lbWouldFire = false; lbReason = 'Filter mismatch';
        } else if (!connectorMatchesConditions(leadByteConnector, enrichedData)) {
          lbWouldFire = false; lbReason = 'Condition mismatch';
        } else {
          lbWouldFire = true; lbReason = `Matched filters and ${evalTrigger} trigger`;
        }
        suppressed.push({ connector: leadByteConnector.api_name || leadByteConnector.name || 'LeadByte', kind: 'leadbyte', trigger: evalTrigger, would_fire: lbWouldFire, reason: lbReason });
      }

      const captureReason = 'Captured for testing. Outbound delivery intentionally suppressed.';
      const suppressedJson = JSON.stringify(suppressed);
      const captureResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'queued',
        code: 'CAPTURE_ONLY', reason: captureReason,
        message: 'Lead captured. No downstream delivery was attempted.', Response: 'Queued',
      });
      await db.entities.Lead.update(leadId, {
        final_status: 'Queued',
        queue_reason_code: 'CAPTURE_ONLY',
        queue_reason: captureReason,
        suppressed_deliveries: suppressedJson,
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(captureResponse),
      });
      return Response.json(captureResponse, { status: 200 });
    }

    // ── e. ROUTE: direct / event bypass LeadByte ────────────────────────
    // The lead is not forwarded to LeadByte, so no sale has occurred. It is
    // reported as Qualified (not Sold) with no revenue. Connectors and
    // Conversion Events still fire where their own filters/conditions match,
    // but are passed the real lead payload, never a fabricated sold outcome.
    // standard (native distribution) and gateway (LeadByte) are the two selling
    // routes, and both continue past this point to be sold.
    if (!routeIs.standard && !routeIs.gateway) {
      fireConnectors(db, apiConnectors, 'on_sold', leadPayload, leadId, supplierAttribution, supplierRecord);
      if (!routeIs.event) {
        fireDeliveries(db, allDestinations, 'on_sold', leadPayload, leadId, supplierAttribution, supplierRecord);
      }
      const qualifiedResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'qualified',
        sold: false, code: 'QUALIFIED', reason: null,
        message: 'Lead qualified', Response: 'Qualified',
      });
      await db.entities.Lead.update(leadId, {
        final_status: 'Qualified',
        revenue_source: 'direct_route',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(qualifiedResponse),
      });
      return Response.json(qualifiedResponse, { status: 200 });
    }

    // ── e. FORWARD TO LEADBYTE (standard route) ────────────────────────
    if (!leadByteConnector) {
      const noConnResponse = buildEnvelope(traceId, {
        ok: false, acceptance: 'error', lead_id: systemLeadId, lead_status: 'error',
        code: 'LB_ERROR', reason: 'No active LeadByte connector configured',
        message: 'No active LeadByte connector configured', Response: 'Error',
      });
      const noConnStatus = String(enrichedData.lead_status || leadPayload.lead_status || '').trim();
      const noConnFinalStatus = {
        Qualified: 'Sold', Disqualified: 'Disqualified', Sold: 'Sold',
        Unsold: 'Unsold', Rejected: 'Unsold', Duplicate: 'Duplicate',
        Duplicates: 'Duplicate', Queued: 'Queued',
      }[noConnStatus] || 'Queued';
      await db.entities.Lead.update(leadId, {
        final_status: noConnFinalStatus,
        delivery_error: 'No active LeadByte connector configured',
        error_stage: 'leadbyte',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(noConnResponse),
      });
      await db.entities.ErrorLog.create({
        lead_id: leadId, stage: 'leadbyte', severity: 'info',
        message: 'No active LeadByte connector configured',
        supplier_name: supplierAttribution,
      });
      return Response.json(noConnResponse, { status: 200 });
    }

    // ── GATE: LeadByte connector triggers ─────────────────────────────
    // Only forward to LeadByte if the lead's effective trigger (derived from
    // lead_status) matches the default connector's triggers. Empty triggers =
    // fire on every lead. A pre-classified non-Qualified lead (e.g. Disqualified)
    // is never sent to LeadByte - it fires the matching trigger instead.
    {
      const lbTriggers = parseJsonArray(leadByteConnector.triggers);
      const effStatus = String(enrichedData.lead_status || leadPayload.lead_status || '').trim();
      const effTrigger = effStatus ? triggerKeyForStatus(effStatus) : 'on_received';
      const allowLeadByte = lbTriggers.length === 0 || lbTriggers.includes(effTrigger);
      if (!allowLeadByte) {
        const notEligibleReason = `Lead status "${effStatus}" not eligible for LeadByte`;
        const skipResponse = buildEnvelope(traceId, {
          ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'unsold',
          code: 'NOT_ELIGIBLE', reason: notEligibleReason,
          message: notEligibleReason, Response: 'Unsold',
        });
        if (effTrigger !== 'on_received') {
          fireConnectors(db, apiConnectors, effTrigger, enrichedData, leadId, supplierAttribution, supplierRecord);
          if (!routeIs.event) fireDeliveries(db, allDestinations, effTrigger, enrichedData, leadId, supplierAttribution, supplierRecord);
        }
        const finalForStatus = {
          Disqualified: 'Disqualified', Sold: 'Sold', Unsold: 'Unsold',
          Rejected: 'Unsold', Duplicates: 'Duplicate', Queued: 'Queued',
        }[effStatus] || 'Unsold';
        await db.entities.Lead.update(leadId, {
          final_status: finalForStatus,
          queue_reason: finalForStatus === 'Queued' ? notEligibleReason : '',
          processed_at: new Date().toISOString(),
          process_time_ms: Date.now() - startTime,
          response_returned: JSON.stringify(skipResponse),
        });
        return Response.json(skipResponse, { status: 200 });
      }
    }

    // Check LeadByte connector filters - route to DQ destinations instead of dropping
    if (!connectorMatchesFilters(leadByteConnector, enrichedData, supplierAttribution, supplierRecord) ||
        !connectorMatchesConditions(leadByteConnector, enrichedData)) {
      const filterDqReason = 'Did not match LeadByte filters - routed to DQ destinations';
      const skipResponse = buildEnvelope(traceId, {
        ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'disqualified',
        code: 'FILTER_DQ', reason: filterDqReason,
        message: filterDqReason, Response: 'Unsold',
      });
      // Fire Disqualified then Unsold triggers so these leads still reach their destinations
      fireConnectors(db, apiConnectors, 'on_dq', enrichedData, leadId, supplierAttribution, supplierRecord);
      fireDeliveries(db, allDestinations, 'on_dq', enrichedData, leadId, supplierAttribution, supplierRecord);
      fireConnectors(db, apiConnectors, 'on_unsold', enrichedData, leadId, supplierAttribution, supplierRecord);
      fireDeliveries(db, allDestinations, 'on_unsold', enrichedData, leadId, supplierAttribution, supplierRecord);
      await db.entities.Lead.update(leadId, {
        final_status: 'Disqualified',
        queue_reason: 'Did not match LeadByte filters - routed to DQ destinations',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(skipResponse),
      });
      return Response.json(skipResponse, { status: 200 });
    }

    // ── e2. NATIVE DISTRIBUTION (ADDITIVE, mode-gated) ──────────────────
    // Past shadow, the canonical engine sells the lead itself instead of handing
    // it to LeadByte. legacy_only and shadow never enter this block, so current
    // production behaviour is unchanged until the mode is moved through the
    // audited distributionSetMode function.
    //
    // DOUBLE-SEND SAFETY (the whole point of this block): a lead the engine
    // delivered, or MIGHT have delivered, always returns from inside here and
    // never reaches the LeadByte post below. Only a provably clean non-delivery
    // falls through, and only in new_primary_with_legacy_fallback.
    // ROUTE GATE: only the standard route distributes natively. A gateway lead is
    // explicitly asking for the legacy LeadByte path and must never be sold here,
    // in any mode, or the same lead could be sold twice across the two systems.
    if (routeIs.standard && (distributionMode === 'canary'
      || distributionMode === 'new_primary_with_legacy_fallback'
      || distributionMode === 'new_only')) {
      let nativeRun = null;
      let resolvedCampaignId = null;
      try {
        const leadDist = await import('./routingEngine.generated.js');
        const plan = leadDist.planExecution(distributionMode, enrichedData, {
          canaryAllowlist: parseCanaryAllowlist(appSettings),
        });
        if (plan.native === 'deliver') {
          // Resolve which campaign this lead belongs to. A posted campaign_id wins;
          // otherwise the lead's vertical picks the campaign, since a campaign IS
          // a vertical. Resolution never throws and never guesses: an unmatched
          // lead resolves to null and simply finds no route config.
          const activeCampaigns = await db.entities.Campaign.filter({ active: true }, 'sort_order', 200, 0);
          const campaignMatch = leadDist.resolveCampaign(enrichedData, activeCampaigns || []);
          resolvedCampaignId = campaignMatch.campaignId;
          // Stamp the resolved campaign for reporting, whether or not it sold.
          await db.entities.Lead.update(leadId, { campaign_id: resolvedCampaignId || '' }).catch(() => {});
          if (!resolvedCampaignId) {
            await db.entities.ErrorLog.create({
              lead_id: leadId, stage: 'distribution', severity: 'info',
              message: 'No campaign resolved for native distribution',
              detail: String(campaignMatch.reason || '').slice(0, 300),
              supplier_name: supplierAttribution,
            }).catch(() => {});
          }
          nativeRun = await leadDist.runDistribution(db, {
            distributionMode,
            leadId,
            campaignId: resolvedCampaignId,
            idempotencyKey: String(systemLeadId),
            leadData: enrichedData,
            nowMs: Date.now(),
            resolveCredential: (ref) => resolveSubDeliveryCredential(db, ref),
          });
        }
      } catch (nativeErr) {
        // Engine load or orchestration failure. runDistribution catches its own
        // send failures, so reaching here means nothing was posted: clean.
        nativeRun = null;
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'distribution', severity: 'error',
          message: 'Native distribution failed to run; falling back to legacy path',
          detail: String((nativeErr && nativeErr.message) || nativeErr).slice(0, 500),
          supplier_name: supplierAttribution,
        }).catch(() => {});
      }

      if (nativeRun && nativeRun.ran) {
        const nativeStatus = nativeRun.status;
        const legacyOff = distributionMode !== 'new_primary_with_legacy_fallback';
        const finishNative = async (finalStatusStr, envelope, extra = {}) => {
          await db.entities.Lead.update(leadId, {
            final_status: finalStatusStr,
            processed_at: new Date().toISOString(),
            process_time_ms: Date.now() - startTime,
            response_returned: JSON.stringify(envelope),
            ...extra,
          });
          return Response.json(envelope, { status: 200 });
        };

        if (nativeStatus === 'accepted') {
          capturedRevenue = Number(nativeRun.revenue) || 0;
          const soldEnvelope = buildEnvelope(traceId, {
            ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'sold',
            sold: true, revenue: capturedRevenue, code: 'SOLD',
            message: 'Sold', Response: 'Sold',
          });
          if (exposeRevenueFor(apiKeyRecord, supplierRecord)) {
            soldEnvelope.revenue_exposed = capturedRevenue.toFixed(2);
          }
          const soldData = { ...enrichedData, revenue: capturedRevenue };
          fireConnectors(db, apiConnectors, 'on_sold', soldData, leadId, supplierAttribution, supplierRecord);
          fireDeliveries(db, allDestinations, 'on_sold', soldData, leadId, supplierAttribution, supplierRecord);
          return await finishNative('Sold', soldEnvelope, {
            revenue: capturedRevenue, revenue_source: 'direct_route',
            buyer_id: nativeRun.buyerId || '',
          });
        }

        if (nativeStatus === 'duplicate') {
          const dupEnvelope = buildEnvelope(traceId, {
            ok: true, acceptance: 'duplicate', lead_id: systemLeadId, lead_status: 'duplicate',
            code: 'DUPLICATE', reason: 'Buyer reported duplicate',
            message: 'Duplicate', Response: 'Duplicate',
          });
          fireConnectors(db, apiConnectors, 'on_duplicates', enrichedData, leadId, supplierAttribution, supplierRecord);
          fireDeliveries(db, allDestinations, 'on_duplicates', enrichedData, leadId, supplierAttribution, supplierRecord);
          return await finishNative('Duplicate', dupEnvelope, {
            queue_reason: 'Duplicate reported by buyer during native distribution',
          });
        }

        if (nativeStatus === 'ambiguous') {
          // A timeout or aborted request MIGHT have been received by the buyer.
          // Re-sending through LeadByte could sell the same lead twice, so this
          // always stops here and is queued for an operator, in every mode.
          const ambigEnvelope = buildEnvelope(traceId, {
            ok: true, acceptance: 'queued', lead_id: systemLeadId, lead_status: 'queued',
            code: 'DELIVERY_AMBIGUOUS', reason: 'Delivery outcome unconfirmed',
            message: 'Queued for review', Response: 'Unsold',
          });
          fireConnectors(db, apiConnectors, 'on_queued', enrichedData, leadId, supplierAttribution, supplierRecord);
          fireDeliveries(db, allDestinations, 'on_queued', enrichedData, leadId, supplierAttribution, supplierRecord);
          await evaluateNotifications(db, ['lead_queued'], { id: leadId, queue_reason: 'Ambiguous native delivery' },
            supplierAttribution, { queue_reason: 'Ambiguous native delivery' }).catch(() => {});
          return await finishNative('Queued', ambigEnvelope, {
            queue_reason: 'Native delivery outcome unconfirmed (timeout); not re-sent to avoid a double sale',
          });
        }

        if (legacyOff) {
          // Clean non-delivery with legacy switched off for this lead: unsold.
          const unsoldEnvelope = buildEnvelope(traceId, {
            ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'unsold',
            code: 'UNSOLD', reason: 'No buyer accepted the lead',
            message: 'Unsold', Response: 'Unsold',
          });
          fireConnectors(db, apiConnectors, 'on_unsold', enrichedData, leadId, supplierAttribution, supplierRecord);
          fireDeliveries(db, allDestinations, 'on_unsold', enrichedData, leadId, supplierAttribution, supplierRecord);
          return await finishNative('Unsold', unsoldEnvelope);
        }
        // else: new_primary_with_legacy_fallback and a clean miss -> fall through.
      } else if (nativeRun && !nativeRun.ran && distributionMode === 'new_only') {
        // new_only with no usable config: nothing was sent and legacy is off.
        const noCfgEnvelope = buildEnvelope(traceId, {
          ok: true, acceptance: 'accepted', lead_id: systemLeadId, lead_status: 'unsold',
          code: 'NO_ROUTE_CONFIG', reason: 'No active routing configuration',
          message: 'Unsold', Response: 'Unsold',
        });
        fireConnectors(db, apiConnectors, 'on_unsold', enrichedData, leadId, supplierAttribution, supplierRecord);
        fireDeliveries(db, allDestinations, 'on_unsold', enrichedData, leadId, supplierAttribution, supplierRecord);
        await db.entities.Lead.update(leadId, {
          final_status: 'Unsold',
          queue_reason: 'No active routing configuration for this campaign',
          processed_at: new Date().toISOString(),
          process_time_ms: Date.now() - startTime,
          response_returned: JSON.stringify(noCfgEnvelope),
        });
        return Response.json(noCfgEnvelope, { status: 200 });
      }
    }

    const leadBytePayload = await buildPayloadFromTemplate(leadByteConnector.payload_template, enrichedData);
    await db.entities.Lead.update(leadId, { leadbyte_request: JSON.stringify(leadBytePayload) });

    const headerRowsParsed = parseJsonArray(leadByteConnector.headers);
    const lbHeaders = {};
    if (Array.isArray(headerRowsParsed)) {
      headerRowsParsed.forEach(row => { if (row.key) lbHeaders[row.key] = row.value; });
    } else {
      Object.assign(lbHeaders, headerRowsParsed);
    }
    const contentType = leadByteConnector.content_type || 'application/json';
    lbHeaders['Content-Type'] = contentType;

    let lbBodyStr;
    if (contentType === 'application/x-www-form-urlencoded') {
      lbBodyStr = new URLSearchParams(typeof leadBytePayload === 'object' ? leadBytePayload : {}).toString();
    } else {
      lbBodyStr = typeof leadBytePayload === 'string' ? leadBytePayload : JSON.stringify(leadBytePayload);
    }

    const lbResp = await fetch(leadByteConnector.target_url, {
      method: leadByteConnector.http_method || 'POST',
      headers: lbHeaders, body: lbBodyStr,
    });
    const lbText = await lbResp.text();
    let lbResult;
    try { lbResult = JSON.parse(lbText); } catch { lbResult = { raw: lbText }; }
    await db.entities.Lead.update(leadId, { leadbyte_response: JSON.stringify(lbResult) });

    // ── f. PARSE LEADBYTE RESPONSE ──────────────────────────────────────
    let finalStatus = 'Error';
    let supplierResponse = { Response: 'Error', reason: 'Unexpected LeadByte response' };
    // Envelope metadata tracked alongside the legacy supplierResponse.
    let envAcceptance = 'error';
    let envLeadStatus = 'error';
    let envCode = 'LB_ERROR';
    let envSold = false;

    if (lbResult.status === 'Success' && lbResult.records && lbResult.records.length > 0) {
      const record = lbResult.records[0];
      const recordStatus = record.status;
      const recordResponse = record.response || {};
      await db.entities.Lead.update(leadId, {
        leadbyte_queue_id: record.queueId || '',
        leadbyte_record_status: recordStatus || '',
        leadbyte_lead_id: recordResponse.leadId || null,
        leadbyte_rejection_id: recordResponse.rejectionId ? String(recordResponse.rejectionId) : '',
        leadbyte_process_time: recordResponse.processTime || null,
      });

      if (recordStatus === 'Approved') {
        // ── f. Approved => Sold + FIRE ON SOLD ──────────────────────────
        finalStatus = 'Sold';
        supplierResponse = { Response: 'Sold' };
        envAcceptance = 'accepted'; envLeadStatus = 'sold'; envCode = 'SOLD'; envSold = true;

        // Capture revenue from LeadByte response: sum across ALL buyers with status "Sold"
        const buyers = recordResponse.buyers || record.buyers || lbResult.buyers || [];
        let revenueSum = 0;
        let foundSoldBuyer = false;
        for (const b of buyers) {
          if (b && typeof b.status === 'string' && b.status.toLowerCase() === 'sold') {
            foundSoldBuyer = true;
            revenueSum += Number(b.revenue) || 0;
          }
        }
        let revenueSource = 'unknown';
        if (foundSoldBuyer) {
          capturedRevenue = revenueSum;
          revenueSource = 'leadbyte_buyers';
        } else if (lbResult.revenue != null && !isNaN(Number(lbResult.revenue))) {
          capturedRevenue = Number(lbResult.revenue);
          revenueSource = 'leadbyte_root';
        } else {
          capturedRevenue = null;
          revenueSource = 'unknown';
        }
        if (capturedRevenue != null && !isNaN(capturedRevenue)) {
          await db.entities.Lead.update(leadId, { revenue: capturedRevenue, revenue_source: revenueSource });
        } else {
          await db.entities.Lead.update(leadId, { revenue_source: 'unknown' });
        }

        // Fire on_sold connectors (fire-and-forget). Inject captured revenue so
        // {{revenue}} resolves in CAPI custom_data for the Sold event.
        const soldData = { ...leadPayload, revenue: capturedRevenue != null ? capturedRevenue : 0 };
        fireConnectors(db, apiConnectors, 'on_sold', soldData, leadId, supplierAttribution, supplierRecord);
        fireDeliveries(db, allDestinations, 'on_sold', soldData, leadId, supplierAttribution, supplierRecord);
      } else if (recordStatus === 'Rejected') {
        // ── f. Rejected => check for queueable patterns ─────────────────
        const rejectionReason = recordResponse.message || recordResponse.reason || recordResponse.error || record.error || record.response_message || '';
        if (isQueueableRejection(rejectionReason)) {
          finalStatus = 'Queued';
          const queueReason = `LeadByte rejection (possible missing/invalid field): ${rejectionReason}`;
          await db.entities.Lead.update(leadId, { queue_reason: queueReason });
          supplierResponse = { Response: 'Unsold', reason: rejectionReason };
          envAcceptance = 'queued'; envLeadStatus = 'queued'; envCode = 'MISSING_FIELDS';
          // Fire on_queued connectors + evaluate rules
          fireConnectors(db, apiConnectors, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
          fireDeliveries(db, allDestinations, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
          await evaluateNotifications(db, ['lead_queued', 'missing_fields'], { id: leadId, queue_reason: queueReason }, supplierAttribution, { queue_reason: queueReason });
        } else {
          finalStatus = 'Unsold';
          supplierResponse = { Response: 'Unsold', reason: rejectionReason };
          envAcceptance = 'accepted'; envLeadStatus = 'unsold'; envCode = 'UNSOLD';
          // Fire on_unsold + on_dq connectors
          fireConnectors(db, apiConnectors, 'on_unsold', leadPayload, leadId, supplierAttribution, supplierRecord);
          fireDeliveries(db, allDestinations, 'on_unsold', leadPayload, leadId, supplierAttribution, supplierRecord);
          fireConnectors(db, apiConnectors, 'on_dq', enrichedData, leadId, supplierAttribution, supplierRecord);
          fireDeliveries(db, allDestinations, 'on_dq', enrichedData, leadId, supplierAttribution, supplierRecord);
          fireConnectors(db, apiConnectors, 'on_rejected', leadPayload, leadId, supplierAttribution, supplierRecord);
          fireDeliveries(db, allDestinations, 'on_rejected', leadPayload, leadId, supplierAttribution, supplierRecord);
        }
      } else {
        finalStatus = 'Error';
        supplierResponse = { Response: 'Error', reason: `LeadByte record status: ${recordStatus}` };
        envAcceptance = 'error'; envLeadStatus = 'error'; envCode = 'LB_ERROR';
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'leadbyte', severity: 'error',
          message: `Unexpected LeadByte record status: ${recordStatus}`,
          detail: JSON.stringify(lbResult), supplier_name: supplierAttribution,
        });
        await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution,
          { message: `Unexpected LeadByte status: ${recordStatus}` }).catch(() => {});
        fireConnectors(db, apiConnectors, 'on_error', enrichedData, leadId, supplierAttribution, supplierRecord);
        fireDeliveries(db, allDestinations, 'on_error', enrichedData, leadId, supplierAttribution, supplierRecord);
      }
    } else {
      // ── f. Top-level non-success: handle errors[] shape ──────────────
      const topStatus = lbResult.status || '';
      const errors = lbResult.errors || [];
      const firstError = errors.length > 0 ? String(errors[0]?.message || errors[0]?.error || errors[0] || '') : '';
      const lowerErr = firstError.toLowerCase();

      if (/duplicate/i.test(firstError)) {
        finalStatus = 'Duplicate';
        supplierResponse = { Response: 'Duplicate', reason: firstError };
        envAcceptance = 'duplicate'; envLeadStatus = 'duplicate'; envCode = 'DUPLICATE';
        await db.entities.Lead.update(leadId, { queue_reason: `Duplicate: ${firstError}` });
        fireConnectors(db, apiConnectors, 'on_duplicates', leadPayload, leadId, supplierAttribution, supplierRecord);
        fireDeliveries(db, allDestinations, 'on_duplicates', leadPayload, leadId, supplierAttribution, supplierRecord);
      } else if (isQueueableRejection(firstError)) {
        finalStatus = 'Queued';
        const queueReason = `LeadByte error (missing/invalid field): ${firstError || topStatus}`;
        await db.entities.Lead.update(leadId, { queue_reason: queueReason });
        supplierResponse = { Response: 'Unsold', reason: firstError || topStatus };
        envAcceptance = 'queued'; envLeadStatus = 'queued'; envCode = 'MISSING_FIELDS';
        fireConnectors(db, apiConnectors, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
        fireDeliveries(db, allDestinations, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord);
        await evaluateNotifications(db, ['lead_queued', 'missing_fields'], { id: leadId, queue_reason: queueReason }, supplierAttribution, { queue_reason: queueReason });
      } else if (isContentRejection(firstError)) {
        finalStatus = 'Disqualified';
        supplierResponse = { Response: 'Disqualified', reason: firstError };
        envAcceptance = 'accepted'; envLeadStatus = 'disqualified'; envCode = 'CONTENT_REJECTED';
        await db.entities.Lead.update(leadId, { queue_reason: `LeadByte content rejection: ${firstError}` });
        fireConnectors(db, apiConnectors, 'on_dq', enrichedData, leadId, supplierAttribution, supplierRecord);
        fireDeliveries(db, allDestinations, 'on_dq', enrichedData, leadId, supplierAttribution, supplierRecord);
      } else {
        finalStatus = 'Error';
        supplierResponse = { Response: 'Error', reason: firstError || lbResult.message || 'LeadByte returned non-success' };
        envAcceptance = 'error'; envLeadStatus = 'error'; envCode = 'LB_ERROR';
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'leadbyte', severity: 'error',
          message: firstError || lbResult.message || 'LeadByte returned non-success',
          detail: JSON.stringify(lbResult), supplier_name: supplierAttribution,
        });
        await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution,
          { message: firstError || lbResult.message || 'LeadByte returned non-success' }).catch(() => {});
        fireConnectors(db, apiConnectors, 'on_error', enrichedData, leadId, supplierAttribution, supplierRecord);
        fireDeliveries(db, allDestinations, 'on_error', enrichedData, leadId, supplierAttribution, supplierRecord);
      }
    }

    // ── g. RESOLVE SUPPLIER RESPONSE VIA RESPONSEMAPPING ─────────────────
    if (finalStatus !== 'Queued' && finalStatus !== 'Duplicate') {
      const mapped = await resolveResponseMapping(db, lbResult, supplierResponse, finalStatus);
      supplierResponse = mapped.response;
      if (mapped.status && mapped.status !== finalStatus && finalStatus === 'Error') {
        finalStatus = mapped.status;
      }
    }

    // Include revenue in the supplier response for master keys, Internal suppliers,
    // or any submitting API key with expose_revenue enabled (per-key override).
    const exposeRevenue = apiKeyRecord.type === 'master' ||
      (apiKeyRecord.type === 'supplier' && supplierRecord?.supplier_type === 'Internal') ||
      apiKeyRecord.expose_revenue === true;
    if (exposeRevenue && capturedRevenue != null && !isNaN(capturedRevenue)) {
      supplierResponse = { ...supplierResponse, revenue: capturedRevenue.toFixed(2) };
    }

    // ── Build the layered envelope from the resolved legacy response ──────
    // resolveResponseMapping may have changed the Response label and, for an
    // Error, the finalStatus. Keep envelope lead_status/acceptance in sync.
    if (finalStatus === 'Sold') { envLeadStatus = 'sold'; envAcceptance = 'accepted'; envSold = true; envCode = 'SOLD'; }
    else if (finalStatus === 'Unsold') { envLeadStatus = 'unsold'; envAcceptance = 'accepted'; if (envCode === 'LB_ERROR') envCode = 'UNSOLD'; }
    else if (finalStatus === 'Duplicate') { envLeadStatus = 'duplicate'; envAcceptance = 'duplicate'; envCode = 'DUPLICATE'; }
    else if (finalStatus === 'Queued') { envLeadStatus = 'queued'; envAcceptance = 'queued'; }
    else if (finalStatus === 'Error') { envLeadStatus = 'error'; envAcceptance = 'error'; envCode = 'LB_ERROR'; }

    const finalEnvelope = buildEnvelope(traceId, {
      ok: envAcceptance === 'accepted' || envAcceptance === 'queued' || envAcceptance === 'duplicate',
      acceptance: envAcceptance,
      lead_id: systemLeadId,
      lead_status: envLeadStatus,
      sold: envSold,
      revenue: envSold ? capturedRevenue : null,
      code: envCode,
      reason: supplierResponse.reason || null,
      message: supplierResponse.reason || supplierResponse.Response || finalStatus,
      Response: supplierResponse.Response,
    });
    // Preserve the exposed revenue string on the envelope when present.
    if (supplierResponse.revenue != null) finalEnvelope.revenue_exposed = supplierResponse.revenue;

    // ── FINALIZE ─────────────────────────────────────────────────────────
    await db.entities.Lead.update(leadId, {
      final_status: finalStatus,
      processed_at: new Date().toISOString(),
      process_time_ms: Date.now() - startTime,
      response_returned: JSON.stringify(finalEnvelope),
    });

    // Fire outbound webhooks async (non-blocking)
    try {
      const webhooks = await db.entities.Webhook.filter({ enabled: true });
      const eventName = `lead.${finalStatus.toLowerCase()}`;
      webhooks.forEach(wh => {
        const events = parseJsonArray(wh.events);
        if (events.includes(eventName)) {
          const whHeaders = typeof wh.headers === 'string' ? JSON.parse(wh.headers || '{}') : (wh.headers || {});
          whHeaders['Content-Type'] = 'application/json';
          fetch(wh.url, {
            method: 'POST', headers: whHeaders,
            body: JSON.stringify({ event: eventName, lead_id: leadId, status: finalStatus, supplier: supplierAttribution }),
          }).catch(() => {});
        }
      });
    } catch {}

    return Response.json(finalEnvelope, { status: 200 });

  } catch (err) {
    console.error('processLead uncaught error:', err);
    const errorEnvelope = buildEnvelope(traceId, {
      ok: false, acceptance: 'error', lead_id: null, lead_status: 'error',
      code: 'INTERNAL_ERROR', reason: 'Internal processing error',
      message: 'Internal processing error', Response: 'Error',
    });
    if (leadId) {
      try {
        await db.entities.Lead.update(leadId, {
          final_status: 'Error', error_stage: 'system',
          processed_at: new Date().toISOString(),
          process_time_ms: Date.now() - startTime,
          response_returned: JSON.stringify(errorEnvelope),
        });
      } catch {}
    }
    try {
      await db.entities.ErrorLog.create({
        lead_id: leadId, stage: 'system', severity: 'critical',
        message: err.message || 'Unknown error',
        detail: JSON.stringify({ stack: err.stack }),
        supplier_name: 'Unknown',
      });
    } catch {}
    return Response.json(errorEnvelope, { status: 200 });
  }
});