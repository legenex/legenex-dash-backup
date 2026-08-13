import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, Sparkles, Check, ArrowRight, Save, Copy, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { toZonedTime } from 'date-fns-tz';
import { partitionImport, buildDedupeIndex, findExisting } from '@/lib/leadDedupe';
import { APP_TZ } from '@/lib/periodRange';
import { invalidateLeadCaches } from '@/lib/leadCaches';
import { materializeRecord, finalizePendingImports } from '@/lib/importFinalize';

// Core target fields per entity. Custom fields (for leads) are appended at runtime.
const LEAD_FIELDS = ['first_name', 'last_name', 'email', 'mobile', 'supplier_name', 'revenue', 'conv_value', 'final_status', 'email_valid'];
const BANK_FIELDS = ['date', 'description', 'amount', 'category', 'external_id'];
const IGNORE = '__ignore__';

// Map arbitrary incoming status text to the exact Lead final_status enum.
const STATUS_LOOKUP = {
  sold: 'Sold',
  unsold: 'Unsold', rejected: 'Unsold', reject: 'Unsold',
  disqualified: 'Disqualified', dq: 'Disqualified',
  duplicate: 'Duplicate', dupe: 'Duplicate', dup: 'Duplicate',
  error: 'Error', err: 'Error',
  queued: 'Queued', queue: 'Queued',
  returned: 'Returned', return: 'Returned',
  // Processing is a live-pipeline transit state, never an imported outcome:
  // anything unknown or transit-like lands on Qualified.
  processing: 'Qualified', new: 'Qualified',
};
const normalizeStatus = (raw) => STATUS_LOOKUP[String(raw ?? '').trim().toLowerCase()] || 'Qualified';
const normEmail = (v) => String(v ?? '').trim().toLowerCase();
const normMobile = (v) => String(v ?? '').replace(/\D/g, '');

// ---- Buyer disposition detection --------------------------------------------

// The set of values a buyer disposition column may hold (case-insensitive).
const BUYER_DISPO_VALUES = new Set(['sold', 'unsold', 'returned']);

// A source column is a buyer disposition column when it has at least one
// non-empty value and every non-empty value is within Sold/Unsold/Returned.
const detectBuyerColumns = (rows, cols) => cols.filter((col) => {
  let anyValue = false;
  for (const r of rows) {
    const raw = r?.[col];
    if (raw == null) continue;
    const s = String(raw).trim();
    if (s === '') continue;
    anyValue = true;
    if (!BUYER_DISPO_VALUES.has(s.toLowerCase())) return false;
  }
  return anyValue;
});

// Title-case a disposition value back onto the Lead final_status enum.
const dispoToStatus = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'sold') return 'Sold';
  if (s === 'unsold') return 'Unsold';
  if (s === 'returned') return 'Returned';
  return null;
};

// Resolve a row's status by precedence across every buyer column, not by
// column order: Sold outranks Returned, which outranks Unsold. A row can hold
// both a Sold and a Returned (ping tree), and must resolve to Sold since the
// lead was ultimately bought. No buyer disposition at all resolves to Unsold.
const deriveFinalStatus = (row, buyerCols) => {
  let sawReturned = false;
  for (const col of buyerCols) {
    const status = dispoToStatus(row?.[col]);
    if (status === 'Sold') return 'Sold';
    if (status === 'Returned') sawReturned = true;
  }
  return sawReturned ? 'Returned' : 'Unsold';
};

// ---- Timestamp normalization ------------------------------------------------

