// Progress Control Center readiness model.
//
// Pure functions, no I/O. Everything the Command Center displays as a percentage
// comes from here, and every number carries an explanation object so the score
// can be opened up rather than trusted.
//
// The model exists to make the number HARD TO FAKE:
//
//   1. A lifecycle status is a ceiling, not a score. A page marked in progress
//      cannot score above 40 no matter how good its dimension scores look.
//   2. Verified is evidence gated. Without passing VerificationRecords a page is
//      capped at the implemented-but-unverified ceiling, so "the developer said
//      it is done" tops out at 70.
//   3. An open P0 caps the surface it sits on and caps the whole recommendation.
//   4. A failing blocking release gate caps the recommendation at not ready
//      regardless of how high the weighted average is.
//   5. Evidence coverage is tracked separately and drives confidence, so a high
//      score built on inference reports as low confidence rather than as ready.

/* -------------------------------------------------------------- *
 * Constants
 * -------------------------------------------------------------- */

export const CRITICALITY_WEIGHTS = {
  critical: 5,
  high: 3,
  normal: 1,
  low: 0.5,
};

// Percent contribution of each readiness dimension. Sums to 100.
export const DIMENSIONS = [
  { key: 'functional_completeness', label: 'Functional completeness', weight: 25 },
  { key: 'backend_data_integrity', label: 'Backend and data integrity', weight: 25 },
  { key: 'metric_accuracy', label: 'Metric and reporting accuracy', weight: 20 },
  { key: 'ux_responsive', label: 'User experience and responsive behaviour', weight: 10 },
  { key: 'error_resilience', label: 'Error handling and resilience', weight: 10 },
  { key: 'security_permissions', label: 'Security and permissions', weight: 5 },
  { key: 'performance', label: 'Performance', weight: 5 },
];

export const LIFECYCLE_CEILINGS = {
  not_started: 0,
  defined: 15,
  in_progress: 40,
  implemented_unverified: 70,
  verified: 100,
  blocked: null, // keeps whatever was achieved, flagged separately
};

// Ceiling applied until evidence-backed verification exists.
export const UNVERIFIED_CEILING = 70;

// Ceiling applied to any surface carrying an open P0.
export const P0_CEILING = 40;

// Route types that are inventoried but carry no readiness weight of their own.
export const NON_SCORING_ROUTE_TYPES = ['redirect', 'catchall'];

// Checks that must pass before a page may be called verified.
export const REQUIRED_VERIFICATION_CHECKS = [
  'automated_tests',
  'production_build',
  'functional_acceptance',
  'reviewer_approval',
];

export const EVIDENCE_BACKED_TYPES = ['code', 'runtime', 'screenshot', 'data', 'test', 'user_feedback'];

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));
const round1 = (n) => Math.round(n * 10) / 10;

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

/* -------------------------------------------------------------- *
 * Weights
 * -------------------------------------------------------------- */

export function weightFor(page) {
  if (Number.isFinite(page?.readiness_weight) && page.readiness_weight > 0) return page.readiness_weight;
  return CRITICALITY_WEIGHTS[page?.criticality] ?? CRITICALITY_WEIGHTS.normal;
}

export function isScored(page) {
  if (!page) return false;
  return !NON_SCORING_ROUTE_TYPES.includes(page.route_type);
}

/* -------------------------------------------------------------- *
 * Verification
 * -------------------------------------------------------------- */

// A page is verified only when every required check has a passing record that
// has not been superseded by a later commit. needs_env never counts as a pass.
export function verificationStateFor(records = []) {
  const live = records.filter((r) => !r.superseded);
  const byCheck = {};
  live.forEach((r) => {
    const prior = byCheck[r.check];
    // Worst result wins, so one failure is not hidden by a later pass record.
    if (!prior || rank(r.result) < rank(prior.result)) byCheck[r.check] = r;
  });

  const missing = REQUIRED_VERIFICATION_CHECKS.filter((c) => !byCheck[c] || byCheck[c].result !== 'pass');
  const anyFail = Object.values(byCheck).some((r) => r.result === 'fail');
  const anyPass = Object.values(byCheck).some((r) => r.result === 'pass');

  let status = 'unverified';
  if (anyFail) status = 'failed';
  else if (missing.length === 0) status = 'verified';
  else if (anyPass) status = 'partial';

  return {
    status,
    verified: status === 'verified',
    missing_checks: missing,
    checks: byCheck,
  };
}

