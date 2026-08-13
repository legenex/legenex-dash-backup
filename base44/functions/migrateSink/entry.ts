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
//   { secret, op: 'update', entity, updates: [{ id, data }] }

const SECRET = 'lgx-migrate-9f3a2b7c4d8e1055';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
    const body = await req.json().catch(() => ({} as any));
    if (body.secret !== SECRET) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    if (body.op === 'ping') return Response.json({ ok: true });

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
      for (let round = 0; round < 200; round++) {
        const page = await ent.list('created_date', 200, 0, ['id']);
        if (!page || page.length === 0) break;
        for (const r of page) {
          try { await ent.delete(r.id); deleted++; } catch { /* keep going */ }
        }
      }
      return Response.json({ entity: body.entity, deleted });
    }

    if (body.op === 'write') {
      const records = Array.isArray(body.records) ? body.records : [];
      if (records.length === 0) return Response.json({ created: [] });
      try {
        const out = await ent.bulkCreate(records);
        const arr = Array.isArray(out) ? out : (out && Array.isArray((out as any).records) ? (out as any).records : []);
        if (arr.length === records.length) {
          return Response.json({ created: arr.map((r: any) => (r && r.id) || null), mode: 'bulk' });
        }
      } catch { /* fall through to per-record */ }

      // Fallback: one at a time so a single bad record cannot lose the batch.
      const created: (string | null)[] = [];
      const errors: string[] = [];
      for (const rec of records) {
        try {
          const r = await ent.create(rec);
          created.push((r && r.id) || null);
        } catch (e) {
          created.push(null);
          if (errors.length < 5) errors.push((e as Error).message);
        }
      }
      return Response.json({ created, mode: 'single', errors });
    }

    if (body.op === 'update') {
      const updates = Array.isArray(body.updates) ? body.updates : [];
      let updated = 0;
      const errors: string[] = [];
      for (const u of updates) {
        try { await ent.update(u.id, u.data); updated++; }
        catch (e) { if (errors.length < 5) errors.push((e as Error).message); }
      }
      return Response.json({ updated, errors });
    }

    return Response.json({ error: `Unknown op: ${body.op}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
