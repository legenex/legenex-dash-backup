// Pure condition/operator evaluator for routing filters and qualification rules.
// Mirrors the {field, operator, value} + AND/OR tree shape already used across the
// codebase (BuyerCplRule.conditions, SupplierSource.tier_rules, connector filters)
// so operator config maps cleanly. No I/O; `nowMs` is passed for date operators.

export const OPERATORS = [
  'equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in',
  'gt', 'gte', 'lt', 'lte', 'between', 'matches', 'exists', 'not_exists', 'within_months',
];

function asNumber(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : NaN;
}
function asString(v) {
  return String(v ?? '').trim().toLowerCase();
}
function asList(v) {
  if (Array.isArray(v)) return v.map(asString);
  return asString(v).split(',').map((s) => s.trim()).filter(Boolean);
}
function asDateMs(v) {
  if (v == null || v === '') return NaN;
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
}

// Evaluate a single {field, operator, value} leaf against `data`.
export function evalLeaf(leaf, data, ctx = {}) {
  const raw = (data || {})[leaf.field];
  const val = leaf.value;
  switch (leaf.operator) {
    case 'exists':
      return raw !== undefined && raw !== null && String(raw).trim() !== '';
    case 'not_exists':
      return raw === undefined || raw === null || String(raw).trim() === '';
    case 'equals':
      return asString(raw) === asString(val);
    case 'not_equals':
      return asString(raw) !== asString(val);
    case 'contains':
      return asString(raw).includes(asString(val));
    case 'not_contains':
      return !asString(raw).includes(asString(val));
    case 'in':
      return asList(val).includes(asString(raw));
    case 'not_in':
      return !asList(val).includes(asString(raw));
    case 'gt': return asNumber(raw) > asNumber(val);
    case 'gte': return asNumber(raw) >= asNumber(val);
    case 'lt': return asNumber(raw) < asNumber(val);
    case 'lte': return asNumber(raw) <= asNumber(val);
    case 'between': {
      const [lo, hi] = Array.isArray(val) ? val : asList(val);
      const n = asNumber(raw);
      return n >= asNumber(lo) && n <= asNumber(hi);
    }
    case 'matches': {
      try { return new RegExp(String(val), 'i').test(String(raw ?? '')); }
      catch { return false; }
    }
    case 'within_months': {
      const t = asDateMs(raw);
      if (Number.isNaN(t) || ctx.nowMs == null) return false;
      const months = asNumber(val);
      const cutoff = ctx.nowMs - months * 30 * 86400000; // approximate month window
      return t >= cutoff && t <= ctx.nowMs;
    }
    default:
      return false;
  }
}

// Evaluate an AND/OR tree. A node is either { op:'and'|'or', children:[...] } or
// a leaf { field, operator, value }. Empty/absent tree = true (no restriction).
export function evalConditionTree(node, data, ctx = {}) {
  if (!node) return true;
  if (Array.isArray(node)) return node.every((c) => evalConditionTree(c, data, ctx)); // implicit AND
  if (node.op === 'and') return (node.children || []).every((c) => evalConditionTree(c, data, ctx));
  if (node.op === 'or') return (node.children || []).some((c) => evalConditionTree(c, data, ctx));
  if (node.field && node.operator) return evalLeaf(node, data, ctx);
  return true;
}
