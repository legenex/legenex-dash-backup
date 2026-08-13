import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Mint a per-buyer onboarding link record and token when a buyer is created.
// Operator only. This endpoint never sends email, never modifies the Buyer,
// returns JSON only, and never logs secrets.
//
// Access rules match operatorData/entry.ts:
// - Must be an authenticated Base44 session.
// - Rejected if base_role is supplier or buyer, or if linked_buyer_id /
//   linked_supplier_id is set (those are portal accounts, not operators).
// - Must have at least one operator permission set true, or role admin.

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

const ACTIVE_ONBOARDING_STATUSES = ['invited', 'submitted', 'in_progress', 'blocked'];

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
    const buyerId = body.buyer_id;
    if (!buyerId) return Response.json({ error: 'buyer_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;

    const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
    if (!buyer) return Response.json({ error: 'Buyer not found' }, { status: 404 });

    if (buyer.auto_created) {
      return Response.json({ error: 'Auto-created buyers do not get onboarding links.' }, { status: 400 });
    }

    // Idempotency: if there is already an active onboarding record for this
    // buyer, return its token without creating a new one.
    const existingList = await svc.entities.BuyerOnboarding.filter({ buyer_id: buyerId });
    const existing = (Array.isArray(existingList) ? existingList : [])
      .find((o) => ACTIVE_ONBOARDING_STATUSES.includes(o.status));
    if (existing) {
      return Response.json({ token: existing.token, onboarding_id: existing.id, reused: true });
    }

    const token = crypto.randomUUID().replace(/-/g, '');
    const created = await svc.entities.BuyerOnboarding.create({
      buyer_id: buyerId,
      company_name: buyer.company_name,
      status: 'invited',
      token,
    });

    return Response.json({ token, onboarding_id: created.id, reused: false });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});