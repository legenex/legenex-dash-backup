import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Keeps this backup app 1:1 with the primary Legenex dashboard app.
//
// For each entity it pulls the primary's records through that app's read-only
// `migrateSource` function, then creates what is missing here, rewrites what
// has changed, and deletes what no longer exists upstream. Rows are matched on
// `migration_source_id`, which holds the record's id in the primary app.
//
// Base44 issues its own ids on insert, so any field that points at another
// record has to be repointed at the mirrored copy. The job builds a
// source-id -> mirror-id map from the low volume entities each run and rewrites
// reference fields through it before writing.
//
// Invocation:
//   POST {}                          run from the stored round-robin cursor
//   POST { entities: ["Lead"] }      run just these entities
//   POST { budget_ms: 90000 }        override the wall clock budget
//
// Scheduled runs arrive with no user. Interactive runs must be an admin.

const SOURCE_APP = '6a4957e7b03e9b10c170d29e';
const SOURCE_FN = 'https://base44.app/api/apps/6a4957e7b03e9b10c170d29e/functions/migrateSource';
const SECRET = 'lgx-migrate-9f3a2b7c4d8e1055';

// System columns the platform owns. Never copied, never compared.
const SYSTEM_FIELDS = ['id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'];

// Append-only, very high volume. Synced on id presence alone: no field level
// diffing, because rewriting 90k log rows every pass is not worth the calls.
const APPEND_ONLY = new Set(['MetaSyncRun', 'AuditLog', 'ErrorLog', 'RouteDecisionTrace', 'PageSnapshot']);

// Never mirrored. User is a built-in entity the platform manages, and
// MirrorSyncState belongs to this app only.
const EXCLUDED = new Set(['User', 'MirrorSyncState']);

// Entities big enough that loading them into the reference map is wasteful.
// Nothing points at these.
const NOT_REFERENCE_TARGETS = new Set(['MetaSyncRun', 'AuditLog', 'PageSnapshot', 'ChatMemory', 'ProgressPage']);

const ENTITIES = [
  'AdCreativeMeta', 'AdSpend', 'AdSpendMapping', 'ApiConnector', 'ApiKey', 'AppSettings', 'AuditFinding',
  'AuditLog', 'AuditRun', 'BankTransaction', 'BenchmarkCriterion', 'BidAttempt', 'BillingLineItem',
  'BillingRun', 'BotConfig', 'Brand', 'Buyer', 'BuyerCplRule', 'BuyerFeedback', 'BuyerOnboarding',
  'BuyerPayment', 'BuyerStateCpl', 'BuyerWallet', 'CallRecord', 'Campaign', 'CapCounter', 'CapReservation',
  'CertBackupStore', 'ChangeRequest', 'ChatConversation', 'ChatMemory', 'ContractVersion', 'Counter',
  'CustomCalculation', 'CustomField', 'Delivery', 'DeliveryAttempt', 'DestinationHealth', 'Disposition',
  'DistributionAudit', 'EmailValidationSettings', 'ErrorLog', 'FieldMapping', 'HlrSettings',
  'ImportTemplate', 'InboundWebhookRoute', 'IntegrationConfig', 'Invitation', 'Invoice', 'KnowledgeDoc',
  'Lead', 'LeadByteConnector', 'LeadSource', 'MetaConnection', 'MetaLeadFormMapping', 'MetaSyncRun',
  'MigrationRequirement', 'NotificationEvent', 'NotificationRule', 'OnboardingEmailTemplate',
  'OutboundWebhook', 'PageSnapshot', 'PayloadTest', 'ProgressPage', 'ProgressSnapshot', 'PromptDraft',
  'PullSource', 'ReferenceKey', 'ReleaseGate', 'Report', 'ResponseMapping', 'ReturnRequest', 'ReviewThread',
  'RouteConfigVersion', 'RouteDecisionTrace', 'RouteGroup', 'RouteMember', 'StateChangeEvent', 'StateStatus',
  'SubDelivery', 'Supplier', 'SupplierAdAccount', 'SupplierPayout', 'SupplierSource',
  'SupplierStateCoverage', 'VerificationRecord', 'Vertical', 'WalletTransaction', 'Webhook',
].filter((e) => !EXCLUDED.has(e));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OBJECT_ID = /^[0-9a-f]{24}$/;

