import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Caller model: OPERATOR-ONLY. Route configuration lifecycle: create_draft,
// update_draft, validate, publish, pause, archive, rollback. Authorization runs
// BEFORE any service-role read/write via the shared isOperator predicate. Publish
// is fail-closed (server-side validation) and creates an IMMUTABLE
// RouteConfigVersion plus a DistributionAudit record. Published configs are never
// hard deleted (archive only, with a referential check).

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
    const action = String(body.action || '');
    const groupId = body.route_group_id || null;
    const nowIso = new Date().toISOString();
    const audit = (a: any) => svc.entities.DistributionAudit.create({ actor_id: user.id, created_at: nowIso, ...a });

    async function loadConfig(gid: string) {
      const groups = await svc.entities.RouteGroup.filter({ id: gid });
      const group = groups[0];
      if (!group) return null;
      const members = await svc.entities.RouteMember.filter({ route_group_id: gid }, 'priority', 500, 0);
      const buyerIds = [...new Set(members.map((m: any) => m.buyer_id).filter(Boolean))];
      const destIds = [...new Set(members.map((m: any) => m.destination_id).filter(Boolean))];
      const buyers = []; for (const id of buyerIds) { const r = await svc.entities.Buyer.filter({ id }); if (r[0]) buyers.push(r[0]); }
      const destinations = []; for (const id of destIds) { const r = await svc.entities.LeadByteConnector.filter({ id }); if (r[0]) destinations.push(r[0]); }
      return { group, members, buyers, destinations };
    }

    if (action === 'create_draft') {
      const g = await svc.entities.RouteGroup.create({ ...body.group, lifecycle: 'draft', active: false });
      await audit({ action: 'create_draft', entity_type: 'RouteGroup', entity_id: g.id });
      return Response.json({ ok: true, route_group_id: g.id });
    }
    if (action === 'update_draft') {
      const groups = await svc.entities.RouteGroup.filter({ id: groupId });
      if (!groups[0]) return Response.json({ error: 'not found' }, { status: 404 });
      if (groups[0].lifecycle === 'archived') return Response.json({ error: 'archived config is immutable' }, { status: 409 });
      await svc.entities.RouteGroup.update(groupId, { ...body.group });
      await audit({ action: 'update_draft', entity_type: 'RouteGroup', entity_id: groupId });
      return Response.json({ ok: true });
    }
    if (action === 'validate') {
      const cfg = await loadConfig(groupId);
      if (!cfg) return Response.json({ error: 'not found' }, { status: 404 });
      return Response.json(engine.validateConfigForPublish(cfg, Date.now()));
    }
    if (action === 'publish') {
      const cfg = await loadConfig(groupId);
      if (!cfg) return Response.json({ error: 'not found' }, { status: 404 });
      const result = engine.validateConfigForPublish(cfg, Date.now());
      if (!result.valid) return Response.json({ ok: false, errors: result.errors }, { status: 422 });
      const version = await svc.entities.RouteConfigVersion.create({
        route_group_id: groupId, campaign_id: cfg.group.campaign_id, config_hash: result.configHash,
        snapshot: engine.buildVersionSnapshot(cfg.group, cfg.members),
        published_by: user.id, published_at: nowIso, change_reason: String(body.change_reason || ''), status: 'published',
      });
      await svc.entities.RouteGroup.update(groupId, {
        lifecycle: 'active', active: true, config_version_id: version.id, config_hash: result.configHash,
        published_by: user.id, published_at: nowIso, change_reason: String(body.change_reason || ''),
      });
      await audit({ action: 'publish', entity_type: 'RouteGroup', entity_id: groupId, to_value: result.configHash, reason: String(body.change_reason || '') });
      return Response.json({ ok: true, config_version_id: version.id, config_hash: result.configHash });
    }
    if (action === 'pause') {
      await svc.entities.RouteGroup.update(groupId, { lifecycle: 'paused', active: false });
      await audit({ action: 'pause', entity_type: 'RouteGroup', entity_id: groupId });
      return Response.json({ ok: true });
    }
    if (action === 'archive') {
      // No hard delete. Archive only. (Referential history preserved in RouteConfigVersion.)
      await svc.entities.RouteGroup.update(groupId, { lifecycle: 'archived', active: false });
      await audit({ action: 'archive', entity_type: 'RouteGroup', entity_id: groupId });
      return Response.json({ ok: true });
    }
    if (action === 'rollback') {
      const versions = await svc.entities.RouteConfigVersion.filter({ route_group_id: groupId }, '-published_at', 50, 0);
      const target = versions.find((v: any) => String(v.config_hash) === String(body.config_hash)) || versions[1];
      if (!target) return Response.json({ error: 'no prior version' }, { status: 404 });
      await svc.entities.RouteGroup.update(groupId, { config_version_id: target.id, config_hash: target.config_hash, lifecycle: 'active', active: true });
      await audit({ action: 'rollback', entity_type: 'RouteGroup', entity_id: groupId, to_value: target.config_hash });
      return Response.json({ ok: true, rolled_back_to: target.config_hash });
    }
    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
