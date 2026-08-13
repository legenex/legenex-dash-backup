// Shared lead-status / trigger mapping used by Destinations and Conversion Events.
//
// The lead_status system CustomField defines the dropdown values that appear as
// trigger buttons. Each value maps to a trigger key stored in the connector's
// `triggers` JSON array. The 7 built-in statuses keep their existing keys for
// backward compatibility (on_received is the key for "Qualified"); any extra
// value added to lead_status gets a slug-based on_<slug> key.

export const DEFAULT_LEAD_STATUSES = [
  'Qualified',
  'Disqualified',
  'Returned',
  'Sold',
  'Unsold',
  'Rejected',
  'Duplicates',
  'Queued',
  'Error',
];

// Status triggers that always appear in the trigger picker, regardless of whether
// the lead_status system field lists them yet.
export const GUARANTEED_STATUSES = ['24m Lead'];

// Display labels for custom (non-lifecycle) trigger keys, used in list badges.
export const CUSTOM_TRIGGER_LABELS = { on_24m_lead: '24m Lead' };

// Built-in label -> trigger key (preserves existing on_received / on_dq keys).
export const STATUS_TO_TRIGGER = {
  Qualified: 'on_received',
  Sold: 'on_sold',
  Unsold: 'on_unsold',
  Disqualified: 'on_dq',
  Returned: 'on_returned',
  Queued: 'on_queued',
  Rejected: 'on_rejected',
  Duplicates: 'on_duplicates',
  Error: 'on_error',
};

export const TRIGGER_TO_STATUS = Object.fromEntries(
  Object.entries(STATUS_TO_TRIGGER).map(([s, t]) => [t, s])
);

function slug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function triggerKeyFor(statusLabel) {
  if (STATUS_TO_TRIGGER[statusLabel]) return STATUS_TO_TRIGGER[statusLabel];
  return `on_${slug(statusLabel) || 'status'}`;
}

export function statusLabelFor(triggerKey) {
  if (CUSTOM_TRIGGER_LABELS[triggerKey]) return CUSTOM_TRIGGER_LABELS[triggerKey];
  if (TRIGGER_TO_STATUS[triggerKey]) return TRIGGER_TO_STATUS[triggerKey];
  if (triggerKey && triggerKey.startsWith('on_')) {
    return triggerKey.slice(3).replace(/_/g, ' ');
  }
  return triggerKey;
}

function parseOptions(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const p = JSON.parse(val);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

// Build trigger options [{value: triggerKey, label: statusLabel}] from the
// lead_status system CustomField's options. Falls back to the built-in 7 when
// the field is not found or has no options. Built-in statuses keep their
// canonical order; any custom values are appended after.
export function buildTriggerOptions(customFields) {
  const leadStatusField = (customFields || []).find(
    (f) => f.field_name === 'lead_status'
  );
  let statuses = [];
  if (leadStatusField) {
    statuses = parseOptions(leadStatusField.options).map((o) =>
      typeof o === 'string' ? o : o.label || o.value || ''
    ).filter(Boolean);
  }
  if (statuses.length === 0) statuses = [...DEFAULT_LEAD_STATUSES];

  const ordered = [];
  for (const s of DEFAULT_LEAD_STATUSES) {
    if (statuses.includes(s)) ordered.push(s);
  }
  for (const s of statuses) {
    if (!ordered.includes(s)) ordered.push(s);
  }
  // Guarantee certain status triggers always appear, even before the lead_status
  // field is configured with them (e.g. "24m Lead").
  for (const s of GUARANTEED_STATUSES) {
    if (!ordered.includes(s)) ordered.push(s);
  }
  return ordered.map((s) => ({ value: triggerKeyFor(s), label: s }));
}