async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (!/rate limit|429|too many|timeout|network/i.test(String((e as Error).message || ''))) throw e;
      await sleep(600 * Math.pow(2, i));
    }
  }
  throw last;
}

async function source(body: Record<string, unknown>) {
  return withRetry(async () => {
    const res = await fetch(SOURCE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: SECRET, ...body }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`source returned non-JSON: ${text.slice(0, 200)}`); }
    if (!res.ok) throw new Error(`source ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  });
}

// Every record of an entity in the primary app.
async function sourceAll(entity: string, fields?: string[]) {
  const out: any[] = [];
  for (let skip = 0; skip < 400000; skip += 500) {
    const page = await source({ op: fields ? 'read' : 'read', entity, skip, limit: 500, fields });
    const rows = page.rows || [];
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}

// Every record of an entity in this app.
async function mirrorAll(db: any, entity: string, fields?: string[]) {
  const out: any[] = [];
  for (let skip = 0; skip < 400000; skip += 500) {
    const rows = await withRetry(() => db.entities[entity].list('created_date', 500, skip, fields));
    const page = rows || [];
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

const strip = (rec: Record<string, any>) => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(rec)) if (!SYSTEM_FIELDS.includes(k)) out[k] = v;
  return out;
};

// Repoint reference fields at the mirrored copies.
function remap(rec: Record<string, any>, idMap: Record<string, string>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'string' && v.length === 24 && OBJECT_ID.test(v) && idMap[v]) out[k] = idMap[v];
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'string' && idMap[x]) ? idMap[x] : x);
    else out[k] = v;
  }
  return out;
}

function differs(want: Record<string, any>, have: Record<string, any>) {
  for (const [k, v] of Object.entries(want)) {
    const a = v === undefined || v === '' ? null : v;
    const b = have[k] === undefined || have[k] === '' ? null : have[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) return true;
  }
  return false;
}

async function loadState(db: any, entityName: string) {
  const rows = await db.entities.MirrorSyncState.filter({ entity_name: entityName }, '', 1);
  return rows && rows.length ? rows[0] : null;
}

async function saveState(db: any, entityName: string, data: Record<string, any>) {
  const existing = await loadState(db, entityName);
  if (existing) return db.entities.MirrorSyncState.update(existing.id, data);
  return db.entities.MirrorSyncState.create({ entity_name: entityName, ...data });
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);

    // Scheduled runs have no user. Interactive runs must be an admin.
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch { /* no user: scheduled run */ }

    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({} as any));
    const budgetMs = Math.min(Math.max(Number(body.budget_ms) || 100000, 10000), 500000);
    const dryRun = body.dry_run === true;

    let queue: string[] = Array.isArray(body.entities) && body.entities.length
      ? body.entities.filter((e: string) => ENTITIES.includes(e))
      : [];
    let cursorRow: any = null;
    if (queue.length === 0) {
      cursorRow = await loadState(db, '__cursor__');
      const start = cursorRow ? (Number(cursorRow.cursor) || 0) % ENTITIES.length : 0;
      queue = [...ENTITIES.slice(start), ...ENTITIES.slice(0, start)];
    }

    // Reference map: primary record id -> mirrored record id, for everything
    // small enough to plausibly be pointed at.
    const idMap: Record<string, string> = {};
    for (const e of ENTITIES) {
      if (NOT_REFERENCE_TARGETS.has(e)) continue;
      try {
        for (const r of await mirrorAll(db, e, ['id', 'migration_source_id'])) {
          if (r.migration_source_id) idMap[r.migration_source_id] = r.id;
        }
      } catch { /* entity may be empty or unreadable; skip */ }
      if (Date.now() - startedAt > budgetMs * 0.4) break;
    }

    const report: any[] = [];
    let processed = 0;

    for (const entity of queue) {
      if (Date.now() - startedAt > budgetMs) break;

      const appendOnly = APPEND_ONLY.has(entity);
      const result: any = { entity, created: 0, updated: 0, deleted: 0, errors: [] as string[] };

      try {
        const srcRows = await sourceAll(entity);
        const mirRows = await mirrorAll(db, entity, appendOnly ? ['id', 'migration_source_id'] : undefined);

        const bySourceId: Record<string, any> = {};
        const orphans: string[] = [];
        for (const m of mirRows) {
          if (m.migration_source_id) bySourceId[m.migration_source_id] = m;
          else orphans.push(m.id);
        }

        const seen = new Set<string>();
        const toCreate: any[] = [];

        for (const s of srcRows) {
          seen.add(s.id);
          const want = remap(strip(s), idMap);
          want.migration_source_id = s.id;
          const have = bySourceId[s.id];
          if (!have) { toCreate.push(want); continue; }
          if (appendOnly) continue;
          if (differs(want, have)) {
            if (!dryRun) {
              try { await withRetry(() => db.entities[entity].update(have.id, want)); result.updated++; }
              catch (e) { if (result.errors.length < 3) result.errors.push(`update ${have.id}: ${(e as Error).message}`); }
            } else result.updated++;
          }
        }

        for (const [sid, m] of Object.entries(bySourceId)) {
          if (!seen.has(sid)) orphans.push((m as any).id);
        }

        if (!dryRun) {
          for (let i = 0; i < toCreate.length; i += 100) {
            const chunk = toCreate.slice(i, i + 100);
            try {
              const made = await withRetry(() => db.entities[entity].bulkCreate(chunk));
              const arr = Array.isArray(made) ? made : [];
              result.created += arr.length || chunk.length;
              chunk.forEach((rec, k) => {
                const nid = arr[k] && arr[k].id;
                if (nid && rec.migration_source_id) idMap[rec.migration_source_id] = nid;
              });
            } catch (e) {
              if (result.errors.length < 3) result.errors.push(`create: ${(e as Error).message}`);
            }
          }
          for (const id of orphans) {
            try { await withRetry(() => db.entities[entity].delete(id)); result.deleted++; }
            catch (e) { if (result.errors.length < 3) result.errors.push(`delete ${id}: ${(e as Error).message}`); }
          }
        } else {
          result.created = toCreate.length;
          result.deleted = orphans.length;
        }

        result.source_count = srcRows.length;
        result.mirror_count = mirRows.length + result.created - result.deleted;
        result.in_sync = result.source_count === result.mirror_count;

        if (!dryRun) {
          await saveState(db, entity, {
            last_sync_at: new Date().toISOString(),
            source_count: result.source_count,
            mirror_count: result.mirror_count,
            created: result.created,
            updated: result.updated,
            deleted: result.deleted,
            in_sync: result.in_sync,
            last_error: result.errors.join(' | ').slice(0, 400),
          }).catch(() => {});
        }
      } catch (e) {
        result.errors.push((e as Error).message);
        result.in_sync = false;
        if (!dryRun) await saveState(db, entity, { last_sync_at: new Date().toISOString(), in_sync: false, last_error: (e as Error).message.slice(0, 400) }).catch(() => {});
      }

      report.push(result);
      processed++;
    }

    // Advance the round-robin cursor so the next run picks up where this stopped.
    if (!dryRun && !(Array.isArray(body.entities) && body.entities.length)) {
      const start = cursorRow ? (Number(cursorRow.cursor) || 0) : 0;
      await saveState(db, '__cursor__', { cursor: (start + processed) % ENTITIES.length }).catch(() => {});
    }

    const outOfSync = report.filter((r) => r.in_sync === false).map((r) => r.entity);
    return Response.json({
      ok: true,
      dry_run: dryRun,
      duration_ms: Date.now() - startedAt,
      entities_processed: processed,
      entities_remaining: ENTITIES.length - processed,
      totals: {
        created: report.reduce((a, r) => a + r.created, 0),
        updated: report.reduce((a, r) => a + r.updated, 0),
        deleted: report.reduce((a, r) => a + r.deleted, 0),
      },
      out_of_sync: outOfSync,
      report,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message, duration_ms: Date.now() - startedAt }, { status: 500 });
  }
});