function rank(result) {
  return { fail: 0, needs_env: 1, partial: 2, pass: 3, not_applicable: 4 }[result] ?? 1;
}

/* -------------------------------------------------------------- *
 * Page readiness
 * -------------------------------------------------------------- */

export function pageReadiness(page, { findings = [], verifications = [] } = {}) {
  const reasons = [];
  const lifecycle = page?.lifecycle_status || 'not_started';
  const scores = parseJson(page?.dimension_scores, null);

  // 1. Dimensional score, when dimensions have been assessed.
  let dimensional = null;
  const dimensionDetail = [];
  if (scores && typeof scores === 'object') {
    let total = 0;
    let assessedWeight = 0;
    DIMENSIONS.forEach((d) => {
      const raw = scores[d.key];
      const assessed = Number.isFinite(raw);
      const value = assessed ? clamp(raw) : 0;
      total += (value * d.weight) / 100;
      if (assessed) assessedWeight += d.weight;
      dimensionDetail.push({ ...d, value, assessed, contribution: round1((value * d.weight) / 100) });
    });
    dimensional = round1(total);
    if (assessedWeight < 100) {
      reasons.push(`Only ${assessedWeight} percent of dimension weight has been assessed; unassessed dimensions score zero.`);
    }
  } else {
    DIMENSIONS.forEach((d) => dimensionDetail.push({ ...d, value: 0, assessed: false, contribution: 0 }));
  }

  // 2. Lifecycle ceiling.
  const lifecycleCeiling = LIFECYCLE_CEILINGS[lifecycle];
  const blocked = lifecycle === 'blocked';

  // 3. Verification ceiling. Trust is not evidence.
  const verification = verificationStateFor(verifications);
  const verificationCeiling = verification.verified ? 100 : UNVERIFIED_CEILING;

  // 4. Finding ceiling.
  const openFindings = findings.filter((f) => ['open', 'acknowledged'].includes(f.status || 'open'));
  const openP0 = openFindings.filter((f) => f.priority === 'P0' && !f.requires_verification);
  const unconfirmedP0 = openFindings.filter((f) => f.priority === 'P0' && f.requires_verification);
  const findingCeiling = openP0.length > 0 ? P0_CEILING : 100;

  // 5. Combine. Every ceiling is a hard cap, never an average.
  let score = dimensional == null ? (lifecycleCeiling ?? 0) : dimensional;
  const caps = [];
  if (!blocked && lifecycleCeiling != null && score > lifecycleCeiling) {
    caps.push({ cap: 'lifecycle', to: lifecycleCeiling, why: `Lifecycle is ${lifecycle.replace(/_/g, ' ')}.` });
    score = lifecycleCeiling;
  }
  if (score > verificationCeiling) {
    caps.push({
      cap: 'verification',
      to: verificationCeiling,
      why: `Not independently verified. Missing: ${verification.missing_checks.join(', ') || 'none'}.`,
    });
    score = verificationCeiling;
  }
  if (score > findingCeiling) {
    caps.push({ cap: 'open_p0', to: findingCeiling, why: `${openP0.length} open P0 finding(s) on this surface.` });
    score = findingCeiling;
  }

  if (blocked) {
    reasons.push(`Blocked: ${page?.blocked_reason || 'no reason recorded'}. Score reflects work achieved so far, not readiness.`);
  }
  if (unconfirmedP0.length > 0) {
    reasons.push(`${unconfirmedP0.length} unconfirmed P0 claim(s) excluded from the cap until evidence is attached.`);
  }

  // Evidence coverage: what share of the open findings and verifications rest on
  // observation rather than inference.
  const evidenceItems = [...openFindings, ...verifications.filter((v) => !v.superseded)];
  const backed = evidenceItems.filter((x) => EVIDENCE_BACKED_TYPES.includes(x.evidence_type)).length;
  const evidenceCoverage = evidenceItems.length === 0 ? null : round1((backed / evidenceItems.length) * 100);

  return {
    page_key: page?.page_key,
    score: round1(clamp(score)),
    weight: weightFor(page),
    scored: isScored(page),
    lifecycle,
    blocked,
    verification_status: verification.status,
    open_findings: openFindings.length,
    open_p0: openP0.length,
    evidence_coverage: evidenceCoverage,
    explanation: {
      dimensional_score: dimensional,
      dimensions: dimensionDetail,
      lifecycle_ceiling: lifecycleCeiling,
      verification_ceiling: verificationCeiling,
      finding_ceiling: findingCeiling,
      applied_caps: caps,
      reasons,
      formula: 'score = min(weighted dimensions, lifecycle ceiling, verification ceiling, open P0 ceiling)',
    },
  };
}

