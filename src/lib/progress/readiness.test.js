import { describe, it, expect } from 'vitest';
import {
  pageReadiness,
  weightedAverage,
  migrationReadiness,
  evaluateGates,
  gateSummary,
  recommend,
  verificationStateFor,
  weightFor,
  UNVERIFIED_CEILING,
  P0_CEILING,
} from './readiness';

const page = (over = {}) => ({
  page_key: 'leads-sold',
  section_key: 'leads',
  section_label: 'Leads',
  route: '/leads/sold',
  route_type: 'page',
  criticality: 'normal',
  lifecycle_status: 'not_started',
  ...over,
});

const perfectDimensions = JSON.stringify({
  functional_completeness: 100,
  backend_data_integrity: 100,
  metric_accuracy: 100,
  ux_responsive: 100,
  error_resilience: 100,
  security_permissions: 100,
  performance: 100,
});

const passingChecks = (over = {}) => ([
  { check: 'automated_tests', result: 'pass', evidence_type: 'test', ...over },
  { check: 'production_build', result: 'pass', evidence_type: 'code', ...over },
  { check: 'functional_acceptance', result: 'pass', evidence_type: 'runtime', ...over },
  { check: 'reviewer_approval', result: 'pass', evidence_type: 'user_feedback', ...over },
]);

describe('weights', () => {
  it('maps criticality to the documented weights', () => {
    expect(weightFor(page({ criticality: 'critical' }))).toBe(5);
    expect(weightFor(page({ criticality: 'high' }))).toBe(3);
    expect(weightFor(page({ criticality: 'normal' }))).toBe(1);
    expect(weightFor(page({ criticality: 'low' }))).toBe(0.5);
  });

  it('lets an explicit readiness_weight override criticality', () => {
    expect(weightFor(page({ criticality: 'low', readiness_weight: 8 }))).toBe(8);
  });
});

describe('lifecycle is a ceiling, not a score', () => {
  it('caps a perfectly scored page at its lifecycle ceiling', () => {
    const r = pageReadiness(page({ lifecycle_status: 'in_progress', dimension_scores: perfectDimensions }));
    expect(r.score).toBe(40);
    expect(r.explanation.applied_caps.map((c) => c.cap)).toContain('lifecycle');
  });

  it('scores an unassessed page at zero rather than skipping it', () => {
    expect(pageReadiness(page()).score).toBe(0);
  });

  it('keeps the achieved score for a blocked page but flags it', () => {
    const r = pageReadiness(page({
      lifecycle_status: 'blocked',
      blocked_reason: 'Waiting on Morne for DNS',
      dimension_scores: JSON.stringify({ functional_completeness: 100, backend_data_integrity: 100 }),
    }));
    expect(r.blocked).toBe(true);
    expect(r.score).toBe(50); // 25 + 25 of weight, unassessed dimensions score zero
    expect(r.explanation.reasons.join(' ')).toContain('Waiting on Morne');
  });
});

describe('verification is evidence gated', () => {
  it('caps a page marked verified at 70 when no verification records exist', () => {
    const r = pageReadiness(page({ lifecycle_status: 'verified', dimension_scores: perfectDimensions }));
    expect(r.score).toBe(UNVERIFIED_CEILING);
    expect(r.verification_status).toBe('unverified');
    expect(r.explanation.applied_caps.map((c) => c.cap)).toContain('verification');
  });

  it('reaches 100 only with the full set of passing checks', () => {
    const r = pageReadiness(
      page({ lifecycle_status: 'verified', dimension_scores: perfectDimensions }),
      { verifications: passingChecks() },
    );
    expect(r.verification_status).toBe('verified');
    expect(r.score).toBe(100);
  });

  it('does not treat needs_env as a pass', () => {
    const checks = passingChecks();
    checks[0] = { check: 'automated_tests', result: 'needs_env', evidence_type: 'unknown' };
    const state = verificationStateFor(checks);
    expect(state.verified).toBe(false);
    expect(state.missing_checks).toContain('automated_tests');
  });

  it('ignores superseded records so a stale pass cannot carry a page', () => {
    const checks = passingChecks({ superseded: true });
    expect(verificationStateFor(checks).status).toBe('unverified');
  });

  it('lets one failure outrank a later pass on the same check', () => {
    const state = verificationStateFor([
      { check: 'automated_tests', result: 'pass', evidence_type: 'test' },
      { check: 'automated_tests', result: 'fail', evidence_type: 'test' },
    ]);
    expect(state.status).toBe('failed');
  });
});

describe('open P0 findings', () => {
  it('caps the page at the P0 ceiling', () => {
    const r = pageReadiness(
      page({ lifecycle_status: 'verified', dimension_scores: perfectDimensions }),
      {
        verifications: passingChecks(),
        findings: [{ priority: 'P0', status: 'open', title: 'Sold count disagrees with Leads page' }],
      },
    );
    expect(r.score).toBe(P0_CEILING);
    expect(r.open_p0).toBe(1);
  });

  it('does not let an unconfirmed P0 claim cap the score', () => {
    const r = pageReadiness(
      page({ lifecycle_status: 'verified', dimension_scores: perfectDimensions }),
      {
        verifications: passingChecks(),
        findings: [{ priority: 'P0', status: 'open', requires_verification: true, title: 'AI thinks revenue is wrong' }],
      },
    );
    expect(r.score).toBe(100);
    expect(r.explanation.reasons.join(' ')).toContain('unconfirmed P0');
  });
});

