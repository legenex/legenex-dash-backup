import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Allocates the next buyer_code for a given client_type. Reads and increments a
// per-prefix Counter using the service role, then returns the code. Never
// creates the Buyer record. Access rules mirror operationsData exactly.

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

// client_type -> buyer_code prefix. Anything else (including null) is rejected.
const PREFIX_BY_CLIENT_TYPE: Record<string, string> = {
  'Law Firm': 'LF',
  'Aggregator': 'AG',
  'Network': 'NW',
  'Reseller': 'RS',
};

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
    const clientType = body && typeof body.client_type === 'string' ? body.client_type : null;
    const prefix = clientType ? PREFIX_BY_CLIENT_TYPE[clientType] : null;
    if (!prefix) {
      return Response.json({
        error: 'A classified client_type is required to allocate a buyer code. Expected one of Law Firm, Aggregator, Network or Reseller.',
      }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const counterName = `buyer_code_${prefix}`;

    // Find or create the counter, then increment BEFORE returning so a crash can
    // never hand out the same number twice.
    const existing = await svc.entities.Counter.filter({ name: counterName }, '', 1);
    let counter = existing && existing.length ? existing[0] : null;
    if (!counter) {
      counter = await svc.entities.Counter.create({ name: counterName, value: 0, updated_at: new Date().toISOString() });
    }

    // Increment, checking for collisions against existing Buyer records. If the
    // counter has drifted behind reality, bump again and retry, up to five times.
    let lastError = 'Could not allocate a unique buyer code after several attempts.';
    for (let attempt = 0; attempt < 5; attempt++) {
      const nextValue = (Number(counter.value) || 0) + 1;
      counter = await svc.entities.Counter.update(counter.id, {
        value: nextValue,
        updated_at: new Date().toISOString(),
      });
      const code = `${prefix}${nextValue}`;
      const clash = await svc.entities.Buyer.filter({ buyer_code: code }, '', 1);
      if (!clash || clash.length === 0) {
        return Response.json({ buyer_code: code });
      }
      lastError = `Buyer code ${code} already exists; counter has drifted.`;
    }

    return Response.json({ error: lastError }, { status: 409 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});