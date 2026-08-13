import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Read-only Lead data endpoint for operator users. Lead has admin-only RLS, so
// platform role "user" (base_role manager) gets empty results from client-side
// Lead reads. This serves those reads via the service role, gated to operators.
//
// Access rules:
// - Must be an authenticated Base44 session.
// - Rejected if base_role is supplier or buyer, or if linked_buyer_id /
//   linked_supplier_id is set (those are portal accounts, not operators).
// - Must have at least one operator permission set true.
//
// Read-only: this endpoint never creates, updates, or deletes anything.

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Load the caller's User record via service role so we can read fields that
    // may be admin-scoped.
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
    const entity = body.entity;
    if (entity !== 'Lead') return Response.json({ error: 'Unsupported entity' }, { status: 400 });

    const query = body.query || null;
    const sort = body.sort || '-created_date';
    let limit = Number(body.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 2000;
    if (limit > 5000) limit = 5000;
    let skip = Number(body.skip);
    if (!Number.isFinite(skip) || skip < 0) skip = 0;

    const svc = base44.asServiceRole;
    const rows = query
      ? await svc.entities.Lead.filter(query, sort, limit, skip)
      : await svc.entities.Lead.list(sort, limit, skip);

    return Response.json({ rows: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});