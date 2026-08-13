import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Caller model: OPERATOR-ONLY. Route simulator against the REAL published config.
// Loads the actual snapshot through the same loader as production, runs the ONE
// canonical engine, and returns a redacted trace marked simulated. Performs ZERO
// writes and ZERO sends (reads only). Authorization runs BEFORE any service-role
// read. Rejected for supplier/buyer/portal accounts and callers without an
// operator permission.

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

async function assertOperator(base44, user) {
  const record = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
  const caller = record || user;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions = {};
  try {
    permissions = typeof caller.permissions === 'string' ? JSON.parse(caller.permissions || '{}') : (caller.permissions || {});
  } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await assertOperator(base44, user))) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const campaignId = body.campaign_id || null;
    const leadData = body.lead || {};
    if (!campaignId) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

    const engine = await import('./routingEngine.generated.js');
    const svc = base44.asServiceRole;
    // The snapshot loader pre-loads real cap counts internally (read-only).
    const result = await engine.runSimulation(svc, { campaignId, leadData, nowMs: Date.now() });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