// Split a raw slash date's first two numeric components, or null when the
// value is not a slash date. Used only for date-order detection.
const slashParts = (raw) => {
  const m = String(raw ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
};

// Detect day-first vs month-first across the whole mapped timestamp column.
// Returns 'day' | 'month' | 'ambiguous'.
const detectDateOrder = (values) => {
  let sawSecondOver12 = false;
  for (const v of values) {
    const p = slashParts(v);
    if (!p) continue;
    if (p.a > 12) return 'day';
    if (p.b > 12) sawSecondOver12 = true;
  }
  return sawSecondOver12 ? 'month' : 'ambiguous';
};

const pad2 = (n) => String(n).padStart(2, '0');

// Convert a raw timestamp value to canonical naive 'YYYY-MM-DD HH:MM:SS' in
// APP_TZ wall-clock time. Returns null when it cannot be parsed. `order` is
// 'day' or 'month' and only affects slash dates. A value carrying an explicit
// Z / UTC offset is an absolute instant and is converted to APP_TZ wall-clock.
const normalizeTimestamp = (raw, order) => {
  const s = String(raw ?? '').trim();
  if (s === '') return null;

  const fmt = (y, mo, d, h, mi, sec) =>
    `${y}-${pad2(mo)}-${pad2(d)} ${pad2(h)}:${pad2(mi)}:${pad2(sec)}`;

  // Absolute instant with an explicit offset or Z -> convert to APP_TZ wall time.
  const hasOffset = /[zZ]$/.test(s) || /\d{2}:\d{2}(:\d{2})?\s*[+-]\d{2}:?\d{2}$/.test(s);
  if (hasOffset) {
    const inst = new Date(s.replace(' ', 'T'));
    if (Number.isNaN(inst.getTime())) return null;
    const wall = toZonedTime(inst, APP_TZ);
    return fmt(wall.getFullYear(), wall.getMonth() + 1, wall.getDate(), wall.getHours(), wall.getMinutes(), wall.getSeconds());
  }

  // ISO-like naive: YYYY-MM-DD [HH:MM[:SS]]
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoM) {
    const [, y, mo, d, h, mi, sec] = isoM;
    return fmt(Number(y), Number(mo), Number(d), Number(h || 0), Number(mi || 0), Number(sec || 0));
  }

  // Slash date: DD/MM/YYYY or MM/DD/YYYY per `order`, optional time.
  const slashM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slashM) {
    const [, p1, p2, y, h, mi, sec] = slashM;
    const day = order === 'month' ? Number(p2) : Number(p1);
    const mon = order === 'month' ? Number(p1) : Number(p2);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return fmt(Number(y), mon, day, Number(h || 0), Number(mi || 0), Number(sec || 0));
  }

  return null;
};

// ---- Deterministic auto-mapping helpers -------------------------------------

// Lowercase and strip everything except a-z0-9 so "First Name", "first_name"
// and "FirstName" all collapse to the same key.
const normKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Source columns whose normalized key means "lead status / disposition" always
// map to final_status (the field that drives Sold/Unsold/Disqualified), never
// to a lead_status custom field.
const STATUS_COLUMN_KEYS = new Set([
  'leadstatus', 'status', 'disposition', 'dispo', 'leaddisposition', 'outcome', 'result', 'finalstatus',
]);

// Synonyms / abbreviations -> target field_name. Keys are normalized.
const SYNONYMS = {
  phone: 'mobile', tel: 'mobile', telephone: 'mobile', cell: 'mobile', cellphone: 'mobile', phonenumber: 'mobile',
  fname: 'first_name', first: 'first_name', givenname: 'first_name',
  lname: 'last_name', surname: 'last_name', last: 'last_name',
  email: 'email', mail: 'email', emailaddress: 'email',
  postal: 'zip', postcode: 'zip', postalcode: 'zip', zipcode: 'zip',
  rev: 'revenue', amount: 'revenue',
};

// Dice coefficient on character bigrams -> similarity ratio 0..1.
const diceCoefficient = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const aB = bigrams(a);
  const bB = bigrams(b);
  let overlap = 0;
  let total = 0;
  aB.forEach((count, g) => { total += count; });
  bB.forEach((count, g) => {
    total += count;
    const inA = aB.get(g) || 0;
    if (inA > 0) overlap += Math.min(inA, count);
  });
  return (2 * overlap) / total;
};

// Layered matcher: decides one source column, stopping at the first hit.
// entries: [{ field, keys: [normKey(field_name), normKey(label)] }]. Returns a
// target field_name or null when nothing confident matched (leave as Ignore).
const matchColumn = (col, entries) => {
  const key = normKey(col);
  if (!key) return null;

  // 1. Status override.
  if (STATUS_COLUMN_KEYS.has(key)) {
    return entries.some(e => e.field === 'final_status') ? 'final_status' : null;
  }

  const byKey = new Map();
  entries.forEach(e => e.keys.forEach(k => { if (k && !byKey.has(k)) byKey.set(k, e.field); }));

  // 2. Normalized exact match against field_name or label.
  if (byKey.has(key)) return byKey.get(key);

  // 3. Synonym / abbreviation dictionary (only if the target field exists).
  const syn = SYNONYMS[key];
  if (syn && entries.some(e => e.field === syn)) return syn;

  // 4. Fuzzy similarity, accept only above ~0.82.
  let best = null;
  let bestScore = 0;
  byKey.forEach((field, k) => {
    const score = diceCoefficient(key, k);
    if (score > bestScore) { bestScore = score; best = field; }
  });
  return bestScore >= 0.82 ? best : null;
};

