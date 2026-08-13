// Pure helpers for the tiered pricing editor. No entity access. The tier_rules
// shape matches the SupplierSource entity: an array of { conditions, price },
// where each condition is { field, operator, value } using the same operator
// set as LeadByteConnector filter_conditions. Rules evaluate top down and the
// first match wins. This mirrors how a later payout build will read them, so
// the preview here is faithful.

// Evaluate one condition against a flat sample object.
export function evalCondition(cond, sample) {
  const raw = sample[cond.field];
  const actual = raw == null ? '' : String(raw);
  const expected = cond.value == null ? '' : String(cond.value);
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  switch (cond.operator) {
    case 'equals': return a === e;
    case 'not_equals': return a !== e;
    case 'contains': return a.includes(e);
    case 'not_contains': return !a.includes(e);
    case 'starts_with': return a.startsWith(e);
    case 'ends_with': return a.endsWith(e);
    case 'is_empty': return actual.trim() === '';
    case 'is_not_empty': return actual.trim() !== '';
    case 'gt': return Number(actual) > Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    default: return false;
  }
}

// A rule matches when all of its conditions match. A rule with no conditions is
// an unconditional catch all and always matches.
export function ruleMatches(rule, sample) {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (conditions.length === 0) return true;
  return conditions.every((c) => c.field && evalCondition(c, sample));
}

// Index of the first matching rule, or -1 if none match.
export function firstMatchIndex(rules, sample) {
  for (let i = 0; i < rules.length; i++) {
    if (ruleMatches(rules[i], sample)) return i;
  }
  return -1;
}

// True when the last rule is an unconditional catch all (no conditions). When
// false, some leads can fall through and price at zero.
export function hasCatchAll(rules) {
  if (!rules.length) return false;
  const last = rules[rules.length - 1];
  const conditions = Array.isArray(last.conditions) ? last.conditions : [];
  return conditions.length === 0;
}

export function parseRules(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}