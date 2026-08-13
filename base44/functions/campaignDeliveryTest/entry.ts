import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Caller model: OPERATOR-ONLY. Live outbound test of a single SubDelivery endpoint.
//
// SAFETY GATES (all enforced BEFORE any send):
//  1. Authorization: operator-only (isOperator), checked before service-role use.
//  2. Mode gate: disabled entirely unless AppSettings.distribution_mode is past
//     'legacy_only'. In production default (legacy_only) this always refuses.
//  3. Approval gate: the request MUST carry confirm === true. Without it, refused.
//  4. Audit: every live test writes a DistributionAudit record (who/when/target).
//
// Dry-run payload previews and response-mapping tests happen entirely in the
// browser and never call this function. This function is the ONLY path that
// performs a real outbound request, and only for an explicitly confirmed test.
//
// CREDENTIAL HARD RULE: the outbound secret is resolved server-side here from the
// sub-delivery's opaque credential_ref via secret storage. It is never accepted
// from the browser, never logged, and never returned in the response.

// Resolve credential_ref -> real auth headers from server-side secret storage.
// NEEDS-ENV: wired to the deployment secret store. Returns {} when unavailable so
// the test still runs (unauthenticated) rather than leaking or crashing.
async function resolveCredential(svc: any, ref: string): Promise<Record<string, string>> {
  if (!ref) return {};
  try {
    const rows = await svc.entities.IntegrationConfig.filter({ key: ref });
    const val = rows && rows[0] && rows[0].value;
    if (val && typeof val === 'string') return { Authorization: val };
  } catch { /* secret store not configured in this env */ }
  return {};
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const engine = await import('./routingEngine.generated.js');
    const record = await svc.entities.User.get(user.id).catch(() => null);
    if (!engine.isOperator(record || user)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Mode gate: live tests are disabled unless distribution is past legacy_only.
    const settingsArr = await svc.entities.AppSettings.list();
    const mode = String((settingsArr[0] && settingsArr[0].distribution_mode) || 'legacy_only');
    if (mode === 'legacy_only') {
      return Response.json({ ok: false, error: 'Live delivery tests are disabled while distribution_mode is legacy_only.' }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.confirm !== true) {
      return Response.json({ ok: false, error: 'Live test requires explicit operator confirmation (confirm=true).' }, { status: 428 });
    }
    const subId = String(body.sub_delivery_id || '');
    if (!subId) return Response.json({ ok: false, error: 'sub_delivery_id required' }, { status: 400 });

    const sd = await svc.entities.SubDelivery.get(subId).catch(() => null);
    if (!sd) return Response.json({ ok: false, error: 'sub-delivery not found' }, { status: 404 });
    const parent = await svc.entities.Delivery.get(sd.delivery_id).catch(() => null);

    // Audit the live test BEFORE sending.
    const nowIso = new Date().toISOString();
    await svc.entities.DistributionAudit.create({
      action: 'delivery_live_test', entity_type: 'SubDelivery', entity_id: subId,
      to_value: sd.target_url || '', reason: String(body.reason || 'operator live test'),
      actor_id: user.id, created_at: nowIso,
    });

    const cfg = engine.resolveSubDeliveryCfg(sd);
    const result = await engine.deliverDirectPost(
      {
        ...cfg,
        idempotencyKey: `test:${subId}:${Date.parse(nowIso)}`,
        leadId: String(body.lead_id || 'TEST-LEAD'),
        leadData: body.sample_lead && typeof body.sample_lead === 'object' ? body.sample_lead : {},
        isPrimary: false, trigger: 'operator_test',
      },
      {
        store: svc.entities.DeliveryAttempt
          ? engine.makeBase44AttemptStore(svc)
          : engine.makeInMemoryAttemptStore(),
        nowMs: Date.parse(nowIso), fetchImpl: globalThis.fetch, testMode: false,
        resolveCredential: (ref: string) => resolveCredential(svc, ref),
      },
    );

    // Return ONLY a masked outcome. Never echo credentials or the raw request.
    return Response.json({
      ok: true, mode, buyer_id: parent ? parent.buyer_id : null,
      result: { status: result.status, http_status: result.httpStatus, revenue: result.revenue,
        buyer_lead_id: result.buyerLeadId, error_class: result.errorClass || null },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