export default function CsvImporter() {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [target, setTarget] = useState('lead');
  const [step, setStep] = useState('upload'); // upload | review
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } while lead import runs
  const [finalizing, setFinalizing] = useState(null); // { done, total } while the repair pass runs
  const [backfilling, setBackfilling] = useState(false); // lead_type backfill in flight

  // One-tap lead_type backfill. Calls the deployed backfillLeadType function
  // which runs server-side against the live DB: sid LEADFLOW/LGNX -> Quiz, every
  // other supplier -> Affiliate. Idempotent, so it is safe to press again.
  const runLeadTypeBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await base44.functions.invoke('backfillLeadType', {
        mode: 'apply',
        confirm: 'YES_BACKFILL_LEAD_TYPE',
      });
      const data = res?.data ?? res;
      const updated = data?.updated ?? 0;
      const q = data?.set_breakdown?.Quiz ?? 0;
      const a = data?.set_breakdown?.Affiliate ?? 0;
      toast.success(`Lead type set on ${updated} leads (${q} Quiz, ${a} Affiliate)`);
      invalidateLeadCaches(qc);
    } catch (err) {
      toast.error('Lead type backfill failed. It is safe to try again.');
    } finally {
      setBackfilling(false);
    }
  };

  // Repair pass for already-imported leads: promotes mapped_fields values onto
  // top-level columns, fills lead_type, and clears Processing statuses.
  const runFinalizePending = async () => {
    setFinalizing({ done: 0, total: 0 });
    try {
      const res = await finalizePendingImports(base44, {
        onProgress: (done, total) => setFinalizing({ done, total }),
      });
      toast.success(`Finalized ${res.updated} of ${res.scanned} imported leads`);
      invalidateLeadCaches(qc);
    } catch (err) {
      toast.error('Finalize failed partway. Run it again to continue where it stopped.');
    } finally {
      setFinalizing(null);
    }
  };
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [templateName, setTemplateName] = useState('');
  const [dupChecking, setDupChecking] = useState(false);
  const [dupResult, setDupResult] = useState(null); // { newCount, dupCount }
  // Duplicate decision for the current import. The prompt holds the partitioned
  // records; the ref carries the operator's choice back into the import run
  // without waiting on a state flush.
  const [dupPrompt, setDupPrompt] = useState(null);
  const dupChoiceRef = useRef(null);
  const [dateOrder, setDateOrder] = useState('day'); // 'day' | 'month', user-overridable
  const [detectedOrder, setDetectedOrder] = useState('ambiguous'); // 'day' | 'month' | 'ambiguous'

  const { data: customFields = [] } = useQuery({ queryKey: ['custom-fields'], queryFn: () => base44.entities.CustomField.list('sort_order') });
  const { data: templates = [] } = useQuery({ queryKey: ['import-templates'], queryFn: () => base44.entities.ImportTemplate.list('-created_date') });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });

  // Lookup from normalized (trimmed, lowercased) Supplier.sid -> Supplier.name.
  // Billing and the supplier portal both match on exact Supplier.name, so the
  // resolved value must always be the name, never the raw sid.
  const sidToName = React.useMemo(() => {
    const m = new Map();
    suppliers.forEach((s) => {
      const sid = String(s?.sid ?? '').trim().toLowerCase();
      if (sid && s?.name) m.set(sid, s.name);
    });
    return m;
  }, [suppliers]);
  // Lookup from normalized Supplier.name -> canonical Supplier.name, so a value
  // that is already a supplier name (not a sid) still resolves to the canonical
  // casing that billing and the supplier portal match on.
  const nameToName = React.useMemo(() => {
    const m = new Map();
    suppliers.forEach((s) => {
      const name = String(s?.name ?? '').trim().toLowerCase();
      if (name) m.set(name, s.name);
    });
    return m;
  }, [suppliers]);
  // Try each candidate in order (sid first). A candidate resolves when it
  // matches a Supplier.sid or a Supplier.name; always returns the canonical
  // Supplier.name, never a raw sid. Falls back to 'CSV Import' when none match.
  const resolveSupplierName = (...candidates) => {
    for (const raw of candidates) {
      const key = String(raw ?? '').trim().toLowerCase();
      if (!key) continue;
      const bySid = sidToName.get(key);
      if (bySid) return bySid;
      const byName = nameToName.get(key);
      if (byName) return byName;
    }
    return 'CSV Import';
  };

  const targetFields = target === 'lead'
    ? [...LEAD_FIELDS, ...customFields.map(f => f.field_name).filter(n => n && !LEAD_FIELDS.includes(n))]
    : BANK_FIELDS;

  // Matcher entries: each target field plus the normalized keys to match on
  // (field_name, and the custom field label when present).
  const fieldEntries = targetFields.map(f => {
    const cf = customFields.find(c => c.field_name === f);
    const keys = [normKey(f)];
    if (cf?.label) keys.push(normKey(cf.label));
    return { field: f, keys };
  });

  const reset = () => { setStep('upload'); setRows([]); setColumns([]); setMapping({}); setTemplateName(''); setDupResult(null); if (fileRef.current) fileRef.current.value = ''; };

  // First few non-empty sample values for a source column.
  const sampleValues = (col, max = 3) => {
    const out = [];
    for (const r of rows) {
      const v = r?.[col];
      if (v != null && String(v).trim() !== '') out.push(String(v).trim());
      if (out.length >= max) break;
    }
    return out;
  };

  // Which target fields are currently mapped.
  const mappedFields = new Set(Object.values(mapping).filter(f => f && f !== IGNORE));
  // Required-field validation. Returns a list of human-readable missing requirements.
  const missingRequired = (() => {
    if (target === 'lead') {
      return mappedFields.has('email') || mappedFields.has('mobile') ? [] : ['email or mobile'];
    }
    const miss = [];
    if (!mappedFields.has('date')) miss.push('date');
    if (!mappedFields.has('amount')) miss.push('amount');
    return miss;
  })();

  // Source column that maps to a given target field (or null). The sid and
  // timestamp custom fields land in the mapped object, so we read their source
  // columns by looking up which column maps onto them.
  const columnFor = (field) => Object.entries(mapping).find(([, f]) => f === field)?.[0] || null;
  const sidColumn = columnFor('sid');
  const supplierNameColumn = columnFor('supplier_name');
  const timestampColumn = columnFor('timestamp');

  // Buyer disposition columns detected by value across all source columns.
  const buyerColumns = React.useMemo(
    () => (target === 'lead' ? detectBuyerColumns(rows, columns) : []),
    [target, rows, columns],
  );

  // Detect the timestamp column's date order once and seed the toggle. Runs
  // whenever the chosen timestamp column changes.
  useEffect(() => {
    if (!timestampColumn) { setDetectedOrder('ambiguous'); setDateOrder('day'); return; }
    const values = rows.map((r) => r?.[timestampColumn]);
    const order = detectDateOrder(values);
    setDetectedOrder(order);
    setDateOrder(order === 'month' ? 'month' : 'day');
  }, [timestampColumn, rows]);

  // Non-blocking review diagnostics computed before commit.
  const importDiagnostics = React.useMemo(() => {
    if (target !== 'lead' || !rows.length) return null;
    let unresolvedSid = 0;
    const unresolvedSidSamples = [];
    let unparsedTs = 0;
    const unparsedTsSamples = [];
    const tsSamples = [];
    const statusCounts = {};
    rows.forEach((r) => {
      // Supplier resolution: try the sid column then a directly-mapped
      // supplier_name column, matching the commit-time multi-candidate logic.
      const sidRaw = sidColumn ? r?.[sidColumn] : null;
      const nameRaw = supplierNameColumn ? r?.[supplierNameColumn] : null;
      if (resolveSupplierName(sidRaw, nameRaw) === 'CSV Import') {
        unresolvedSid += 1;
        const s = String(sidRaw ?? '').trim() || String(nameRaw ?? '').trim();
        if (s && unresolvedSidSamples.length < 3 && !unresolvedSidSamples.includes(s)) unresolvedSidSamples.push(s);
      }
      // Timestamp parsing
      if (timestampColumn) {
        const raw = r?.[timestampColumn];
        const rawStr = String(raw ?? '').trim();
        if (rawStr !== '') {
          const norm = normalizeTimestamp(raw, dateOrder);
          if (norm == null) {
            unparsedTs += 1;
            if (unparsedTsSamples.length < 3) unparsedTsSamples.push(rawStr);
          } else if (tsSamples.length < 3) {
            tsSamples.push(`${rawStr} -> ${norm}`);
          }
        }
      }
      // Derived final_status
      const st = deriveFinalStatus(r, buyerColumns);
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });
    return { unresolvedSid, unresolvedSidSamples, unparsedTs, unparsedTsSamples, tsSamples, statusCounts };
  }, [target, rows, sidColumn, supplierNameColumn, sidToName, nameToName, timestampColumn, dateOrder, buyerColumns]);

  const checkDuplicates = async () => {
    setDupChecking(true);
    try {
      const records = rows.map(r => {
        const out = {};
        Object.entries(mapping).forEach(([col, field]) => { if (field && field !== IGNORE) out[field] = r[col]; });
        return out;
      });
      let existingEmails = new Set();
      let existingMobiles = new Set();
      if (target === 'lead') {
        let page = 0;
        const pageSize = 500;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const batch = await base44.entities.Lead.list('-created_date', pageSize, page * pageSize);
          batch.forEach(l => {
            const e = normEmail(l.email); if (e) existingEmails.add(e);
            const m = normMobile(l.mobile); if (m) existingMobiles.add(m);
          });
          if (batch.length < pageSize) break;
          page += 1;
        }
      }
      const seenEmails = new Set();
      const seenMobiles = new Set();
      let newCount = 0;
      let dupCount = 0;
      records.forEach(r => {
        const e = normEmail(r.email);
        const m = normMobile(r.mobile);
        const dupExisting = (e && existingEmails.has(e)) || (m && existingMobiles.has(m));
        const dupIntra = (e && seenEmails.has(e)) || (m && seenMobiles.has(m));
        if (dupExisting || dupIntra) { dupCount += 1; return; }
        if (e) seenEmails.add(e);
        if (m) seenMobiles.add(m);
        newCount += 1;
      });
      setDupResult({ newCount, dupCount });
    } catch {
      toast.error('Could not check duplicates');
    }
    setDupChecking(false);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const name = (file.name || '').toLowerCase();
      const isDelimited = name.endsWith('.csv') || name.endsWith('.tsv');
      let list = [];
      // headerCols holds the authoritative column list. For CSV/TSV it is the
      // parsed header row (result.meta.fields), which is complete even when
      // individual data rows are short. For the extract path there is no header
      // metadata, so we take the union of keys across all rows.
      let headerCols = null;
      if (isDelimited) {
        // Parse CSV/TSV in the browser. Reliable on large or wide files with
        // quoted fields containing line breaks, where AI extraction fails.
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        list = Array.isArray(result?.data) ? result.data : [];
        if (Array.isArray(result?.meta?.fields) && result.meta.fields.length) {
          headerCols = result.meta.fields;
        }
      } else {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const extract = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', additionalProperties: true } } } },
        });
        const parsed = extract?.output?.rows || extract?.output || [];
        list = Array.isArray(parsed) ? parsed : [];
        // Union of keys across all rows, preserving first-seen order, since
        // rows here are ragged objects with no shared header.
        const seen = new Set();
        const union = [];
        list.forEach(r => Object.keys(r || {}).forEach(k => { if (!seen.has(k)) { seen.add(k); union.push(k); } }));
        if (union.length) headerCols = union;
      }
      if (!list.length) { toast.error('No rows found in the file'); setBusy(false); return; }
      // Fall back to the first row's keys only when neither source yielded columns.
      const cols = headerCols || Object.keys(list[0] || {});
      setRows(list); setColumns(cols);

      // Deterministic layered auto-map: status override -> normalized exact ->
      // synonyms -> fuzzy. Each column stops at the first confident hit.
      const finalMap = {};
      const unmatched = [];
      cols.forEach(c => {
        const hit = matchColumn(c, fieldEntries);
        if (hit) finalMap[c] = hit;
        else { finalMap[c] = IGNORE; unmatched.push(c); }
      });

      // AI fallback ONLY for columns still unmatched after the deterministic layers.
      if (unmatched.length) {
        try {
          const ai = await base44.integrations.Core.InvokeLLM({
            prompt: `Map each source CSV column to the best matching target field. Source columns: ${JSON.stringify(unmatched)}. Target fields: ${JSON.stringify(targetFields)}. If a column has no good match, map it to "${IGNORE}". Return a JSON object of source column -> target field.`,
            response_json_schema: { type: 'object', properties: { mapping: { type: 'object', additionalProperties: { type: 'string' } } } },
          });
          const auto = ai?.mapping || {};
          unmatched.forEach(c => { if (targetFields.includes(auto[c])) finalMap[c] = auto[c]; });
        } catch {
          // Deterministic mapping already applied; leave unmatched as Ignore.
        }
      }
      setMapping(finalMap);
      setStep('review');
    } catch (err) {
      toast.error('Could not read the file, check the format');
    }
    setBusy(false);
  };

  const applyTemplate = (t) => {
    const saved = (() => { try { return JSON.parse(t.mapping || '{}'); } catch { return {}; } })();
    setTarget(t.target);
    const finalMap = {};
    columns.forEach(c => { finalMap[c] = saved[c] || IGNORE; });
    setMapping(finalMap);
    toast.success(`Applied template "${t.name}"`);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) { toast.error('Enter a template name'); return; }
    await base44.entities.ImportTemplate.create({ name: templateName.trim(), target, mapping: JSON.stringify(mapping) });
    qc.invalidateQueries({ queryKey: ['import-templates'] });
    toast.success('Template saved');
    setTemplateName('');
  };

  const commit = async () => {
    setBusy(true);
    try {
      const records = rows.map(r => {
        const out = {};
        const mapped = {};
        Object.entries(mapping).forEach(([col, field]) => {
          if (!field || field === IGNORE) return;
          // Core lead fields become top-level columns; anything else is a
          // custom field the Lead entity does not persist as a column, so it
          // is collected into the mapped_fields JSON the app reads from.
          if (target === 'lead' && !LEAD_FIELDS.includes(field)) {
            mapped[field] = r[col];
          } else {
            out[field] = r[col];
          }
        });
        if (target === 'lead') {
          // Resolve supplier_name from the row's sid (which lives in mapped) or
          // from a directly-mapped supplier_name, sid first. Always the
          // canonical Supplier.name, never a raw sid. Falls back to 'CSV Import'.
          out.supplier_name = resolveSupplierName(mapped.sid, out.supplier_name);
          // Derive final_status from the detected buyer disposition columns.
          // When buyer columns are present they are the source of truth and win
          // over any column mapped onto final_status. With no buyer columns,
          // fall back to the mapped final_status value normalized.
          out.final_status = buyerColumns.length
            ? deriveFinalStatus(r, buyerColumns)
            : normalizeStatus(out.final_status);
          // Normalize the mapped timestamp to canonical APP_TZ wall-clock. Leave
          // it unset when it cannot be parsed so created_date fallback applies.
          if (mapped.timestamp != null) {
            const norm = normalizeTimestamp(mapped.timestamp, dateOrder);
            if (norm != null) mapped.timestamp = norm;
            else delete mapped.timestamp;
          }
          // Promote mapped values onto top-level Lead columns (buyer, vertical,
          // payout, revenue, email_valid) and derive lead_type, so imported
          // leads are complete at creation and never sit in Processing.
          materializeRecord(out, mapped);
          if (Object.keys(mapped).length) out.mapped_fields = JSON.stringify(mapped);
        }
        return out;
      });
      if (target === 'lead') {
        const pageSize = 500;

        const batchId = `import_${Date.now()}`;
        const allExisting = [];
        {
          let p = 0;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const b = await base44.entities.Lead.list('-created_date', pageSize, p * pageSize);
            allExisting.push(...b);
            if (b.length < pageSize) break;
            p += 1;
          }
        }

        const { fresh, existingDupes, intraFileDupes } = partitionImport(records, allExisting);
        const dupTotal = existingDupes.length + intraFileDupes.length;

        // Duplicates are never resolved silently. A double-run import on
        // 19 July wrote 40+ leads twice and inflated every Sold count in the
        // app, and nothing on screen said so. Ask, then act.
        if (dupTotal > 0 && !dupChoiceRef.current) {
          setProgress(null);
          setBusy(false);
          setDupPrompt({
            fresh,
            existingDupes,
            intraFileDupes,
            batchId,
            records,
          });
          return;
        }

        const choice = dupChoiceRef.current || 'skip';
        dupChoiceRef.current = null;

        // 'skip' imports only genuinely new leads. 'merge' additionally updates
        // the matched existing lead in place rather than creating a second
        // copy, so a re-exported file can correct revenue or status without
        // ever duplicating a record.
        const clean = fresh.map(r => ({
          ...r,
          revenue: r.revenue != null ? Number(r.revenue) || 0 : undefined,
          import_batch_id: batchId,
        }));
        let merged = 0;
        if (choice === 'merge') {
          for (const { record, existing } of existingDupes) {
            try {
              const patch = { ...record };
              delete patch.email;
              delete patch.mobile;
              await base44.entities.Lead.update(existing.id, patch);
              merged += 1;
            } catch { /* a failed merge leaves the original untouched */ }
          }
        }
        const skipped = dupTotal - merged;

        const chunkSize = 100;
        setProgress({ done: 0, total: clean.length });
        let createdCount = 0;
        let failedCount = 0;
        const failedRecords = [];
        for (let i = 0; i < clean.length; i += chunkSize) {
          const chunk = clean.slice(i, i + chunkSize);
          try {
            await base44.entities.Lead.bulkCreate(chunk);
            createdCount += chunk.length;
          } catch {
            // A chunk can fail AFTER writing some of its rows. Retrying the
            // whole chunk one row at a time therefore re-creates whatever
            // already landed, which is exactly how the 19 July import wrote
            // 40+ leads twice under a single batch id.
            //
            // Re-read what actually persisted for this batch, and only retry
            // the rows that are genuinely missing.
            let landed = null;
            try {
              const written = [];
              let p = 0;
              // eslint-disable-next-line no-constant-condition
              while (true) {
                const b = await base44.entities.Lead.filter({ import_batch_id: batchId }, '-created_date', pageSize, p * pageSize);
                written.push(...b);
                if (b.length < pageSize) break;
                p += 1;
              }
              const idx = buildDedupeIndex(written);
              landed = idx;
            } catch {
              landed = null; // could not verify, fall back to retrying all
            }
            for (const rec of chunk) {
              if (landed && findExisting(landed, rec)) { createdCount += 1; continue; }
              try {
                await base44.entities.Lead.create(rec);
                createdCount += 1;
              } catch {
                failedCount += 1;
                failedRecords.push(rec.email || `${rec.first_name || ''} ${rec.last_name || ''}`.trim() || '(no email)');
              }
            }
          }
          setProgress({ done: Math.min(i + chunk.length, clean.length), total: clean.length });
        }
        setProgress(null);
        invalidateLeadCaches(qc);
        if (failedCount) console.warn('CSV import failed records:', failedRecords);
        const unresolvedSuffix = importDiagnostics
          ? `${importDiagnostics.unresolvedSid ? `, ${importDiagnostics.unresolvedSid} unresolved supplier` : ''}${importDiagnostics.unparsedTs ? `, ${importDiagnostics.unparsedTs} unparsed timestamp` : ''}`
          : '';
        toast.success(`Imported ${createdCount} leads, skipped ${skipped} duplicates${failedCount ? `, ${failedCount} failed` : ''}${unresolvedSuffix}`);
        reset();
        setBusy(false);
        return;
      } else {
        const clean = records.filter(r => r.date && r.amount != null).map(r => ({
          source: 'csv', date: String(r.date).slice(0, 10), description: r.description || '',
          amount: Number(r.amount) || 0, category: r.category || '', external_id: r.external_id || '',
        }));
        await base44.entities.BankTransaction.bulkCreate(clean);
        qc.invalidateQueries({ queryKey: ['bank-txns'] });
        toast.success(`Imported ${clean.length} transactions`);
      }
      reset();
    } catch (err) {
      toast.error('Import failed');
    }
    setProgress(null);
    setBusy(false);
  };

  return (
    <div className="bg-card border border-border rounded-[12px] p-5">
      {/* Duplicate decision. Blocks the import until the operator chooses, so a
          re-run can never quietly write a second copy of every lead. */}
      {dupPrompt && (
        <div className="mb-4 rounded-lg border border-status-unsold bg-status-unsold p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 status-unsold shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">
                {dupPrompt.existingDupes.length + dupPrompt.intraFileDupes.length} duplicate{dupPrompt.existingDupes.length + dupPrompt.intraFileDupes.length === 1 ? '' : 's'} found
              </p>
              <ul className="text-[12px] text-muted-foreground mt-1.5 space-y-0.5">
                <li><span className="text-foreground font-medium tabular-nums">{dupPrompt.fresh.length}</span> new leads to import</li>
                {dupPrompt.existingDupes.length > 0 && (
                  <li><span className="text-foreground font-medium tabular-nums">{dupPrompt.existingDupes.length}</span> already in the system (matched on email or mobile)</li>
                )}
                {dupPrompt.intraFileDupes.length > 0 && (
                  <li><span className="text-foreground font-medium tabular-nums">{dupPrompt.intraFileDupes.length}</span> repeated inside this file</li>
                )}
              </ul>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Button size="sm" onClick={() => { dupChoiceRef.current = 'skip'; setDupPrompt(null); commit(); }}>
                  Import {dupPrompt.fresh.length} new, ignore duplicates
                </Button>
                {dupPrompt.existingDupes.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => { dupChoiceRef.current = 'merge'; setDupPrompt(null); commit(); }}>
                    Merge: update the {dupPrompt.existingDupes.length} existing
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { dupChoiceRef.current = null; setDupPrompt(null); }}>
                  Cancel
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/80 mt-2">
                Merge updates the matched lead in place. It never creates a second copy, and it leaves email and mobile untouched.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-primary" />
        <div className="text-[15px] font-semibold text-foreground">CSV Importer</div>
      </div>
      <div className="text-[13px] text-muted-foreground mb-4 max-w-2xl">
        Upload a CSV or Excel file of leads or bank transactions. Columns are auto-mapped with AI, review and confirm before importing. Save a mapping template to reuse per source.
      </div>

      {step === 'upload' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-[12px]">Import into</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="mt-1 bg-background text-[13px] w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Leads</SelectItem>
                  <SelectItem value="bank">Bank Transactions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.xlsx,.xls,.json" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full border-2 border-dashed border-border rounded-[12px] py-10 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            <span className="text-[13px]">{busy ? 'Reading & auto-mapping…' : 'Click to upload a CSV / Excel file'}</span>
          </button>
          {target === 'lead' && (
            <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-[13px] text-foreground font-medium">Finalize pending imports</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">Repairs previously imported leads: fills lead type and buyer fields from the mapped data and resolves Processing statuses.</div>
              </div>
              <Button size="sm" variant="outline" onClick={runFinalizePending} disabled={!!finalizing} className="shrink-0">
                {finalizing ? `${finalizing.done}/${finalizing.total || '…'}` : 'Run repair'}
              </Button>
            </div>
          )}
          {target === 'lead' && (
            <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-[13px] text-foreground font-medium">Backfill lead type</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">Sets lead type on every lead missing one: LEADFLOW and LGNX suppliers become Quiz, all others Affiliate. Safe to run more than once.</div>
              </div>
              <Button size="sm" variant="outline" onClick={runLeadTypeBackfill} disabled={backfilling} className="shrink-0">
                {backfilling ? 'Working…' : 'Backfill lead type'}
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-foreground font-medium">Review mapping · <span className="text-muted-foreground font-normal">{rows.length} rows</span></div>
            <div className="flex items-center gap-2">
              {templates.filter(t => t.target === target).length > 0 && (
                <Select onValueChange={(id) => { const t = templates.find(x => x.id === id); if (t) applyTemplate(t); }}>
                  <SelectTrigger className="bg-background text-[12px] w-[180px] h-8"><SelectValue placeholder="Apply template…" /></SelectTrigger>
                  <SelectContent>{templates.filter(t => t.target === target).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </div>

          <div className="border border-border rounded-[10px] overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead><tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Source Column</th><th className="text-left px-4 py-2.5">Sample</th>
                <th className="text-left px-4 py-2.5 w-[40px]"></th><th className="text-left px-4 py-2.5">Maps To</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {columns.map(col => (
                  <tr key={col}>
                    <td className="px-4 py-2 font-mono text-foreground align-top">{col}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[200px] align-top">
                      {(() => {
                        const vals = sampleValues(col);
                        if (!vals.length) return <span className="italic opacity-60">empty</span>;
                        return (
                          <div className="space-y-0.5">
                            {vals.map((v, i) => <div key={i} className="truncate">{v}</div>)}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground align-top"><ArrowRight className="w-3.5 h-3.5" /></td>
                    <td className="px-4 py-2 align-top">
                      <Select value={mapping[col]} onValueChange={v => { setMapping(p => ({ ...p, [col]: v })); setDupResult(null); }}>
                        <SelectTrigger className="bg-background text-[12px] h-8 w-[220px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={IGNORE}>— Ignore —</SelectItem>
                          {targetFields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {target === 'lead' && importDiagnostics && (
            <div className="border border-border rounded-[10px] p-3 space-y-2 text-[12px]">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pre-import checks (non-blocking)</div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="text-muted-foreground">
                  Unresolved suppliers: <span className="text-foreground font-medium">{importDiagnostics.unresolvedSid}</span>
                  {importDiagnostics.unresolvedSidSamples.length > 0 && (
                    <span className="text-muted-foreground"> ({importDiagnostics.unresolvedSidSamples.join(', ')})</span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  Unparsed timestamps: <span className="text-foreground font-medium">{importDiagnostics.unparsedTs}</span>
                  {importDiagnostics.unparsedTsSamples.length > 0 && (
                    <span className="text-muted-foreground"> ({importDiagnostics.unparsedTsSamples.join(', ')})</span>
                  )}
                </span>
              </div>

              {timestampColumn && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Date order:</span>
                  <span className="text-foreground">detected {detectedOrder}</span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant={dateOrder === 'day' ? 'default' : 'outline'} className="h-6 px-2 text-[11px]" onClick={() => setDateOrder('day')}>Day-first</Button>
                    <Button size="sm" variant={dateOrder === 'month' ? 'default' : 'outline'} className="h-6 px-2 text-[11px]" onClick={() => setDateOrder('month')}>Month-first</Button>
                  </div>
                  {importDiagnostics.tsSamples.length > 0 && (
                    <span className="text-muted-foreground font-mono">{importDiagnostics.tsSamples.join('  ·  ')}</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">Buyer columns:</span>
                {buyerColumns.length ? (
                  buyerColumns.map(c => <Badge key={c} variant="outline" className="text-[10px] text-muted-foreground">{c}</Badge>)
                ) : (
                  <span className="text-muted-foreground italic">none detected</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Derived status:</span>
                {Object.entries(importDiagnostics.statusCounts).map(([st, n]) => (
                  <span key={st} className="text-foreground">{st}: <span className="font-medium">{n}</span></span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Save mapping as… (source name)" className="bg-background text-[12px] w-[240px] h-8" />
              <Button size="sm" variant="outline" onClick={saveTemplate} className="gap-1.5"><Save className="w-3.5 h-3.5" /> Save Template</Button>
            </div>
            <div className="flex items-center gap-3">
              {progress && <span className="text-[12px] text-muted-foreground">created {progress.done} of {progress.total}</span>}
              {dupResult && <span className="text-[12px] text-muted-foreground">{dupResult.newCount} new, {dupResult.dupCount} duplicates</span>}
              <Button size="sm" variant="outline" onClick={checkDuplicates} disabled={dupChecking || busy} className="gap-1.5">
                {dupChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                Check duplicates
              </Button>
              <Button size="sm" onClick={commit} disabled={busy || missingRequired.length > 0} className="gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Import {rows.length} {target === 'lead' ? 'Leads' : 'Transactions'}
              </Button>
            </div>
          </div>

          {missingRequired.length > 0 && (
            <div className="flex items-center gap-2 text-[12px] text-primary bg-status-error-bg rounded-[8px] px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Map {missingRequired.join(' and ')} before importing.</span>
            </div>
          )}

          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {templates.map(t => <Badge key={t.id} variant="outline" className="text-[10px] text-muted-foreground">{t.name} · {t.target}</Badge>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}