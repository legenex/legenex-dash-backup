// Shared readers and formatters for CallRecord.
//
// Calls are their own record, not leads, so they get their own equivalents of
// leadEventInstant / final_status rather than being forced through the lead
// helpers. Everything the Calls section derives from a raw row lives here so
// the nav badges, the table, the stats strip and any future report all answer
// the same question the same way.

// The call's real event time. call_at comes from the sheet's timestamp column;
// created_date is the fallback for rows written before a timestamp was mapped.
export function callEventInstant(call) {
  const raw = call?.call_at || call?.created_date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Disposition text that means the buyer declined the call. The sheet returns
// free text, so this reads the two disposition columns rather than an enum.
function hasDisposition(call) {
  const main = String(call?.disposition || '').trim();
  const list = String(call?.dispositions || '').trim();
  return !!(main || list);
}

// The call's commercial outcome.
//
// call_status is authoritative once ingestion sets it. Until then this derives
// an outcome from the sheet's own columns so the Converted and Rejected tabs
// are not empty on rows imported before the field existed:
//   qualified            -> Converted
//   any disposition text -> Rejected (the buyer gave a reason for declining)
//   closed call state    -> Rejected
//   otherwise            -> Pending
export function callStatusOf(call) {
  const explicit = String(call?.call_status || '').trim();
  if (explicit) return explicit;
  if (call?.qualified) return 'Converted';
  if (hasDisposition(call)) return 'Rejected';
  if (/^closed$/i.test(String(call?.inquiry_status || '').trim())) return 'Rejected';
  return 'Pending';
}

// Which sub-view a call belongs to. Mirrors matchesView in LeadsTable.
export function matchesCallView(call, view) {
  switch (view) {
    case 'all': return true;
    case 'converted': return callStatusOf(call) === 'Converted';
    case 'rejected': return callStatusOf(call) === 'Rejected';
    default: return true;
  }
}

export function fmtCallMoney(n) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Seconds to a compact m ss, or h mm ss once past an hour.
export function fmtDuration(seconds) {
  const secs = Math.max(0, Math.round(Number(seconds) || 0));
  if (!secs) return '-';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

// Yes / No / blank for the sheet's boolean-ish columns.
export function fmtFlag(v) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  if (v == null || v === '') return '-';
  return String(v);
}

// The supplier label shown wherever a call is listed.
export function callSupplierLabel(call) {
  if (call?.supplier_name) return call.supplier_name;
  return null;
}

// Read a value out of the operator-mapped custom_fields bag by key alias.
export function callCustomField(call, key) {
  let bag = {};
  try { bag = JSON.parse(call?.custom_fields || '{}'); } catch { bag = {}; }
  const lower = String(key).toLowerCase();
  for (const [k, v] of Object.entries(bag)) {
    if (String(k).toLowerCase() === lower && v != null && v !== '') return v;
  }
  return null;
}

// Free-text search across the fields an operator would actually type.
export function matchesCallSearch(call, q) {
  const query = String(q || '').toLowerCase();
  if (!query) return true;
  return [
    call?.first_name, call?.last_name, call?.mobile, call?.mobile_raw, call?.caller_id,
    call?.call_id, call?.supplier_name, call?.sid, call?.ssid, call?.buyer_code,
    call?.campaign_name, call?.disposition,
  ].filter(Boolean).some((v) => String(v).toLowerCase().includes(query));
}
