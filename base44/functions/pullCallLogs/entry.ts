import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { parseSupplierRules, resolveSupplier, applySupplierResolution } from './supplierRules.generated.js';

// Scheduled pull of call logs from a call platform into CallRecord.
//
// This is the opposite direction to base44/functions/webhook: nothing posts to
// us, we go and fetch. It replaces the standalone Cloud Run job that read
// Ringba into BigQuery, so the calls land directly in the Calls section instead
// of a warehouse the app cannot see.
//
// Window is today in UTC, matching what the Cloud Run job requested. Ringba
// keeps updating a call as it progresses, so re-reading today repeatedly is the
// point: each run upserts on the platform's own call id and refreshes duration,
// connection state and payout on rows that already exist.
//
// Ringba does not report what the call is worth to us. Revenue arrives later
// from the buyer's own report through a Google Sheets source matched on the
// number, which is why nothing here ever writes revenue.
//
// Modes:
//   { source_id }                    run one pull
//   { source_id, dry_run: true }     report what would be written, write nothing
//   { scheduled: true }              run every enabled pull whose interval has elapsed
//   { test: true, source_id }        fetch one page and return a sample, write nothing
//
// CREDENTIALS: a pull stores the NAME of an environment secret in
// credential_env, never the secret. The value is read here at request time,
// never returned in a response, never written to a record, and never included
// in an error message.

const INTERVAL_MINUTES = { '15m': 15, '1h': 60, '6h': 360, daily: 1440 };
const MAX_PAGES = 40;

function jsonObject(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { const p = JSON.parse(val); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch { return {}; }
}

function isoSecond(d) {
  return new Date(d).toISOString().split('.')[0] + 'Z';
}

// Today in UTC, start of day to end of day. Deliberately the same window the
// Cloud Run job used, so the two produce the same set while both are running.
function todayUtcBounds() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return {
    startIso: isoSecond(Date.UTC(y, m, d, 0, 0, 0)),
    endIso: isoSecond(Date.UTC(y, m, d, 23, 59, 59)),
  };
}

// The window a run should request.
//
// Steady state is today only: Ringba keeps updating a call as it progresses, so
// re-reading today is how a call in flight gets its final duration and payout.
//
// The exception is the very first run against a pull, which has no history at
// all behind it. Reaching back a few days there means the Calls section is not
// empty until tomorrow. It applies once, on first run or when explicitly asked
// for, because a wide window on every hourly run would be pointless load.
function runWindow(source, { backfillDays }: { backfillDays?: number } = {}) {
  const days = Number(backfillDays) > 0 ? Math.min(90, Math.floor(Number(backfillDays))) : 0;
  if (!days) return { ...todayUtcBounds(), backfill_days: 0 };

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  // days = 7 means today plus the six days before it, which is what an operator
  // means by "the last 7 days".
  const start = Date.UTC(y, m, d - (days - 1), 0, 0, 0);
  return {
    startIso: isoSecond(start),
    endIso: isoSecond(Date.UTC(y, m, d, 23, 59, 59)),
    backfill_days: days,
  };
}

// How many days a given run should reach back. An explicit request wins; then a
// pull that has never synced uses its configured first-run backfill.
function resolveBackfillDays(source, requested) {
  if (requested != null) return Number(requested) || 0;
  if (source?.last_synced_at) return 0;
  const configured = Number(source?.backfill_days);
  return Number.isFinite(configured) && configured > 0 ? configured : 7;
}

// The credential this connection authenticates with.
//
// api_key holds the key itself, which is what an operator pastes in. A
// credential_env NAME is still honoured as a fallback so a deployment that
// keeps its keys in the environment does not have to move them onto records.
// Whichever is used, the value is read here, server side, and never returned in
// a response or written into an error message.
function resolveSecret(source) {
  const direct = String(source?.api_key || '').trim();
  if (direct) return direct;
  const envName = String(source?.credential_env || '').trim();
  return envName ? (Deno.env.get(envName) || '') : '';
}

