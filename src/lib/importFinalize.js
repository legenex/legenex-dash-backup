// Materialization for imported leads. CSV imports historically stored every
// value inside the mapped_fields JSON string and left final_status at the
// schema default "Processing". This module promotes mapped values onto the
// top-level Lead columns the app reads, derives lead_type when missing, and
// guarantees an imported lead never remains "Processing" (Processing is a
// live-pipeline transit state, not a valid imported outcome).
//
// Used in two places:
// 1. CsvImporter calls materializeRecord() at commit time so every future
//    import is written complete in one pass.
// 2. finalizePendingImports() repairs existing imported leads in place using
//    the operator's session (same write path as the lead detail modal).

// Map arbitrary status text onto the Lead final_status enum. Imported leads
// never resolve to Processing: unknown, blank, "new" and "processing" all
// land on Qualified, which is the neutral accepted state.
const STATUS_LOOKUP = {
  sold: 'Sold',
  unsold: 'Unsold', rejected: 'Unsold', reject: 'Unsold',
  qualified: 'Qualified',
  disqualified: 'Disqualified', dq: 'Disqualified',
  duplicate: 'Duplicate', dupe: 'Duplicate', dup: 'Duplicate', duplicates: 'Duplicate',
  error: 'Error', err: 'Error',
  queued: 'Queued', queue: 'Queued',
  returned: 'Returned', return: 'Returned',
};
export const normalizeImportStatus = (raw) =>
  STATUS_LOOKUP[String(raw ?? '').trim().toLowerCase()] || 'Qualified';

const clean = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-' || s.toLowerCase() === 'none') return null;
  return s;
};

const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Derive lead_type when the payload did not carry one. Per Nick's rule on
// 20 Jul 2026: our own quiz funnels (sid LEADFLOW or LGNX) are 'Quiz'; every
// other supplier (INBNDS and any future affiliate) is 'Affiliate'.
export function deriveLeadType(mapped) {
  const existing = clean(mapped.lead_type);
  if (existing) return existing;
  const sid = String(mapped.sid || '').trim().toUpperCase();
  if (sid === 'LEADFLOW' || sid === 'LGNX') return 'Quiz';
  return 'Affiliate';
}

// Build the top-level patch for one lead from its mapped fields. Only fills
// gaps: an already-populated top-level value is never overwritten. Returns
// null when nothing needs to change.
export function buildFinalizePatch(lead) {
  let mapped = {};
  try { mapped = JSON.parse(lead.mapped_fields || '{}') || {}; } catch { mapped = {}; }
  const patch = {};

  if (!lead.final_status || lead.final_status === 'Processing') {
    patch.final_status = normalizeImportStatus(mapped.lead_status);
  }
  if (!clean(lead.lead_vertical) && clean(mapped.vertical)) patch.lead_vertical = clean(mapped.vertical);
  if (!clean(lead.buyer_name) && (clean(mapped.buyer_name) || clean(mapped.buyer))) {
    patch.buyer_name = clean(mapped.buyer_name) || clean(mapped.buyer);
  }
  if (!clean(lead.buyer_id) && clean(mapped.buyer_id)) patch.buyer_id = clean(mapped.buyer_id);
  if (!clean(lead.buyer_feedback) && clean(mapped.buyer_feedback)) patch.buyer_feedback = clean(mapped.buyer_feedback);
  if (lead.buyer_returned !== true && String(mapped.returned || '').trim().toLowerCase() === 'yes') {
    patch.buyer_returned = true;
  }
  if (!clean(lead.buyer_return_reason) && clean(mapped.returned_reason)) {
    patch.buyer_return_reason = clean(mapped.returned_reason);
  }
  if (lead.supplier_payout == null && num(mapped.supplier_payout) != null) {
    patch.supplier_payout = num(mapped.supplier_payout);
  }
  if ((lead.revenue == null || lead.revenue === 0) && num(mapped.revenue ?? mapped.cpl) != null) {
    const r = num(mapped.revenue ?? mapped.cpl);
    if (r > 0) patch.revenue = r;
  }
  if (!clean(lead.email_valid)) {
    const ev = clean(mapped.email_valid);
    if (ev === 'Yes' || ev === 'No') patch.email_valid = ev;
  }

  // lead_type lives inside mapped_fields (the table reads it from there).
  const derived = deriveLeadType(mapped);
  if (derived && !clean(mapped.lead_type)) {
    patch.mapped_fields = JSON.stringify({ ...mapped, lead_type: derived });
  }

  return Object.keys(patch).length ? patch : null;
}

// Commit-time variant for CsvImporter: mutates the outgoing record and its
// mapped object before creation so new imports are complete in one pass.
export function materializeRecord(out, mapped) {
  const fake = {
    final_status: out.final_status,
    lead_vertical: out.lead_vertical,
    buyer_name: out.buyer_name,
    buyer_id: out.buyer_id,
    buyer_feedback: out.buyer_feedback,
    buyer_returned: out.buyer_returned,
    buyer_return_reason: out.buyer_return_reason,
    supplier_payout: out.supplier_payout,
    revenue: out.revenue != null ? Number(out.revenue) : null,
    email_valid: out.email_valid,
    mapped_fields: JSON.stringify(mapped),
  };
  const patch = buildFinalizePatch(fake) || {};
  const { mapped_fields: patchedMapped, ...rest } = patch;
  Object.assign(out, rest);
  if (patchedMapped) {
    try { Object.assign(mapped, JSON.parse(patchedMapped)); } catch { /* keep original */ }
  }
  // Imported leads must never be created as Processing.
  if (!out.final_status || out.final_status === 'Processing') out.final_status = 'Qualified';
  return out;
}

// Repair every imported lead still sitting in Processing, or a single batch
// when batchId is given. Pages through records and updates them one by one
// with the operator session. Reports progress via onProgress(done, total).
export async function finalizePendingImports(base44, { batchId = null, onProgress = () => {} } = {}) {
  const filter = batchId
    ? { import_batch_id: batchId }
    : { final_status: 'Processing' };
  const pageSize = 200;
  const targets = [];
  let page = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await base44.entities.Lead.filter(filter, '-created_date', pageSize, page * pageSize);
    // Only imported records: live leads pass through Processing legitimately.
    batch.forEach(l => { if (l.import_batch_id) targets.push(l); });
    if (batch.length < pageSize) break;
    page += 1;
  }
  let done = 0;
  let updated = 0;
  for (const lead of targets) {
    const patch = buildFinalizePatch(lead);
    if (patch) {
      await base44.entities.Lead.update(lead.id, patch);
      updated += 1;
    }
    done += 1;
    if (done % 10 === 0 || done === targets.length) onProgress(done, targets.length);
  }
  return { scanned: targets.length, updated };
}
