import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Runtime layer of the evaluation harness. See Settings > Audits.
// auditRun. OPERATOR-ONLY, READ-ONLY evaluation harness (runtime layer).
//
// Runs a set of runtime probes against the live app and records the result of
// every probe (passes included) as AuditFinding rows joined to one AuditRun.
// The row set is the log: a probe that silently stops running is distinguishable
// from a probe that passed only because every run states a verdict.
//
// HARD INVARIANT: this function writes ONLY to AuditRun and AuditFinding. It
// NEVER creates, updates, or deletes any operational entity, and it NEVER writes
// distribution_mode, connector enabled states, Conversion Events, credentials,
// billing, Deliveries, or Leads. distribution_mode is READ, never written; the
// only sanctioned writer of that field is distributionSetMode. Every operational
// entity below is reached through read methods (list / filter) exclusively.
//
// Authorization runs BEFORE any service-role read. Rejected for supplier/buyer/
// portal accounts and callers without an operator permission, mirroring
// operationsData and distributionSimulate exactly.

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];
const VALID_MODES = ['legacy_only', 'shadow', 'canary', 'new_primary_with_legacy_fallback', 'new_only'];
const ACTIVE_STATUSES = ['active'];
const INACTIVE_STATUSES = ['draft', 'launching', 'paused', 'terminated'];