function digitsOnly(v) {
  const s = String(v ?? '').replace(/\D+/g, '');
  if (!s) return '';
  // US numbers arrive with and without the country code. Store 10 digits so a
  // Ringba +1 number and a sheet's bare number join to the same call.
  if (s.length === 11 && s.startsWith('1')) return s.slice(1);
  return s;
}

function toNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

// Ringba reports callDt as an epoch in MILLISECONDS, and reports it as a JSON
// number. new Date(1786528706341) is correct, but new Date("1786528706341") is
// Invalid Date, so a provider that quotes the same value would silently null
// every call time. Numeric strings are coerced before parsing for that reason.
function toIso(v) {
  if (v === null || v === undefined || v === '') return null;
  let input: unknown = v;
  if (typeof input === 'string' && /^\d{10,}$/.test(input.trim())) {
    input = Number(input.trim());
  }
  if (typeof input === 'number' && input > 0 && input < 1e12) {
    // A 10-digit epoch is seconds, not milliseconds.
    input = input * 1000;
  }
  const d = new Date(input as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Walk a dot path to the record array. A response that is already an array is
// returned as-is, so a plain JSON endpoint needs no path at all.
function readRecords(payload, path) {
  if (Array.isArray(payload)) return payload;
  let node = payload;
  const parts = String(path || '').split('.').filter(Boolean);
  for (const part of parts) {
    if (node == null) return [];
    node = node[part];
  }
  if (Array.isArray(node)) return node;
  // Fall back to the shapes a call platform commonly uses, so a missing path is
  // not immediately fatal.
  for (const guess of [payload?.report?.records, payload?.data, payload?.rows, payload?.records]) {
    if (Array.isArray(guess)) return guess;
  }
  return [];
}

// Ringba call log field -> our CallRecord field. Matches the column set of the
// legenex-database.references.ringba_calls view, so the app and the warehouse
// describe a call the same way.
const RINGBA_DEFAULTS = {
  inboundCallId: 'call_id',
  callDt: 'call_at',
  inboundPhoneNumber: 'mobile',
  number: 'caller_id',
  callLengthInSeconds: 'duration_seconds',
  connectedCallLengthInSeconds: 'connected_seconds',
  campaignName: 'campaign_name',
  publisherName: 'publisher',
  publisherId: 'publisher_id',
  publisherSubId: 'publisher_sub_id',
  buyer: 'buyer_code',
  targetName: 'target_name',
  hasConnected: 'has_connected',
  hasConverted: 'qualified',
  noConversionReason: 'disposition',
  endCallSource: 'end_call_source',
  isDuplicate: 'is_duplicate',
  recordingUrl: 'recording_url',
};

// Fields we hold as real CallRecord columns. Anything else the provider sends
// is kept in custom_fields rather than dropped, because a call platform adds
// columns without warning and losing them silently is worse than carrying them.
const CALL_COLUMNS = new Set([
  'call_id', 'call_at', 'mobile', 'caller_id', 'duration_seconds', 'campaign_name',
  'buyer_code', 'qualified', 'disposition', 'inquiry_status', 'media_source',
  'sid', 'ssid', 'supplier_name', 'first_name', 'last_name', 'state', 'city', 'zip',
  'vertical', 'vertical_detail', 'consumer_state', 'web_lead', 'unique_inquiry',
]);

function buildRingbaRequest(source, { startIso, endIso, offset, pageSize }) {
  const account = String(source.account_id || '').trim();
  return {
    url: `https://api.ringba.com/v2/${account}/calllogs`,
    method: 'POST',
    body: JSON.stringify({
      reportStart: startIso,
      reportEnd: endIso,
      size: pageSize,
      offset,
      orderByColumns: [{ column: 'callDt', direction: 'desc' }],
    }),
    authTemplate: source.auth_header || 'Token {{secret}}',
    recordsPath: source.records_path || 'report.records',
  };
}

function buildHttpRequest(source, { startIso, endIso, offset, pageSize }) {
  const fill = (s) => String(s || '')
    .replaceAll('{{start}}', startIso)
    .replaceAll('{{end}}', endIso)
    .replaceAll('{{offset}}', String(offset))
    .replaceAll('{{size}}', String(pageSize));
  const method = String(source.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  return {
    url: fill(source.url),
    method,
    body: method === 'POST' ? fill(source.body_template || '{}') : null,
    authTemplate: source.auth_header || '',
    recordsPath: source.records_path || '',
  };
}

// One page. The secret is injected here and nowhere else, and the returned
// error text is the provider's status only, never the request headers.
async function fetchPage(source, secret, window) {
  const spec = source.provider === 'http'
    ? buildHttpRequest(source, window)
    : buildRingbaRequest(source, window);

  if (!/^https:\/\//i.test(spec.url)) {
    throw new Error('Pull URL must be an absolute https URL');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (spec.authTemplate) {
    headers.Authorization = spec.authTemplate.replaceAll('{{secret}}', secret);
  }

  const res = await fetch(spec.url, {
    method: spec.method,
    headers,
    body: spec.method === 'POST' ? spec.body : undefined,
  });

  if (!res.ok) {
    // Body is deliberately not echoed: a provider can reflect the request back,
    // and that would put the token in last_error.
    throw new Error(`Provider responded ${res.status}`);
  }

  const json = await res.json();
  if (json && json.isSuccessful === false) {
    throw new Error('Provider reported the report was not generated');
  }
  return { records: readRecords(json, spec.recordsPath), recordsPath: spec.recordsPath };
}

// Fetch every page for the window, stopping on a short page.
async function fetchAll(source, secret, { backfillDays }: { backfillDays?: number } = {}) {
  const { startIso, endIso, backfill_days } = runWindow(source, { backfillDays });
  const pageSize = Math.max(1, Math.min(5000, Number(source.page_size) || 1000));
  const all = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { records } = await fetchPage(source, secret, {
      startIso, endIso, offset: page * pageSize, pageSize,
    });
    all.push(...records);
    if (records.length < pageSize) break;
  }
  return { records: all, startIso, endIso, backfill_days };
}

// Translate one provider record into a CallRecord patch, then let the operator's
// rules decide who the supplier is.
function mapRecord(raw, source) {
  const defaults = source.provider === 'ringba' ? RINGBA_DEFAULTS : {};
  const overrides = jsonObject(source.field_map);
  const map = { ...defaults, ...overrides };

  const mapped = {};
  const extra = {};
  for (const [providerKey, value] of Object.entries(raw || {})) {
    if (value == null || value === '') continue;
    const target = map[providerKey];
    if (!target) {
      extra[providerKey] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      continue;
    }
    if (CALL_COLUMNS.has(target)) mapped[target] = value;
    else extra[target] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  const record = {
    call_id: mapped.call_id != null ? String(mapped.call_id) : undefined,
    call_at: toIso(mapped.call_at) || undefined,
    mobile: digitsOnly(mapped.mobile) || undefined,
    mobile_raw: mapped.mobile != null ? String(mapped.mobile) : undefined,
    caller_id: mapped.caller_id != null ? String(mapped.caller_id) : undefined,
    duration_seconds: toNumber(mapped.duration_seconds) ?? undefined,
    campaign_name: mapped.campaign_name != null ? String(mapped.campaign_name) : undefined,
    buyer_code: mapped.buyer_code != null ? String(mapped.buyer_code) : undefined,
    qualified: mapped.qualified === undefined ? undefined : toBool(mapped.qualified),
    qualified_raw: mapped.qualified === undefined ? undefined : String(mapped.qualified),
    disposition: mapped.disposition != null ? String(mapped.disposition) : undefined,
    inquiry_status: mapped.inquiry_status != null ? String(mapped.inquiry_status) : undefined,
    first_name: mapped.first_name != null ? String(mapped.first_name) : undefined,
    last_name: mapped.last_name != null ? String(mapped.last_name) : undefined,
    state: mapped.state != null ? String(mapped.state) : undefined,
    vertical: mapped.vertical != null ? String(mapped.vertical) : undefined,
    source_id: source.id,
    source_name: source.name,
  };

  // Attribution. The rules read the RAW provider record, because that is where
  // publisher and publisherSubId live under their own names.
  const resolved = resolveSupplier(raw, source.supplier_rules);
  Object.assign(record, applySupplierResolution(record, resolved));
  record.attribution_status = resolved.matched && (resolved.sid || resolved.supplier_name)
    ? 'matched_feed'
    : 'unattributed';

  // Commercial outcome, decided from what the provider actually reported rather
  // than left to a default. A converted call is Converted; a call the buyer
  // declined with a reason is Rejected; anything still in flight is Pending.
  if (record.qualified === true) record.call_status = 'Converted';
  else if (record.disposition) record.call_status = 'Rejected';
  else record.call_status = 'Pending';

  // Ringba tells us nothing about what the call is worth to us. Revenue is left
  // strictly alone so the buyer's report can set it later without this pull
  // overwriting it on the next run.

  if (Object.keys(extra).length) record.custom_fields = JSON.stringify(extra);

  for (const k of Object.keys(record)) {
    if (record[k] === undefined) delete record[k];
  }
  return { record, resolved };
}

async function runPull(db, source, { dryRun = false, backfillDays = null, reattribute = false } = {}) {
  const secret = resolveSecret(source);
  if (!secret) {
    throw new Error('No API key set on this connection. Add one in the webhook settings.');
  }

  const days = resolveBackfillDays(source, backfillDays);
  const { records, startIso, endIso, backfill_days } = await fetchAll(source, secret, { backfillDays: days });
  const counts = { fetched: records.length, created: 0, updated: 0, skipped: 0, unattributed: 0, errored: 0 };

  const dedupeField = String(source.dedupe_field || '').trim();

  for (const raw of records) {
    try {
      const { record, resolved } = mapRecord(raw, source);
      const key = dedupeField ? raw?.[dedupeField] : record.call_id;
      if (!record.mobile && !key) { counts.skipped += 1; continue; }
      if (!resolved.matched) counts.unattributed += 1;

      if (dryRun) { counts.created += 1; continue; }

      // Upsert on the platform's own call id, so re-reading today updates a
      // call in flight rather than duplicating it.
      let existing = null;
      if (key) {
        const hits = await db.entities.CallRecord.filter({ call_id: String(key) });
        existing = (Array.isArray(hits) ? hits : [])[0] || null;
      }

      if (existing) {
        // Never clear a value the buyer's report has already filled in.
        const patch = { ...record };
        if (existing.revenue) delete patch.revenue;

        // Attribution is normally left alone once set, so a buyer's report or a
        // lead match is not overwritten by a later pull. reattribute is the
        // deliberate exception: it re-applies the current supplier rules to
        // calls already stored, which is what an operator needs while they are
        // still working the rules out. A lead matched on its own number is a
        // real join rather than a rule, so it always survives.
        const lockedToLead = existing.attribution_status === 'matched_lead';
        if (!reattribute || lockedToLead) {
          if (existing.sid) delete patch.sid;
          if (existing.ssid) delete patch.ssid;
          if (existing.supplier_name) delete patch.supplier_name;
        }
        if (lockedToLead) delete patch.attribution_status;
        await db.entities.CallRecord.update(existing.id, patch);
        counts.updated += 1;
      } else {
        await db.entities.CallRecord.create(record);
        counts.created += 1;
      }
    } catch {
      counts.errored += 1;
    }
  }

  if (!dryRun) {
    await db.entities.PullSource.update(source.id, {
      last_synced_at: new Date().toISOString(),
      last_sync_status: `Fetched ${counts.fetched}, created ${counts.created}, updated ${counts.updated}`,
      last_run_counts: JSON.stringify(counts),
      ingested_count: (Number(source.ingested_count) || 0) + counts.created,
      last_error: '',
    });
  }

  return { counts, window: { startIso, endIso, backfill_days } };
}

function intervalElapsed(source) {
  const minutes = INTERVAL_MINUTES[source.sync_interval] ?? 60;
  if (!source.last_synced_at) return true;
  const last = new Date(source.last_synced_at).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= minutes * 60 * 1000;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Caller model: an admin operator, or a scheduled run with no user. Anything
    // else is refused before a single record is read.
    let isScheduledRun = false;
    try {
      const user = await base44.auth.me();
      if (!user) isScheduledRun = true;
      else if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch {
      isScheduledRun = true;
    }

    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole;

    // Test: one page, a sample and the resolved supplier, writing nothing. This
    // is how an operator checks a token and their rules before enabling a pull.
    if (body.test && body.source_id) {
      const source = await db.entities.PullSource.get(body.source_id);
      if (!source) return Response.json({ error: 'Pull source not found' }, { status: 404 });
      const secret = resolveSecret(source);
      if (!secret) {
        return Response.json({ error: 'No API key set on this connection. Add one in the webhook settings.' }, { status: 400 });
      }
      const days = resolveBackfillDays(source, body.backfill_days != null ? body.backfill_days : null);
      const { startIso, endIso, backfill_days } = runWindow(source, { backfillDays: days });
      const { records } = await fetchPage(source, secret, {
        startIso, endIso, offset: 0, pageSize: Math.min(50, Number(source.page_size) || 50),
      });
      const sample = records.slice(0, 3).map((raw) => {
        const { record, resolved } = mapRecord(raw, source);
        return { provider_keys: Object.keys(raw || {}), mapped: record, resolved };
      });
      return Response.json({
        status: 'ok',
        window: { startIso, endIso, backfill_days },
        fetched: records.length,
        rule_count: parseSupplierRules(source.supplier_rules).length,
        sample,
      });
    }

    if (body.source_id) {
      const source = await db.entities.PullSource.get(body.source_id);
      if (!source) return Response.json({ error: 'Pull source not found' }, { status: 404 });
      try {
        const result = await runPull(db, source, {
          dryRun: !!body.dry_run,
          backfillDays: body.backfill_days != null ? body.backfill_days : null,
          reattribute: !!body.reattribute,
        });
        return Response.json({ status: 'ok', dry_run: !!body.dry_run, ...result });
      } catch (e) {
        const message = (e as Error).message || 'Pull failed';
        if (!body.dry_run) {
          await db.entities.PullSource.update(source.id, {
            error_count: (Number(source.error_count) || 0) + 1,
            last_error: message.slice(0, 300),
            last_sync_status: 'Failed',
          });
        }
        return Response.json({ status: 'error', error: message }, { status: 502 });
      }
    }

    // Scheduled sweep: every enabled pull whose interval has elapsed. One
    // failure is recorded against its own source and never stops the others.
    const all = (await db.entities.PullSource.list('-created_date', 200)) || [];
    const due = all.filter((s) => s.enabled !== false && intervalElapsed(s));
    const results = [];
    for (const source of due) {
      try {
        const result = await runPull(db, source);
        results.push({ id: source.id, name: source.name, status: 'ok', counts: result.counts });
      } catch (e) {
        const message = (e as Error).message || 'Pull failed';
        await db.entities.PullSource.update(source.id, {
          error_count: (Number(source.error_count) || 0) + 1,
          last_error: message.slice(0, 300),
          last_sync_status: 'Failed',
        });
        results.push({ id: source.id, name: source.name, status: 'error', error: message });
      }
    }

    return Response.json({ status: 'ok', scheduled: isScheduledRun, ran: results.length, results });
  } catch (error) {
    return Response.json({ status: 'error', error: (error as Error).message }, { status: 500 });
  }
});
