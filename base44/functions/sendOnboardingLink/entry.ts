import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Email a per-buyer onboarding link to the buyer contact. Operator only.
// Returns JSON only and never logs secrets.
//
// Access rules match mintOnboardingLink/entry.ts:
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
    const linkBase = body.link_base;
    if (!buyerId || !linkBase) {
      return Response.json({ error: 'buyer_id and link_base are required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
    if (!buyer) return Response.json({ error: 'Buyer not found' }, { status: 404 });

    const list = await svc.entities.BuyerOnboarding.filter({ buyer_id: buyerId });
    const onboarding = (Array.isArray(list) ? list : [])
      .find((o) => ACTIVE_ONBOARDING_STATUSES.includes(o.status));
    if (!onboarding) {
      return Response.json({ error: 'No onboarding link for this buyer. Generate it first.' }, { status: 404 });
    }

    const to = buyer.email;
    if (!to) {
      return Response.json({ error: 'This buyer has no contact email.' }, { status: 400 });
    }

    const link = `${linkBase}/apply?token=${onboarding.token}`;

    const tplList = await svc.entities.OnboardingEmailTemplate.filter({ event: 'invite' });
    const tpl = (Array.isArray(tplList) ? tplList : [])[0] || null;
    const vars: Record<string, string> = {
      company_name: buyer.company_name || '',
      contact_name: 'there',
      buyer_code: buyer.buyer_code || '',
      vertical: buyer.vertical || '',
      link,
    };
    const renderTpl = (s: unknown) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k]) : ''));
    const subject = tpl && tpl.subject
      ? renderTpl(tpl.subject)
      : ('Complete your Legenex onboarding' + (buyer.company_name ? ' - ' + buyer.company_name : ''));
    const body_text = tpl && tpl.body
      ? renderTpl(tpl.body)
      : `Hi,\n\nPlease complete your onboarding for ${buyer.company_name || 'your account'} using the secure link below. Your vertical and account details are already set up, so you only need to fill in the remaining information.\n\n${link}\n\nThank you,\nThe Legenex Team`;

    await svc.functions.invoke('sendGmail', { to, subject, body: body_text });

    const link_sent_at = new Date().toISOString();
    await svc.entities.BuyerOnboarding.update(onboarding.id, { link_sent_at });

    return Response.json({ ok: true, link_sent_at, to });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});