describe('aggregates', () => {
  it('weights critical surfaces more heavily than low ones', () => {
    const avg = weightedAverage([
      { score: 0, weight: 5, scored: true },
      { score: 100, weight: 1, scored: true },
    ]);
    expect(avg.value).toBeCloseTo(16.7, 1);
  });

  it('excludes non-scoring surfaces such as redirects', () => {
    const r = pageReadiness(page({ route_type: 'redirect', lifecycle_status: 'not_started' }));
    expect(r.scored).toBe(false);
    expect(weightedAverage([r, { score: 100, weight: 1, scored: true }]).value).toBe(100);
  });
});

describe('migration readiness', () => {
  const req = (over = {}) => ({
    capability_key: 'routing.ping_post',
    group_key: 'routing',
    capability: 'Ping-post',
    status: 'not_assessed',
    migration_risk: 'medium',
    evidence_type: 'unknown',
    required_for_cutover: true,
    ...over,
  });

  it('excludes capabilities that are not required for cutover', () => {
    const m = migrationReadiness([req(), req({ capability_key: 'x', required_for_cutover: false })]);
    expect(m.counted).toBe(1);
    expect(m.excluded_not_required).toBe(1);
  });

  it('downgrades verified to unverified when the evidence is only inference', () => {
    const m = migrationReadiness([req({ status: 'verified', evidence_type: 'inference' })]);
    expect(m.value).toBe(70);
  });

  it('accepts verified when evidence is observed', () => {
    const m = migrationReadiness([req({ status: 'verified', evidence_type: 'runtime' })]);
    expect(m.value).toBe(100);
  });
});

describe('release gates', () => {
  const gate = (over = {}) => ({
    gate_key: 'no_open_p0',
    title: 'No unresolved P0 defects',
    blocking: true,
    status: 'not_started',
    evaluation_mode: 'automatic',
    auto_rule: 'no_open_findings_at_severity:P0',
    ...over,
  });

  it('computes automatic gates from real records', () => {
    const passing = evaluateGates([gate()], { findings: [], pageResults: [], pages: [], requirements: [] });
    expect(passing[0].computed_status).toBe('passing');

    const failing = evaluateGates([gate()], {
      findings: [{ priority: 'P0', status: 'open', title: 'Duplicate delivery observed' }],
      pageResults: [], pages: [], requirements: [],
    });
    expect(failing[0].computed_status).toBe('failing');
    expect(failing[0].computed_evidence).toContain('Duplicate delivery observed');
  });

  it('cannot pass a gate that has nothing to measure', () => {
    const g = evaluateGates([gate({ gate_key: 'crit', auto_rule: 'all_critical_pages_verified' })], {
      findings: [], pageResults: [], pages: [], requirements: [],
    });
    expect(g[0].computed_status).toBe('not_started');
  });

  it('never counts a waived blocking gate as passing', () => {
    const s = gateSummary([{ gate_key: 'a', title: 'A', blocking: true, computed_status: 'waived' }]);
    expect(s.blocking_passing).toBe(0);
    expect(s.blocking_waived).toBe(1);
    expect(s.failing_gates).toHaveLength(1);
  });
});

describe('recommendation cannot be gamed by a high average', () => {
  const perfectInputs = () => ({
    platform: { value: 100, counted: 60 },
    migration: { value: 100, counted: 40, evidence_coverage: 100 },
    gates: gateSummary([{ gate_key: 'a', title: 'A', blocking: true, computed_status: 'passing' }]),
    findings: [],
    pages: [],
    requirements: [],
  });

  it('says ready only when everything genuinely holds', () => {
    expect(recommend(perfectInputs()).recommendation).toBe('ready');
  });

  it('is capped at not ready by a single confirmed open P0 despite a perfect average', () => {
    const input = perfectInputs();
    input.findings = [{ priority: 'P0', status: 'open', title: 'Buyer isolation leak' }];
    const out = recommend(input);
    expect(out.recommendation).toBe('not_ready');
    expect(out.blockers.join(' ')).toContain('P0');
  });

  it('is capped at not ready by a failing blocking gate despite a perfect average', () => {
    const input = perfectInputs();
    input.gates = gateSummary([{ gate_key: 'a', title: 'Rollback tested', blocking: true, computed_status: 'failing', computed_evidence: 'never run' }]);
    const out = recommend(input);
    expect(out.recommendation).toBe('not_ready');
    expect(out.blockers.join(' ')).toContain('Rollback tested');
  });

  it('reports low confidence when the score rests on inference', () => {
    const input = perfectInputs();
    input.migration.evidence_coverage = 10;
    const out = recommend(input);
    expect(out.confidence).toBe('low');
    expect(out.assumptions.join(' ')).toContain('evidence');
  });

  it('surfaces unassessed work as an assumption rather than hiding it', () => {
    const input = perfectInputs();
    input.requirements = [{ status: 'not_assessed' }, { status: 'not_assessed' }];
    expect(recommend(input).assumptions.join(' ')).toContain('not yet assessed');
  });
});
