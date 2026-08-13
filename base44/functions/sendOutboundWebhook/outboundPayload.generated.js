// GENERATED FILE - DO NOT EDIT BY HAND.
// Source of truth: src/lib/outboundPayload.js
// Regenerate: node scripts/generate-outbound-payload.mjs
// canonical-outbound-payload-sha256: 91c19939b1d330f4c565333d03d80eddff51567b9a0671583a226ba7932b3162
// Outbound webhook payload building and filtering.
//
// Canonical module: the dispatcher runs this server side, and the builder UI
// runs the SAME code to show a live preview. If the preview and the send ever
// disagreed, an operator would sign off on a body that is not the one that
// actually leaves, which is the whole point of a preview.
//
// NO IMPORTS: this is copied verbatim into the function folder by
// scripts/generate-outbound-payload.mjs. Keep it that way.

export const OUTBOUND_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
];

export const PAYLOAD_SOURCES = [
  { value: 'field', label: 'Record field' },
  { value: 'custom_field', label: 'Custom field' },
  { value: 'static', label: 'Static value' },
];

function safeParseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object');
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter((x) => x && typeof x === 'object') : [];
  } catch {
    return [];
  }
}

export const parseFilters = safeParseArray;
export const parsePayloadFields = safeParseArray;

export function safeParseObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

// Read a value off the record, falling back to its custom_fields bag. Matching
// is loose on case and separators so a field named supplier_sid still resolves
// when the record spells it supplierSid.
export function readRecordField(record, field) {
  if (!record || !field) return undefined;
  if (record[field] !== undefined && record[field] !== null && record[field] !== '') return record[field];

  const want = String(field).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [k, v] of Object.entries(record)) {
    if (k === 'custom_fields') continue;
    if (v === undefined || v === null || v === '') continue;
    if (String(k).toLowerCase().replace(/[^a-z0-9]/g, '') === want) return v;
  }

  const bag = safeParseObject(record.custom_fields);
  for (const [k, v] of Object.entries(bag)) {
    if (v === undefined || v === null || v === '') continue;
    if (String(k).toLowerCase().replace(/[^a-z0-9]/g, '') === want) return v;
  }
  return undefined;
}

export function matchesOutboundFilter(record, filter) {
  if (!filter || !filter.field) return true;
  const raw = readRecordField(record, filter.field);
  const actual = String(raw ?? '').trim().toLowerCase();
  const target = String(filter.value ?? '').trim().toLowerCase();
  switch (String(filter.operator || 'equals')) {
    case 'equals': return actual === target;
    case 'not_equals': return actual !== target;
    case 'contains': return target !== '' && actual.includes(target);
    case 'not_contains': return target !== '' && !actual.includes(target);
    case 'starts_with': return target !== '' && actual.startsWith(target);
    case 'ends_with': return target !== '' && actual.endsWith(target);
    case 'is_empty': return actual === '';
    case 'is_not_empty': return actual !== '';
    case 'gt': return Number(raw) > Number(filter.value);
    case 'lt': return Number(raw) < Number(filter.value);
    default: return false;
  }
}

// Every filter must pass. An empty filter list fires on every trigger, which is
// the least surprising reading of "no filters".
export function passesFilters(record, filters) {
  const list = parseFilters(filters);
  return list.every((f) => matchesOutboundFilter(record, f));
}

// Substitute {{field}} placeholders against the record. An unresolved
// placeholder becomes an empty string rather than being left literal, so a
// receiver never gets the string "{{email}}" in a field it will store.
export function fillTemplate(template, record) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const v = readRecordField(record, key);
    return v === undefined || v === null ? '' : String(v);
  });
}

// Build the request body.
//
// Keys with no resolvable value are OMITTED rather than sent as null, because a
// receiver that treats null as "clear this field" would wipe good data on the
// far side. A static value is always sent as written.
export function buildPayload(webhook, record) {
  if (String(webhook?.payload_mode || 'builder') === 'template') {
    const filled = fillTemplate(webhook?.payload_template, record);
    try {
      return { ok: true, body: JSON.parse(filled), raw: filled };
    } catch (e) {
      return { ok: false, error: `Template is not valid JSON after substitution: ${(e && e.message) || 'parse error'}`, raw: filled };
    }
  }

  const body = {};
  for (const row of parsePayloadFields(webhook?.payload_fields)) {
    const key = String(row.key || '').trim();
    if (!key) continue;
    if (row.source === 'static') {
      body[key] = row.value ?? '';
      continue;
    }
    const v = readRecordField(record, row.value);
    if (v === undefined || v === null || v === '') continue;
    body[key] = v;
  }
  return { ok: true, body, raw: JSON.stringify(body, null, 2) };
}

export function emptyPayloadRow() {
  return { key: '', source: 'field', value: '' };
}

export function emptyOutboundFilter() {
  return { field: '', operator: 'equals', value: '' };
}
