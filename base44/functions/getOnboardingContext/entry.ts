import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// PUBLIC endpoint. The token is the credential, so there is no operator gate
// and no auth.me call. Resolves an onboarding token to a strict allowlist of
// display-only fields used to prefill the public /apply form. Never returns
// credentials, email, billing, or any other field. Returns JSON only and never
// logs secrets.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const token = body.token;
    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    const svc = base44.asServiceRole;

    const list = await svc.entities.BuyerOnboarding.filter({ token });
    const onboarding = (Array.isArray(list) ? list : [])[0];
    if (!onboarding) return Response.json({ error: 'Invalid or expired link.' }, { status: 404 });

    if (onboarding.status === 'complete' || onboarding.status === 'cancelled') {
      return Response.json({ error: 'This onboarding link is no longer active.' }, { status: 410 });
    }

    const buyer = onboarding.buyer_id
      ? await svc.entities.Buyer.get(onboarding.buyer_id).catch(() => null)
      : null;

    return Response.json({
      company_name: (buyer && buyer.company_name) || onboarding.company_name || '',
      vertical: (buyer && buyer.vertical) || '',
      client_type: (buyer && buyer.client_type) || '',
      buyer_code: (buyer && buyer.buyer_code) || '',
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});