/* -------------------------------------------------------------- *
 * Aggregates
 * -------------------------------------------------------------- */

export function weightedAverage(items) {
  const scored = items.filter((i) => i.scored !== false && i.weight > 0);
  if (scored.length === 0) return { value: 0, total_weight: 0, counted: 0 };
  const totalWeight = scored.reduce((s, i) => s + i.weight, 0);
  const value = scored.reduce((s, i) => s + i.score * i.weight, 0) / totalWeight;
  return { value: round1(value), total_weight: round1(totalWeight), counted: scored.length };
}

export function sectionBreakdown(results, pages) {
  const byKey = new Map(pages.map((p) => [p.page_key, p]));
  const groups = {};
  results.forEach((r) => {
    const page = byKey.get(r.page_key);
    if (!page || r.scored === false) return;
    const key = page.section_key || 'other';
    if (!groups[key]) groups[key] = { section_key: key, section_label: page.section_label || key, items: [] };
    groups[key].items.push(r);
  });
  return Object.values(groups)
    .map((g) => ({
      section_key: g.section_key,
      section_label: g.section_label,
      pages: g.items.length,
      verified: g.items.filter((i) => i.verification_status === 'verified').length,
      blocked: g.items.filter((i) => i.blocked).length,
      open_p0: g.items.reduce((s, i) => s + i.open_p0, 0),
      readiness: weightedAverage(g.items).value,
    }))
    .sort((a, b) => a.readiness - b.readiness);
}

/* -------------------------------------------------------------- *
 * Migration readiness
 * -------------------------------------------------------------- */

export const REQUIREMENT_SCORES = {
  not_assessed: 0,
  not_started: 0,
  in_progress: 40,
  implemented_unverified: 70,
  verified: 100,
  blocked: 0,
  not_required: null,
};

export const RISK_WEIGHTS = { critical: 5, high: 3, medium: 1, low: 0.5 };

export function migrationReadiness(requirements = []) {
  const counted = requirements.filter((r) => r.required_for_cutover !== false && r.status !== 'not_required');
  const items = counted.map((r) => {
    let score = REQUIREMENT_SCORES[r.status] ?? 0;
    // Evidence gate: a capability claiming verified on inference alone is not verified.
    if (r.status === 'verified' && !EVIDENCE_BACKED_TYPES.includes(r.evidence_type)) {
      score = REQUIREMENT_SCORES.implemented_unverified;
    }
    return {
      capability_key: r.capability_key,
      group_key: r.group_key,
      score,
      weight: RISK_WEIGHTS[r.migration_risk] ?? RISK_WEIGHTS.medium,
      scored: true,
      evidence_backed: EVIDENCE_BACKED_TYPES.includes(r.evidence_type),
      blocked: r.status === 'blocked',
      parity: r.parity,
    };
  });

  const groups = {};
  items.forEach((i) => {
    const key = i.group_key || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(i);
  });

  const overall = weightedAverage(items);
  const evidenceBacked = items.filter((i) => i.evidence_backed).length;

  return {
    value: overall.value,
    counted: overall.counted,
    total_requirements: requirements.length,
    excluded_not_required: requirements.length - counted.length,
    blocked: items.filter((i) => i.blocked).length,
    gaps: counted.filter((r) => r.parity === 'gap').length,
    evidence_coverage: items.length === 0 ? null : round1((evidenceBacked / items.length) * 100),
    by_group: Object.entries(groups)
      .map(([group_key, list]) => ({
        group_key,
        requirements: list.length,
        readiness: weightedAverage(list).value,
        blocked: list.filter((i) => i.blocked).length,
      }))
      .sort((a, b) => a.readiness - b.readiness),
  };
}

