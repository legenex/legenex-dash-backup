import { base44 } from '@/api/base44Client';

// Thin wrapper around the generateBillingRun backend function. Never computes a
// billable figure in the browser; every number here comes from the function.
// commit defaults to false so a preview writes nothing.
export async function runBillingPreview({ scope, buyerId, supplierId, periodStart, periodEnd, commit = false }) {
  const res = await base44.functions.invoke('generateBillingRun', {
    scope,
    buyer_id: buyerId || null,
    supplier_id: supplierId || null,
    period_start: periodStart,
    period_end: periodEnd,
    commit,
  });
  return res.data;
}

// Format a Date as a YYYY-MM-DD string in the app operating timezone (America/
// Regina, UTC-6 no DST). The backend interprets these boundaries in the same
// zone, so we must not use the browser's local calendar day.
export function toReginaDateString(date) {
  // Shift the instant by -6h then read its UTC calendar parts.
  const shifted = new Date(date.getTime() - 6 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Money formatter using the app mono face is applied at the render site; this
// only produces the numeric string. Returns null for non-finite input so the
// caller can render no value rather than a zero.
export function money(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function integer(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n)).toLocaleString('en-US');
}