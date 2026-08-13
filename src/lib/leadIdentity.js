// Canonical lead identity normalization and duplicate precedence.
//
// This is the single source of truth for how a lead's identity fields are
// standardised on write and how two records competing for the same identity
// are resolved. It is consumed by:
//   - processLead (intake normalization)
//   - leadbyteWebhook (outcome matching)
//   - leadDedupe (backfill and merge)
//   - the frontend (mobile display formatting)
//
// It deliberately has ZERO imports so it can be copied verbatim into a Base44
// Deno function folder by scripts/generate-lead-identity.mjs. Do not add an
// import to this file.

// Values that suppliers send to mean "nothing". Treated as absent so they never
// become a match key and never collide with each other.
const PLACEHOLDERS = new Set([
  '', '-', '--', 'n/a', 'na', 'null', 'none', 'nil', 'undefined', 'unknown',
  'test', 'no email', 'noemail', 'not provided', '0',
]);

function isPlaceholder(raw) {
  return PLACEHOLDERS.has(String(raw ?? '').trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

// Lowercase, trimmed, mailto: stripped. Returns null when the value is absent,
// a placeholder, or not shaped like an address. Null means "do not use this as
// a match key", which is what stops every junk record matching every other.
export function normalizeEmail(raw) {
  if (isPlaceholder(raw)) return null;
  let v = String(raw ?? '').trim().toLowerCase();
  if (v.startsWith('mailto:')) v = v.slice(7);
  v = v.replace(/\s+/g, '');
  // Deliberately permissive: one @, something either side, a dot in the domain.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return null;
  return v;
}

// ---------------------------------------------------------------------------
// Mobile
// ---------------------------------------------------------------------------

// Reduce any US number to its bare 10 significant digits. Accepts every shape
// suppliers actually send: +13022030000, 13022030000, 3022030000,
// "+1 (302) 203-0000", "(302) 203-0000", "302.203.0000".
// Returns null if it cannot be resolved to a valid 10-digit US number, so a
// truncated or junk number never becomes a match key.
export function normalizeMobileUs(raw) {
  if (isPlaceholder(raw)) return null;
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return null;
  // NANP: area code and exchange both start 2-9. Rejects 0000000000 and friends.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  return d;
}

// Canonical stored form: E.164.
export function toE164Us(raw) {
  const d = normalizeMobileUs(raw);
  return d ? `+1${d}` : null;
}

// Display form: (302) 203-0000. Falls back to the raw value when the number
// cannot be normalized, so an unparseable number is still visible to an
// operator rather than silently rendering as a dash.
export function formatMobileUs(raw) {
  const d = normalizeMobileUs(raw);
  if (!d) return String(raw ?? '').trim() || null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// Title Case that survives real names: hyphens, apostrophes, Mc/Mac, and
// existing internal capitals are respected rather than flattened.
export function titleCaseName(raw) {
  if (isPlaceholder(raw)) return null;
  const v = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!v) return null;
  return v
    .split(' ')
    .map((word) =>
      word
        .split(/([-'\u2019])/)
        .map((part) => {
          if (part.length === 0 || /^[-'\u2019]$/.test(part)) return part;
          const lower = part.toLowerCase();
          if (/^mc[a-z]{2,}$/.test(lower)) {
            return 'Mc' + lower.charAt(2).toUpperCase() + lower.slice(3);
          }
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(''),
    )
    .join(' ');
}

// ---------------------------------------------------------------------------
// Status precedence
// ---------------------------------------------------------------------------

// Lower index wins. The first eight are the operator-defined order. The
// remainder are in-flight or error states that must never outrank a real
// outcome, so they sit below the explicit list.
export const STATUS_PRECEDENCE = [
  'Converted',
  'Sold',
  'Returned',
  'Unsold',
  'Disqualified',
  'Rejected',
  'Duplicate',
  'Qualified',
  'Fake',
  'Queued',
  'Processing',
  'Error',
];

const RANK = new Map(STATUS_PRECEDENCE.map((s, i) => [s.toLowerCase(), i]));

// Unknown statuses rank last rather than first, so a typo can never win.
export function statusRank(status) {
  const r = RANK.get(String(status ?? '').trim().toLowerCase());
  return r === undefined ? STATUS_PRECEDENCE.length : r;
}

// True when `candidate` is a strictly better outcome than `current`.
export function outranks(candidate, current) {
  return statusRank(candidate) < statusRank(current);
}

// ---------------------------------------------------------------------------
// Identity keys
// ---------------------------------------------------------------------------

// The normalized fields written alongside every lead. Either may be null; a
// lead with both null has no usable identity and is never auto-merged.
export function identityKeys(lead) {
  return {
    email_normalized: normalizeEmail(lead?.email),
    mobile_normalized: normalizeMobileUs(lead?.mobile),
  };
}

// Decide which of two records for the same identity survives.
// Precedence first, then captured revenue, then the older record (it is the
// original intake and carries the quiz/source provenance).
export function pickWinner(a, b) {
  const ra = statusRank(a?.final_status);
  const rb = statusRank(b?.final_status);
  if (ra !== rb) return ra < rb ? a : b;

  const va = Number(a?.revenue) || 0;
  const vb = Number(b?.revenue) || 0;
  if (va !== vb) return va > vb ? a : b;

  const ta = Date.parse(a?.created_date ?? '') || 0;
  const tb = Date.parse(b?.created_date ?? '') || 0;
  if (ta && tb && ta !== tb) return ta < tb ? a : b;

  return a;
}