/* -------------------------------------------------------------- *
 * Release gates
 * -------------------------------------------------------------- */

// Automatic gate rules. Each returns { status, evidence }.
export const AUTO_GATE_RULES = {
  'no_open_findings_at_severity:P0': ({ findings }) => {
    const open = findings.filter((f) => f.priority === 'P0' && ['open', 'acknowledged'].includes(f.status || 'open') && !f.requires_verification);
    return {
      status: open.length === 0 ? 'passing' : 'failing',
      evidence: open.length === 0 ? 'No confirmed open P0 findings.' : `${open.length} confirmed open P0 finding(s): ${open.slice(0, 5).map((f) => f.title || f.check_id).join('; ')}`,
    };
  },
  'no_open_findings_at_category:security': ({ findings }) => {
    const open = findings.filter((f) => (f.category === 'security' || f.finding_type === 'security') && ['open', 'acknowledged'].includes(f.status || 'open'));
    return {
      status: open.length === 0 ? 'passing' : 'failing',
      evidence: open.length === 0 ? 'No open security findings.' : `${open.length} open security finding(s).`,
    };
  },
  'all_critical_pages_verified': ({ pageResults, pages }) => {
    const byKey = new Map(pages.map((p) => [p.page_key, p]));
    const critical = pageResults.filter((r) => byKey.get(r.page_key)?.criticality === 'critical');
    const unverified = critical.filter((r) => r.verification_status !== 'verified');
    return {
      status: critical.length === 0 ? 'not_started' : (unverified.length === 0 ? 'passing' : 'failing'),
      evidence: critical.length === 0
        ? 'No pages are marked critical yet, so this gate cannot pass.'
        : `${critical.length - unverified.length} of ${critical.length} critical pages verified.`,
    };
  },
  'all_cutover_requirements_verified': ({ requirements }) => {
    const counted = requirements.filter((r) => r.required_for_cutover !== false && r.status !== 'not_required');
    const unverified = counted.filter((r) => r.status !== 'verified');
    return {
      status: counted.length === 0 ? 'not_started' : (unverified.length === 0 ? 'passing' : 'failing'),
      evidence: counted.length === 0
        ? 'No cutover requirements recorded, so this gate cannot pass.'
        : `${counted.length - unverified.length} of ${counted.length} cutover capabilities verified.`,
    };
  },
};

export function evaluateGates(gates = [], context = {}) {
  return gates.map((gate) => {
    if (gate.evaluation_mode !== 'automatic' || !AUTO_GATE_RULES[gate.auto_rule]) {
      return { ...gate, computed_status: gate.status, computed_evidence: gate.evidence || '', auto: false };
    }
    const out = AUTO_GATE_RULES[gate.auto_rule](context);
    return { ...gate, computed_status: out.status, computed_evidence: out.evidence, auto: true };
  });
}

// A gate blocks unless it is genuinely passing. Waived blocking gates are
// reported as waivers, never folded into the pass count.
export function gateSummary(evaluated = []) {
  const blocking = evaluated.filter((g) => g.blocking !== false);
  return {
    total: evaluated.length,
    passing: evaluated.filter((g) => g.computed_status === 'passing').length,
    failing: evaluated.filter((g) => g.computed_status === 'failing').length,
    not_started: evaluated.filter((g) => g.computed_status === 'not_started').length,
    waived: evaluated.filter((g) => g.computed_status === 'waived').length,
    blocking_total: blocking.length,
    blocking_passing: blocking.filter((g) => g.computed_status === 'passing').length,
    blocking_failing: blocking.filter((g) => ['failing', 'not_started', 'in_progress'].includes(g.computed_status)).length,
    blocking_waived: blocking.filter((g) => g.computed_status === 'waived').length,
    failing_gates: blocking.filter((g) => g.computed_status !== 'passing').map((g) => ({
      gate_key: g.gate_key,
      title: g.title,
      status: g.computed_status,
      evidence: g.computed_evidence,
    })),
  };
}

/* -------------------------------------------------------------- *
 * Recommendation
 * -------------------------------------------------------------- */

export const READY_THRESHOLD = 95;
export const CONDITIONAL_THRESHOLD = 80;

