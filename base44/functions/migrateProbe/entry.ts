import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Throwaway diagnostic. Asks one question: is there any write path on this
// platform that lets a mirrored record keep the created_date it had in the
// primary app? Tries the CSV import endpoint and a plain create, then reports
// what actually landed. Cleans up after itself.

const SECRET = 'lgx-migrate-9f3a2b7c4d8e1055';
const STAMP = '2026-07-05T15:47:27.758Z';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({} as any));
    if (body.secret !== SECRET) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const db = createClientFromRequest(req).asServiceRole;
    const ent: any = (db.entities as any).Counter;
    const out: Record<string, any> = { wanted: STAMP };

    try {
      const csv = `name,value,created_date\n__probe_csv__,1,${STAMP}\n`;
      const file = new File([csv], 'probe.csv', { type: 'text/csv' });
      out.import_response = await ent.importEntities(file);
    } catch (e) { out.import_error = (e as Error).message.slice(0, 300); }

    try {
      const made = await ent.create({ name: '__probe_json__', value: 1, created_date: STAMP });
      out.create_id = made && made.id;
    } catch (e) { out.create_error = (e as Error).message.slice(0, 300); }

    const rows = await ent.filter({ name: { $in: ['__probe_csv__', '__probe_json__'] } }, 'created_date', 20, 0);
    out.rows = (rows || []).map((r: any) => ({ name: r.name, created_date: r.created_date }));
    for (const r of (rows || [])) { try { await ent.delete(r.id); } catch { /* best effort */ } }

    return Response.json(out);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
