import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { mirrorClock } from './mirrorClock.generated.js';

// Diagnostic for the backup mirror's time correction. Reads the same entity
// twice, once raw and once through mirrorClock, and reports what each sees.
// Answers two questions in one call: is new backend code actually deploying,
// and does the mirrorClock shim load and behave inside a function bundle?

const SECRET = 'lgx-migrate-9f3a2b7c4d8e1055';
const VERSION = 'v3-source-created-date';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({} as any));
    if (body.secret !== SECRET) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const entity = typeof body.entity === 'string' ? body.entity : 'Lead';
    const base44 = createClientFromRequest(req);
    const raw = base44.asServiceRole;
    const corrected = mirrorClock(raw);

    const rawRows = await (raw.entities as any)[entity].list('-created_date', 3);
    const fixedRows = await (corrected.entities as any)[entity].list('-created_date', 3);

    const pick = (r: any) => ({
      id: r.id,
      created_date: r.created_date,
      source_created_date: r.source_created_date ?? null,
    });

    return Response.json({
      version: VERSION,
      entity,
      raw: (rawRows || []).map(pick),
      corrected: (fixedRows || []).map(pick),
    });
  } catch (error) {
    return Response.json({ version: VERSION, error: (error as Error).message }, { status: 500 });
  }
});