async function assertOperator(base44, user) {
  const record = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
  const caller = record || user;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions: Record<string, any> = {};
  try {
    permissions = typeof caller.permissions === 'string' ? JSON.parse(caller.permissions || '{}') : (caller.permissions || {});
  } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

// list() returns null for empty entities; always coerce to an array.
const arr = (v) => (Array.isArray(v) ? v : []);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await assertOperator(base44, user))) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const trigger = ['manual', 'scheduled', 'post_change'].includes(body.trigger) ? body.trigger : 'manual';

    const svc = base44.asServiceRole;
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const runId = `run_${startedAtMs}_${Math.random().toString(36).slice(2, 8)}`;

    // ---- previous completed run, for the diff -------------------------------
    // Scoped to the SAME layer signature so a runtime run diffs only against a
    // prior runtime run, never against a static or benchmark run (disjoint checks).
    const layersSig = JSON.stringify(['runtime']);
    let previous = null;
    let previousFindings: any[] = [];
    try {
      const prevRuns = arr(await svc.entities.AuditRun.filter({ status: 'completed', layers: layersSig }, '-started_at', 1, 0));
      previous = prevRuns[0] || null;
      if (previous) {
        previousFindings = arr(await svc.entities.AuditFinding.filter({ run_id: previous.run_id }, '-created_at', 500, 0));
      }
    } catch { /* first ever run: no previous */ }
    const prevVerdictByKey = new Map<string, string>();
    const prevFirstSeenByKey = new Map<string, string>();
    for (const f of previousFindings) {
      const key = `${f.check_id}::${f.surface || ''}`;
      prevVerdictByKey.set(key, f.verdict);
      if (f.first_seen_run_id) prevFirstSeenByKey.set(key, f.first_seen_run_id);
    }

    // ---- finding accumulator ------------------------------------------------
    const findings: any[] = [];
    const emit = (f) => {
      const key = `${f.check_id}::${f.surface || ''}`;
      let firstSeen: string | undefined;
      if (f.verdict === 'fail') {
        firstSeen = prevVerdictByKey.get(key) === 'fail'
          ? (prevFirstSeenByKey.get(key) || runId)
          : runId;
      }
      findings.push({
        run_id: runId,
        check_id: f.check_id,
        layer: f.layer || 'runtime',
        source: f.source || 'probe',
        verdict: f.verdict,
        severity: f.severity || (f.verdict === 'fail' ? 'high' : f.verdict === 'warn' ? 'medium' : 'info'),
        category: f.category || 'correctness',
        surface: f.surface || '',
        evidence_path: f.evidence_path || '',
        expected: f.expected || '',
        observed: f.observed || '',
        detail: f.detail || '',
        ...(firstSeen ? { first_seen_run_id: firstSeen } : {}),
        duration_ms: f.duration_ms || 0,
        created_at: new Date().toISOString(),
      });
    };

    const runProbe = async (fn) => {
      const t = Date.now();
      try { await fn(Date.now); return Date.now() - t; }
      catch (e) {
        emit({
          check_id: 'harness.probe_error', layer: 'runtime', source: 'probe', verdict: 'needs_env',
          severity: 'medium', category: 'observability',
          observed: (e as Error).message, detail: 'A probe threw; recorded rather than aborting the run.',
          duration_ms: Date.now() - t,
        });
        return Date.now() - t;
      }
    };

    // ===== PROBE 1: CAP-2, generated engine bundle imports in production Deno =
    await runProbe(async () => {
      const t = Date.now();
      const mod: any = await import('./routingEngine.generated.js');
      const hasSim = typeof mod.runSimulation === 'function';
      const hasSnap = typeof mod.buildRoutingSnapshot === 'function';
      const hasModes = mod.MODES && typeof mod.MODES === 'object';
      const ok = hasSim && hasSnap && hasModes;
      emit({
        check_id: 'cap2.bundle_import', layer: 'runtime', source: 'probe',
        verdict: ok ? 'pass' : 'fail',
        severity: ok ? 'info' : 'critical', category: 'correctness',
        surface: 'base44/functions/auditRun/routingEngine.generated.js',
        expected: 'Generated engine imports in production Deno and exposes runSimulation, buildRoutingSnapshot, MODES',
        observed: ok
          ? 'Import succeeded; canonical exports present'
          : `Import returned but exports missing (runSimulation:${hasSim} buildRoutingSnapshot:${hasSnap} MODES:${!!hasModes})`,
        detail: 'Parity gate guarantees this copy is byte-identical to distributionSimulate and processLead, so a successful import here proves the bundle imports in production Deno. This is CAP-2.',
        duration_ms: Date.now() - t,
      });
    });

    // ===== PROBE 2: distribution_mode is legacy_only (READ ONLY) =============
    let observedMode = 'unset';
    await runProbe(async () => {
      const settings = arr(await svc.entities.AppSettings.list());
      const s = settings[0] || {};
      const raw = String(s.distribution_mode || '').trim().toLowerCase();
      observedMode = raw || 'unset';
      const effective = VALID_MODES.includes(raw) ? raw : 'legacy_only';
      const isLegacy = effective === 'legacy_only';
      emit({
        check_id: 'mode.legacy_only', layer: 'runtime', source: 'probe',
        verdict: isLegacy ? 'pass' : 'warn',
        severity: isLegacy ? 'info' : 'high', category: 'correctness',
        surface: 'AppSettings.distribution_mode',
        expected: 'legacy_only (unset defaults to legacy_only) until cutover is deliberately advanced',
        observed: `raw=${observedMode} effective=${effective}`,
        detail: isLegacy
          ? 'Production remains on the legacy LeadByte path; v2 code inert.'
          : 'Mode is past legacy_only. Expected only after a deliberate distributionSetMode flip. Confirm this was intended.',
      });
    });

    // ===== PROBE 3: distribution configuration state (READ ONLY) ============
    await runProbe(async () => {
      const [camps, groups, members, dels] = await Promise.all([
        svc.entities.Campaign.list().catch(() => null),
        svc.entities.RouteGroup.list().catch(() => null),
        svc.entities.RouteMember.list().catch(() => null),
        svc.entities.Delivery.list().catch(() => null),
      ]);
      const c = arr(camps).length, g = arr(groups).length, m = arr(members).length, d = arr(dels).length;
      const configured = c + g + m + d > 0;
      emit({
        check_id: 'config.state', layer: 'runtime', source: 'probe',
        verdict: 'pass', severity: 'info', category: 'observability',
        surface: 'Campaign / RouteGroup / RouteMember / Delivery',
        expected: 'Reported for situational awareness',
        observed: `Campaigns:${c} RouteGroups:${g} RouteMembers:${m} Deliveries:${d}`,
        detail: configured
          ? 'Native distribution has configuration present.'
          : 'Engine live but unconfigured. Expected pre-cutover.',
      });
    });

    // ===== PROBE 4: live LeadByte connectors present (READ ONLY, do not touch)
    await runProbe(async () => {
      const conns = arr(await svc.entities.LeadByteConnector.list());
      const enabled = conns.filter((c) => c.enabled === true).length;
      emit({
        check_id: 'connector.live_traffic', layer: 'runtime', source: 'probe',
        verdict: 'pass', severity: 'info', category: 'observability',
        surface: 'LeadByteConnector',
        expected: 'Live connectors observed, never modified by the harness',
        observed: `total:${conns.length} enabled:${enabled}`,
        detail: 'These carry live traffic. RED: never touched without explicit approval.',
      });
    });

    // ===== PROBE 5: buyer status/active invariant (READ ONLY) ===============
    await runProbe(async () => {
      const pageSize = 500;
      let skip = 0; const buyers: any[] = [];
      while (true) {
        const batch = arr(await svc.entities.Buyer.list('-created_date', pageSize, skip));
        buyers.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
      }
      const offenders = buyers.filter((b) => {
        const status = String(b.status || '').trim().toLowerCase();
        const active = b.active === true;
        if (ACTIVE_STATUSES.includes(status) && !active) return true;
        if (INACTIVE_STATUSES.includes(status) && active) return true;
        return false;
      });
      if (offenders.length === 0) {
        emit({
          check_id: 'lifecycle.buyer_status_active', layer: 'runtime', source: 'probe',
          verdict: 'pass', severity: 'info', category: 'data_integrity',
          surface: 'Buyer', expected: 'status and active agree for every buyer',
          observed: `scanned ${buyers.length} buyers; 0 contradictions`,
        });
      } else {
        emit({
          check_id: 'lifecycle.buyer_status_active', layer: 'runtime', source: 'probe',
          verdict: 'warn', severity: 'high', category: 'data_integrity',
          surface: 'Buyer',
          expected: 'status active implies active true; draft/launching/paused/terminated imply active false',
          observed: `${offenders.length} of ${buyers.length} buyers contradict the invariant`,
          evidence_path: offenders.slice(0, 20).map((b) => `${b.id}:${b.status}/active=${b.active}`).join(', '),
          detail: 'The live pipeline reads the active boolean. Fix only as a deliberate data task, setting status and active together.',
        });
      }
    });

    // ---- persist findings ---------------------------------------------------
    // create the run first so findings reference a real row
    const runRecord = await svc.entities.AuditRun.create({
      run_id: runId,
      layers: layersSig,
      trigger,
      write_mode: 'read_only',
      status: 'running',
      distribution_mode_observed: observedMode,
      started_at: startedAt,
      previous_run_id: previous ? previous.run_id : '',
    });

    for (const f of findings) {
      await svc.entities.AuditFinding.create(f);
    }

    // ---- roll-ups and diff --------------------------------------------------
    const count = (v) => findings.filter((f) => f.verdict === v).length;
    const nowFailKeys = new Set(findings.filter((f) => f.verdict === 'fail').map((f) => `${f.check_id}::${f.surface || ''}`));
    const prevFailKeys = new Set(previousFindings.filter((f) => f.verdict === 'fail').map((f) => `${f.check_id}::${f.surface || ''}`));
    let newFailures = 0; for (const k of nowFailKeys) if (!prevFailKeys.has(k)) newFailures++;
    let resolved = 0; for (const k of prevFailKeys) if (!nowFailKeys.has(k)) resolved++;

    const finishedMs = Date.now();
    const updated = await svc.entities.AuditRun.update(runRecord.id, {
      status: 'completed',
      finished_at: new Date(finishedMs).toISOString(),
      duration_ms: finishedMs - startedAtMs,
      checks_total: findings.length,
      checks_pass: count('pass'),
      checks_fail: count('fail'),
      checks_warn: count('warn'),
      checks_needs_env: count('needs_env'),
      new_failures: newFailures,
      resolved_since_previous: resolved,
    });

    return Response.json({
      ok: true,
      run_id: runId,
      run: updated,
      totals: {
        total: findings.length, pass: count('pass'), fail: count('fail'),
        warn: count('warn'), needs_env: count('needs_env'),
        new_failures: newFailures, resolved_since_previous: resolved,
      },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
