import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Caller model: OPERATOR-ONLY. Audited distribution_mode transition. This is the
// ONLY sanctioned way to change AppSettings.distribution_mode: it validates the
// transition, writes a DistributionAudit record (who/when/from/to/reason), then
// updates the setting. Authorization runs BEFORE any service-role access.

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

    const body = await req.json().catch(() => ({}));
    const to = String(body.mode || '');
    const settingsArr = await svc.entities.AppSettings.list();
    const settings = settingsArr[0] || null;
    const from = String((settings && settings.distribution_mode) || 'legacy_only');

    const check = engine.validateModeTransition(from, to);
    if (!check.valid) return Response.json({ ok: false, error: check.error }, { status: 400 });

    const nowIso = new Date().toISOString();
    await svc.entities.DistributionAudit.create(
      engine.buildModeAudit({ from, to, actorId: user.id, reason: String(body.reason || ''), nowMs: Date.parse(nowIso) }),
    );
    if (settings) await svc.entities.AppSettings.update(settings.id, { distribution_mode: to });
    else await svc.entities.AppSettings.create({ distribution_mode: to });
    return Response.json({ ok: true, from, to });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
