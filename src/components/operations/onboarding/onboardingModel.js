// Shared model helpers for the Buyer Onboarding console. Pure functions only,
// no entity writes. Mirrors the canonical step order and skip/idempotency
// semantics of the onboardBuyer function without duplicating its logic.

// Canonical ordered step list, matching onboardBuyer STEP_ORDER exactly.
export const STEP_ORDER = [
  'validate',
  'create_buyer',
  'allocate_code',
  'xero_contact',
  'stripe_customer',
  'deposit_invoice',
  'xero_invoice',
  'payment_link',
  'leadbyte_buyer',
  'dispo_scope',
  'onboarding_email',
  'crm_contact',
  'schedule_intro_email',
];

// Human readable step names. No em dashes.
export const STEP_LABELS = {
  validate: 'Validate submission',
  create_buyer: 'Create buyer',
  allocate_code: 'Allocate buyer code',
  xero_contact: 'Xero contact',
  stripe_customer: 'Stripe customer',
  deposit_invoice: 'Deposit invoice',
  xero_invoice: 'Xero sales invoice',
  payment_link: 'Payment link',
  leadbyte_buyer: 'LeadByte buyer',
  dispo_scope: 'Disposition scope',
  onboarding_email: 'Onboarding email',
  crm_contact: 'CRM contact',
  schedule_intro_email: 'Schedule intro email',
};

// The status filter tabs, in display order.
export const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'complete', label: 'Complete' },
  { key: 'cancelled', label: 'Cancelled' },
];

// Parse the steps JSON off a record into a normalised array in canonical order.
// Every step key is present so the rail always renders the full chain.
export function parseSteps(record) {
  let raw = [];
  try {
    raw = typeof record?.steps === 'string' ? JSON.parse(record.steps || '[]') : (record?.steps || []);
  } catch { raw = []; }
  const byKey = {};
  for (const s of Array.isArray(raw) ? raw : []) {
    if (s && s.key) byKey[s.key] = s;
  }
  return STEP_ORDER.map((key) => {
    const prior = byKey[key] || {};
    return {
      key,
      status: prior.status || 'pending',
      attempts: Number(prior.attempts) || 0,
      error: prior.error ?? null,
      external_id: prior.external_id ?? null,
      hosted_invoice_url: prior.hosted_invoice_url ?? null,
      completed_at: prior.completed_at ?? null,
    };
  });
}

// Parse the raw form payload into an object.
export function parsePayload(record) {
  try {
    return typeof record?.form_payload === 'string'
      ? JSON.parse(record.form_payload || '{}')
      : (record?.form_payload || {});
  } catch { return {}; }
}

// Count steps that are done (complete or skipped both count as done).
export function stepsCompleteCount(steps) {
  return steps.filter((s) => s.status === 'complete' || s.status === 'skipped').length;
}

// A fraction like "7 of 13".
export function stepsFraction(steps) {
  return `${stepsCompleteCount(steps)} of ${steps.length}`;
}

// The first failed step, or null.
export function firstFailedStep(steps) {
  return steps.find((s) => s.status === 'failed') || null;
}

// Summary tile counts derived purely from the records.
export function summaryCounts(records) {
  const counts = { submitted: 0, in_progress: 0, blocked: 0, complete: 0 };
  for (const r of records) {
    if (r.status === 'submitted') counts.submitted += 1;
    else if (r.status === 'in_progress') counts.in_progress += 1;
    else if (r.status === 'blocked') counts.blocked += 1;
    else if (r.status === 'complete') counts.complete += 1;
  }
  return counts;
}

// Per-tab record counts.
export function tabCounts(records) {
  const counts = { all: records.length };
  for (const t of STATUS_TABS) {
    if (t.key === 'all') continue;
    counts[t.key] = records.filter((r) => r.status === t.key).length;
  }
  return counts;
}