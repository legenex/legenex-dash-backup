// GENERATED FILE - DO NOT EDIT BY HAND.
// Source of truth: src/lib/supplierRules.js
// Regenerate: node scripts/generate-supplier-rules.mjs
// canonical-supplier-rules-sha256: 75865deab6f5c30d0e1db9e92914cca313798a51d22fd4c5b7b7423a47dd4d6e
// Canonical supplier attribution rules.
//
// A call platform names the traffic its own way. Ringba reports a `publisher`
// like CHECK-A-CASE-MVA and a `publisherSubId` like CAC-MVA; a buyer's report
// names the same traffic something else again. Neither is our sid. These rules
// are the operator's translation table: match a value on the incoming record,
// and write our sid, ssid and supplier name.
//
// Used by two callers that must never disagree:
//   base44/functions/pullCallLogs   the Ringba pull
//   base44/functions/syncGoogleSheets   the inbound-calls and attribution sheets
//
// This module has NO imports so it can be copied verbatim into a function
// folder by scripts/generate-supplier-rules.mjs. Keep it that way.

export const RULE_OPERATORS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
];

const NO_VALUE_OPERATORS = ['is_empty', 'is_not_empty'];

export function ruleOperatorNeedsValue(operator) {
  return !NO_VALUE_OPERATORS.includes(String(operator || ''));
}

// Rules are stored as a JSON string on the source record. Anything unparseable
// is treated as no rules rather than throwing, because a bad rule set must
// never take an ingestion run down: it degrades to leaving calls unattributed,
// which is visible and recoverable.
export function parseSupplierRules(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === 'object');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r === 'object') : [];
  } catch {
    return [];
  }
}

// Read a field off the incoming record, tolerating the casing and underscore
// differences between a Ringba API key (publisherSubId) and a sheet header
// (Publisher Sub Id).
function readField(record, field) {
  if (!record || !field) return '';
  if (record[field] != null && record[field] !== '') return String(record[field]);
  const want = String(field).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [k, v] of Object.entries(record)) {
    if (v == null || v === '') continue;
    if (String(k).toLowerCase().replace(/[^a-z0-9]/g, '') === want) return String(v);
  }
  return '';
}

export function ruleMatches(record, rule) {
  if (!rule || !rule.field) return false;
  const actual = readField(record, rule.field).trim().toLowerCase();
  const target = String(rule.value ?? '').trim().toLowerCase();
  switch (String(rule.operator || 'contains')) {
    case 'equals': return actual === target;
    case 'contains': return target !== '' && actual.includes(target);
    case 'starts_with': return target !== '' && actual.startsWith(target);
    case 'ends_with': return target !== '' && actual.endsWith(target);
    case 'not_contains': return target !== '' && !actual.includes(target);
    case 'is_empty': return actual === '';
    case 'is_not_empty': return actual !== '';
    default: return false;
  }
}

// Resolve supplier attribution for one incoming record.
//
// First matching rule wins, so order is the operator's priority: put the
// narrow rules above the broad ones. A rule that matches but sets nothing is
// still a match, which is how an operator deliberately says "this traffic is
// known and is nobody's", rather than it silently falling through to a later
// rule that would guess wrong.
//
// No match leaves the call unattributed on purpose. Guessing a supplier here
// would put money against the wrong account, and unattributed is both visible
// in the Calls sub-nav and fixable later by the buyer's own report.
export function resolveSupplier(record, rules) {
  const list = parseSupplierRules(rules);
  for (let i = 0; i < list.length; i += 1) {
    const rule = list[i];
    if (!ruleMatches(record, rule)) continue;
    return {
      matched: true,
      rule_index: i,
      sid: rule.sid ? String(rule.sid).trim() : '',
      ssid: rule.ssid ? String(rule.ssid).trim() : '',
      supplier_name: rule.supplier_name ? String(rule.supplier_name).trim() : '',
    };
  }
  return { matched: false, rule_index: -1, sid: '', ssid: '', supplier_name: '' };
}

// Apply a resolution onto a record patch without clobbering values that are
// already known. An explicit value on the row always beats a rule, because the
// row is the primary source and the rules are a fallback translation.
export function applySupplierResolution(current, resolved) {
  const out = {};
  const keep = (v) => v != null && String(v).trim() !== '';
  if (!keep(current?.sid) && resolved.sid) out.sid = resolved.sid;
  if (!keep(current?.ssid) && resolved.ssid) out.ssid = resolved.ssid;
  if (!keep(current?.supplier_name) && resolved.supplier_name) out.supplier_name = resolved.supplier_name;
  return out;
}

// A blank rule for the editor's Add button.
export function emptySupplierRule() {
  return { field: 'publisher', operator: 'contains', value: '', sid: '', ssid: '', supplier_name: '' };
}
