// Canonical duplicate rule for leads. One definition, used by every path that
// creates or audits leads, so "duplicate" cannot mean different things in the
// importer, an audit and the pipeline.
//
// A lead is the same lead if it shares a normalised email OR a normalised
// mobile with another. Email alone is not enough: the same person can be
// submitted twice with a typo'd address, and the same household can share an
// address but not a phone.

export function normEmail(v) {
  return String(v ?? '').trim().toLowerCase() || null;
}

// Digits only, and drop a leading US country code so +1 555... and 555...
// resolve to the same person.
export function normMobile(v) {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const trimmed = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return trimmed.length >= 7 ? trimmed : null;
}

// An index of what already exists, for O(1) lookups during an import.
export function buildDedupeIndex(leads = []) {
  const emails = new Map();
  const mobiles = new Map();
  for (const l of leads) {
    const e = normEmail(l.email);
    if (e && !emails.has(e)) emails.set(e, l);
    const m = normMobile(l.mobile);
    if (m && !mobiles.has(m)) mobiles.set(m, l);
  }
  return { emails, mobiles };
}

// The existing lead this record would duplicate, or null.
export function findExisting(index, record) {
  const e = normEmail(record?.email);
  if (e && index.emails.has(e)) return index.emails.get(e);
  const m = normMobile(record?.mobile);
  if (m && index.mobiles.has(m)) return index.mobiles.get(m);
  return null;
}

// Split incoming records into what is new, what already exists, and what
// repeats within the file itself.
//
// Both are reported separately because they mean different things: a collision
// with the database usually means the import is being re-run, while a
// collision inside one file usually means the export itself is dirty.
export function partitionImport(records = [], existingLeads = []) {
  const index = buildDedupeIndex(existingLeads);
  const seen = { emails: new Map(), mobiles: new Map() };

  const fresh = [];
  const existingDupes = [];
  const intraFileDupes = [];

  for (const r of records) {
    const match = findExisting(index, r);
    if (match) {
      existingDupes.push({ record: r, existing: match });
      continue;
    }
    const e = normEmail(r.email);
    const m = normMobile(r.mobile);
    if ((e && seen.emails.has(e)) || (m && seen.mobiles.has(m))) {
      intraFileDupes.push({ record: r, existing: (e && seen.emails.get(e)) || (m && seen.mobiles.get(m)) });
      continue;
    }
    if (e) seen.emails.set(e, r);
    if (m) seen.mobiles.set(m, r);
    fresh.push(r);
  }

  return { fresh, existingDupes, intraFileDupes };
}

// Group already-stored leads by duplicate key so an audit can find records that
// should never have been written. Returns only groups with more than one member,
// oldest first, so the first entry is the one worth keeping.
export function findDuplicateGroups(leads = []) {
  const byKey = new Map();
  for (const l of leads) {
    const key = normEmail(l.email) || normMobile(l.mobile);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(l);
  }
  const groups = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')));
    groups.push({ key, keep: sorted[0], remove: sorted.slice(1) });
  }
  return groups.sort((a, b) => b.remove.length - a.remove.length);
}
