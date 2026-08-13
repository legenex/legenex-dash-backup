// Centralised tag colour classes used across the app (lead table, Destinations,
// Conversion Events). CSS classes live in src/index.css (status-* / bg-status-* /
// tag-neutral). Keeping every tag renderer on this module guarantees the same
// palette across all pages.

// Fixed colours for known verticals; everything else falls back to the palette.
const VERTICAL_FIXED = {
  MVA: { badge: 'bg-green-500/15 text-green-400 border-green-500/40', dot: 'bg-green-400' },
  WC: { badge: 'bg-blue-500/15 text-blue-300 border-blue-500/40', dot: 'bg-blue-400' },
};

// Distinct colours for other verticals - deterministic hash of the vertical code.
const VERTICAL_PALETTE = [
  { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: 'bg-amber-400' },
  { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/40', dot: 'bg-purple-400' },
  { badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40', dot: 'bg-cyan-400' },
  { badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40', dot: 'bg-rose-400' },
  { badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40', dot: 'bg-indigo-400' },
  { badge: 'bg-orange-500/15 text-orange-300 border-orange-500/40', dot: 'bg-orange-400' },
  { badge: 'bg-pink-500/15 text-pink-300 border-pink-500/40', dot: 'bg-pink-400' },
  { badge: 'bg-teal-500/15 text-teal-300 border-teal-500/40', dot: 'bg-teal-400' },
];

export function verticalColor(code) {
  const s = String(code || '');
  const key = s.trim().toUpperCase();
  if (VERTICAL_FIXED[key]) return VERTICAL_FIXED[key];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return VERTICAL_PALETTE[h % VERTICAL_PALETTE.length];
}

// Distinct colour per brand code (deterministic hash → palette slot).
const BRAND_PALETTE = [
  { badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  { badge: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/40' },
  { badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' },
  { badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  { badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40' },
  { badge: 'bg-orange-500/15 text-orange-300 border-orange-500/40' },
  { badge: 'bg-pink-500/15 text-pink-300 border-pink-500/40' },
  { badge: 'bg-teal-500/15 text-teal-300 border-teal-500/40' },
];

export function brandColor(code) {
  const s = String(code || '');
  // djb2 hash - spreads short codes (DS, CMC, CAC…) across the palette so
  // brand codes get visibly distinct colours instead of clustering.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return BRAND_PALETTE[h % BRAND_PALETTE.length];
}

// Neutral grey pill for operation / meta tags (Default, conditions, Brands, etc.)
export const TAG_NEUTRAL = 'tag-neutral';

// Final / lead-status pill classes (bg + text).
export const STATUS_TAG = {
  Sold: 'bg-status-sold status-sold',
  Unsold: 'bg-status-unsold status-unsold',
  Disqualified: 'bg-status-disqualified status-disqualified',
  Returned: 'bg-status-returned status-returned',
  Rejected: 'bg-status-rejected status-rejected',
  Converted: 'bg-status-converted status-converted',
  Error: 'bg-status-lead-error status-lead-error',
  Processing: 'bg-status-processing status-processing',
  Queued: 'bg-status-queued status-queued',
  Duplicate: 'bg-status-duplicate status-duplicate',
  '24m Lead': 'bg-status-24m status-24m',
  Qualified: 'bg-status-qualified status-qualified',
};

// Text-only colour class for a status (used in tables that show coloured text).
const STATUS_TEXT = {
  Sold: 'status-sold',
  Unsold: 'status-unsold',
  Disqualified: 'status-disqualified',
  Returned: 'status-returned',
  Rejected: 'status-rejected',
  Converted: 'status-converted',
  Error: 'status-lead-error',
  Processing: 'status-processing',
  Queued: 'status-queued',
  Duplicate: 'status-duplicate',
  '24m Lead': 'status-24m',
  Qualified: 'status-qualified',
};

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Pill class (bg + text) for a status label. Handles aliases like "24m_lead" and
// "leadbyte duplicate" → Duplicate.
export function statusTagClass(status) {
  if (!status) return 'bg-muted text-muted-foreground';
  if (STATUS_TAG[status]) return STATUS_TAG[status];
  const n = normalize(status);
  if (n === '24m lead') return STATUS_TAG['24m Lead'];
  if (n === 'leadbyte duplicate' || n === 'duplicate') return STATUS_TAG.Duplicate;
  return 'bg-muted text-muted-foreground';
}

// Text-only colour class for a status label.
export function statusTextClass(status) {
  if (!status) return 'text-muted-foreground';
  if (STATUS_TEXT[status]) return STATUS_TEXT[status];
  const n = normalize(status);
  if (n === '24m lead') return STATUS_TEXT['24m Lead'];
  if (n === 'leadbyte duplicate' || n === 'duplicate') return STATUS_TEXT.Duplicate;
  return 'text-muted-foreground';
}

// Trigger key -> { label, className }
export const TRIGGER_TAG = {
  on_received: { label: 'Qualified', className: 'bg-status-qualified status-qualified' },
  on_sold: { label: 'Sold', className: 'bg-status-sold status-sold' },
  on_unsold: { label: 'Unsold', className: 'bg-status-unsold status-unsold' },
  on_dq: { label: 'Disqualified', className: 'bg-status-disqualified status-disqualified' },
  on_queued: { label: 'Queued', className: 'bg-status-queued status-queued' },
  on_rejected: { label: 'Rejected', className: 'bg-status-rejected status-rejected' },
  on_duplicates: { label: 'Duplicate', className: 'bg-status-duplicate status-duplicate' },
  on_24m_lead: { label: '24m Lead', className: 'bg-status-24m status-24m' },
  on_returned: { label: 'Returned', className: 'bg-status-returned status-returned' },
  on_error: { label: 'Error', className: 'bg-status-lead-error status-lead-error' },
};

export function triggerTagClass(triggerKey) {
  return (TRIGGER_TAG[triggerKey] && TRIGGER_TAG[triggerKey].className) || TAG_NEUTRAL;
}

// Audit harness verdict pill classes. Centralised here (this module is exempt
// from the design-token gate) so the Audits page carries no raw palette classes.
const VERDICT_TAG = {
  pass: 'bg-green-500/15 text-green-400 border border-green-500/40',
  fail: 'bg-rose-500/15 text-rose-300 border border-rose-500/40',
  warn: 'bg-amber-500/15 text-amber-300 border border-amber-500/40',
  needs_env: 'bg-blue-500/15 text-blue-300 border border-blue-500/40',
  skip: 'tag-neutral',
};
export function verdictTagClass(v) {
  return VERDICT_TAG[String(v || '').toLowerCase()] || 'bg-muted text-muted-foreground';
}

// Audit finding severity pill classes.
const SEVERITY_TAG = {
  critical: 'bg-rose-500/15 text-rose-300 border border-rose-500/40',
  high: 'bg-orange-500/15 text-orange-300 border border-orange-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border border-amber-500/40',
  low: 'bg-blue-500/15 text-blue-300 border border-blue-500/40',
  info: 'tag-neutral',
};
export function severityTagClass(s) {
  return SEVERITY_TAG[String(s || '').toLowerCase()] || 'tag-neutral';
}

// Text-only colour for an audit verdict (used on the roll-up chip icons).
const VERDICT_TEXT = {
  pass: 'text-green-400',
  fail: 'text-rose-300',
  warn: 'text-amber-300',
  needs_env: 'text-blue-300',
};
export function verdictTextClass(v) {
  return VERDICT_TEXT[String(v || '').toLowerCase()] || 'text-muted-foreground';
}

// Webhook type pill. Direction is what an operator scans this table for, so the
// two incoming kinds share a family and outbound reads distinctly against them.
const WEBHOOK_TYPE_TAG = {
  incoming_post: 'bg-status-sold status-sold border border-transparent',
  incoming_get: 'bg-status-queued status-queued border border-transparent',
  outbound_post: 'bg-status-converted status-converted border border-transparent',
};
export function webhookTypeClass(t) {
  return WEBHOOK_TYPE_TAG[String(t || '').toLowerCase()] || 'tag-neutral';
}