export function recommend({ platform, migration, gates, findings = [], pages = [], requirements = [] }) {
  const blockers = [];
  const evidence = [];
  const assumptions = [];

  const openP0 = findings.filter((f) => f.priority === 'P0' && ['open', 'acknowledged'].includes(f.status || 'open') && !f.requires_verification);
  if (openP0.length > 0) {
    blockers.push(`${openP0.length} confirmed open P0 finding(s). Any open P0 caps the recommendation at not ready.`);
  }

  gates.failing_gates.forEach((g) => {
    blockers.push(`Blocking release gate not passing: ${g.title} (${g.status}).`);
  });

  if (gates.blocking_waived > 0) {
    assumptions.push(`${gates.blocking_waived} blocking gate(s) waived rather than passed. A waiver is a decision, not evidence.`);
  }

  const unassessedPages = pages.filter((p) => (p.lifecycle_status || 'not_started') === 'not_started').length;
  if (unassessedPages > 0) {
    assumptions.push(`${unassessedPages} surface(s) have never been assessed and score zero, which drags the average down honestly rather than being skipped.`);
  }

  const unassessedReqs = requirements.filter((r) => r.status === 'not_assessed').length;
  if (unassessedReqs > 0) {
    assumptions.push(`${unassessedReqs} LeadByte capability requirement(s) not yet assessed. Migration readiness is unreliable until these are triaged.`);
  }

  if (migration.evidence_coverage != null && migration.evidence_coverage < 60) {
    assumptions.push(`Only ${migration.evidence_coverage} percent of migration statuses are backed by evidence rather than inference.`);
  }

  evidence.push(`Platform readiness ${platform.value} across ${platform.counted} weighted surfaces.`);
  evidence.push(`Migration readiness ${migration.value} across ${migration.counted} cutover capabilities.`);
  evidence.push(`${gates.blocking_passing} of ${gates.blocking_total} blocking release gates passing.`);

  let recommendation;
  if (blockers.length > 0) {
    recommendation = 'not_ready';
  } else if (migration.value >= READY_THRESHOLD && platform.value >= CONDITIONAL_THRESHOLD && gates.blocking_failing === 0) {
    recommendation = 'ready';
  } else if (migration.value >= CONDITIONAL_THRESHOLD) {
    recommendation = 'conditional';
  } else {
    recommendation = 'not_ready';
    blockers.push(`Migration readiness ${migration.value} is below the ${CONDITIONAL_THRESHOLD} threshold for even a conditional recommendation.`);
  }

  // Confidence is about the quality of the inputs, not the size of the number.
  const coverage = migration.evidence_coverage ?? 0;
  let confidence = 'low';
  if (coverage >= 80 && unassessedReqs === 0 && unassessedPages === 0) confidence = 'high';
  else if (coverage >= 50 && unassessedReqs <= 5) confidence = 'medium';

  return {
    recommendation,
    confidence,
    blockers,
    evidence,
    assumptions,
    next_actions: nextActions({ blockers, gates, requirements, pages }),
  };
}

function nextActions({ gates, requirements, pages }) {
  const actions = [];
  gates.failing_gates.slice(0, 3).forEach((g) => {
    actions.push({ priority: 1, action: `Close release gate: ${g.title}`, why: g.evidence });
  });
  const blockedReqs = requirements.filter((r) => r.status === 'blocked').slice(0, 3);
  blockedReqs.forEach((r) => {
    actions.push({ priority: 2, action: `Unblock capability: ${r.capability}`, why: r.open_gaps || 'No detail recorded.' });
  });
  const unassessed = requirements.filter((r) => r.status === 'not_assessed').length;
  if (unassessed > 0) {
    actions.push({ priority: 3, action: `Triage ${unassessed} unassessed LeadByte capabilities`, why: 'Migration readiness cannot be trusted while capabilities are unassessed.' });
  }
  const criticalUnverified = pages.filter((p) => p.criticality === 'critical' && p.verification_status !== 'verified').length;
  if (criticalUnverified > 0) {
    actions.push({ priority: 4, action: `Verify ${criticalUnverified} critical page(s)`, why: 'Critical surfaces cannot rest on developer sign-off alone.' });
  }
  return actions.sort((a, b) => a.priority - b.priority);
}
