import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Operator-gated bulk delete for Lead records. The client cannot delete
// thousands of admin-RLS leads reliably in a per-record loop, so this deletes
// server side with the service role in chunks.
//
// Accepts either:
//   { ids: ["..", ".."] }              delete these specific leads
//   { all: true, filter: {..} }        delete every lead matching the filter
//
// Returns { deleted }.

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const record = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
    const caller = record || user;

    if (caller.base_role === 'supplier' || caller.base_role === 'buyer') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (caller.linked_buyer_id || caller.linked_supplier_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let permissions: Record<string, any> = {};
    try {
      permissions = typeof caller.permissions === 'string'
        ? JSON.parse(caller.permissions || '{}')
        : (caller.permissions || {});
    } catch { permissions = {}; }
    const hasOperatorPermission = OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
    if (!hasOperatorPermission && caller.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    let ids: string[] = [];

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      ids = body.ids.filter((x: any) => typeof x === 'string' && x);
    } else if (body.all === true) {
      // Page through the full filtered set and collect ids.
      const filter = body.filter && typeof body.filter === 'object' ? body.filter : {};
      const pageSize = 500;
      let skip = 0;
      for (let i = 0; i < 1000; i++) {
        const page = await svc.entities.Lead.filter(filter, '-created_date', pageSize, skip);
        if (!page || page.length === 0) break;
        for (const l of page) { if (l?.id) ids.push(l.id); }
        if (page.length < pageSize) break;
        skip += pageSize;
      }
    } else {
      return Response.json({ error: 'Provide either { ids: [] } or { all: true, filter: {} }' }, { status: 400 });
    }

    let deleted = 0;
    const chunkSize = 100;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      for (const id of chunk) {
        try {
          await svc.entities.Lead.delete(id);
          deleted++;
        } catch { /* skip individual failures, keep going */ }
      }
    }

    return Response.json({ deleted });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});