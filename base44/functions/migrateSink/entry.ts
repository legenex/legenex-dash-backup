import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Migration sink. Receives entity records from the source app's migrateSource
// function and writes them with the service role. Guarded by a shared secret
// so it cannot be driven by anyone who does not already hold it.
//
// Ops (POST JSON):
//   { secret, op: 'ping' }
//   { secret, op: 'count',  entity }
//   { secret, op: 'read',   entity, skip, limit }
//   { secret, op: 'purge',  entity }
//   { secret, op: 'write',  entity, records: [...] }   -> { created: [ids] }
//   { secret, op: 'update', entity, updates: [{ id, data }] } -> { updated, failed: [ids] }

const SECRET = 'lgx-migrate-9f3a2b7c4d8e1055';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The platform rate-limits per-record writes. Retry those with backoff rather
// than dropping the record.
async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const msg = String((e as Error).message || '');
      if (!/rate limit|429|too many/i.test(msg)) throw e;
      await sleep(500 * Math.pow(2, i));
    }
  }
  throw last;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
    const body = await req.json().catch(() => ({} as any));
    if (body.secret !== SECRET) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    if (body.op === 'ping') return Response.json({ ok: true });

    // Probe: can any write path preserve the original created_date? Tries the
    // file import endpoint and a raw REST insert, then reports what stuck.
    if (body.op === 'probeimport') {
      const ent2: any = (db.entities as any).Counter;
      const stamp = '2026-07-05T15:47:27.758Z';
      const out: Record<string, any> = {};

      try {
        const csv = `name,value,created_date\n__probe_csv__,1,${stamp}\n`;
        const file = new File([csv], 'probe.csv', { type: 'text/csv' });
        out.import_response = await ent2.importEntities(file);
      } catch (e) { out.import_error = (e as Error).message.slice(0, 300); }

      try {
        const made = await ent2.create({ name: '__probe_json__', value: 1, created_date: stamp, created_at: stamp });
        out.create_id = made && made.id;
      } catch (e) { out.create_error = (e as Error).message.slice(0, 300); }

      const rows = await ent2.filter({ name: { $in: ['__probe_csv__', '__probe_json__'] } }, 'created_date', 10, 0);
      out.rows = (rows || []).map((r: any) => ({ name: r.name, created_date: r.created_date }));
      out.wanted = stamp;
      for (const r of (rows || [])) { try { await ent2.delete(r.id); } catch { /* best effort */ } }
      return Response.json(out);
    }

    const ent: any = body.entity ? (db.entities as any)[body.entity] : null;
    if (!ent) return Response.json({ error: `Unknown entity: ${body.entity}` }, { status: 400 });

    if (body.op === 'count') {
      let total = 0;
      let skip = 0;
      for (let i = 0; i < 400; i++) {
        const page = await ent.list('created_date', 500, skip, ['id']);
        if (!page || page.length === 0) break;
        total += page.length;
        if (page.length < 500) break;
        skip += 500;
      }
      return Response.json({ entity: body.entity, count: total });
    }

    if (body.op === 'read') {
      const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
      const skip = Math.max(Number(body.skip) || 0, 0);
      const rows = await ent.list('created_date', limit, skip);
      return Response.json({ entity: body.entity, skip, limit, rows: rows || [] });
    }

    if (body.op === 'purge') {
      let deleted = 0;
      for (let round = 0; round < 400; round++) {
        const page = await ent.list('created_date', 200, 0, ['id']);
        if (!page || page.length === 0) break;
        for (const r of page) {
          try { await withRetry(() => ent.delete(r.id)); deleted++; } catch { /* keep going */ }
        }
      }
      return Response.json({ entity: body.entity, deleted });
    }

    if (body.op === 'write') {
      const records = Array.isArray(body.records) ? body.records : [];
      if (records.length === 0) return Response.json({ created: [] });
      try {
        const out = await withRetry(() => ent.bulkCreate(records));
        const arr = Array.isArray(out) ? out : (out && Array.isArray((out as any).records) ? (out as any).records : []);
        if (arr.length === records.length) {
          return Response.json({ created: arr.map((r: any) => (r && r.id) || null), mode: 'bulk' });
        }
      } catch { /* fall through to per-record */ }

      const created: (string | null)[] = [];
      const errors: string[] = [];
      for (const rec of records) {
        try {
          const r = await withRetry(() => ent.create(rec));
          created.push((r && r.id) || null);
        } catch (e) {
          created.push(null);
          if (errors.length < 5) errors.push((e as Error).message);
        }
      }
      return Response.json({ created, mode: 'single', errors });
    }

    // Query-based bulk rewrite. Used to repoint foreign keys on very high
    // volume entities where per-record updates are not practical.
    if (body.op === 'updatemany') {
      const field = String(body.field || '');
      const from = body.from;
      const to = body.to;
      if (!field || from === undefined || to === undefined) {
        return Response.json({ error: 'updatemany needs field, from, to' }, { status: 400 });
      }
      let touched = 0;
      for (let round = 0; round < 400; round++) {
        const before = await ent.filter({ [field]: from }, 'created_date', 1, 0, ['id']);
        if (!before || before.length === 0) break;
        const res: any = await withRetry(() => ent.updateMany({ [field]: from }, { $set: { [field]: to } }));
        const n = Number((res && (res.updated ?? res.modified_count ?? res.matched_count)) || 0);
        touched += n;
        if (!n) break;
      }
      return Response.json({ entity: body.entity, field, from, to, touched });
    }

    if (body.op === 'update') {
      const updates = Array.isArray(body.updates) ? body.updates : [];
      if (updates.length === 0) return Response.json({ updated: 0, failed: [] });

      // One request for the whole batch when the platform supports it.
      try {
        const payload = updates.map((u: any) => ({ id: u.id, ...(u.data || {}) }));
        await withRetry(() => ent.bulkUpdate(payload));
        return Response.json({ updated: updates.length, failed: [], mode: 'bulk' });
      } catch { /* fall through */ }

      let updated = 0;
      const failed: string[] = [];
      const errors: string[] = [];
      for (const u of updates) {
        try { await withRetry(() => ent.update(u.id, u.data)); updated++; }
        catch (e) { failed.push(u.id); if (errors.length < 3) errors.push((e as Error).message); }
      }
      return Response.json({ updated, failed, errors, mode: 'single' });
    }

    return Response.json({ error: `Unknown op: ${body.op}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
