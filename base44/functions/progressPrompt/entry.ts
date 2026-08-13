import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { callLLM } from './llmClient.generated.js';
import { verificationStateFor } from './readiness.js';

// Prompt Studio generator.
//
// Turns a ChangeRequest plus its findings, Nick's own comments, and the real
// dependency graph into an implementation prompt for a coding agent or a human.
//
// Three things this deliberately does NOT do:
//   1. It never dispatches. The output is a PromptDraft in status draft. Sending
//      it anywhere is a human action taken outside this function.
//   2. It never invents evidence. Everything in the assembled context comes from
//      records; the model writes the brief, it does not supply the facts.
//   3. It never decides whether a surface is RED. That is a deterministic code
//      check below, because an LLM getting it wrong once is one time too many.
//
// Access: operator session, admin role or progress_write.
// Writes: PromptDraft only.

const RED_SURFACES = [
  { key: 'processLead', label: 'processLead pipeline', match: (s: string) => /processlead/i.test(s) },
  { key: 'leadbyte_connectors', label: 'the four live LeadByteConnectors and their enabled states', match: (s: string) => /leadbyteconnector|leadbytewebhook|\/deliveries/i.test(s) },
  { key: 'conversion_events', label: 'Conversion Events', match: (s: string) => /conversionevent|conversion-events|capiconnector/i.test(s) },
  { key: 'distribution_mode', label: 'distribution_mode (only ever via distributionSetMode)', match: (s: string) => /distribution_?mode|distributionsetmode/i.test(s) },
  { key: 'credentials', label: 'credentials and secrets', match: (s: string) => /credential|apikey|api_key|secret|token/i.test(s) },
  { key: 'live_endpoints', label: 'live inbound and outbound endpoints', match: (s: string) => /api\.legenex\.com|functions\/leads|inboundwebhook/i.test(s) },
  { key: 'billing', label: 'billing records', match: (s: string) => /billingrun|billinglineitem|invoice|buyerpayment|supplierpayout/i.test(s) },
  { key: 'buyer_pricing', label: 'buyer pricing and state coverage', match: (s: string) => /buyerstatecpl|buyercplrule|supplierstatecoverage|statestatus/i.test(s) },
  { key: 'trustedform', label: 'TrustedForm behaviour', match: (s: string) => /trustedform|certbackup/i.test(s) },
  { key: 'portal_scoping', label: 'portal scoping', match: (s: string) => /portaldata|supplierportaldata|portalprojection|portal_scope/i.test(s) },
];

function detectRedSurfaces(haystacks: string[]) {
  const joined = haystacks.filter(Boolean).join(' \n ');
  return RED_SURFACES.filter((r) => r.match(joined)).map((r) => ({ key: r.key, label: r.label }));
}

// Non-negotiable constraints that go into every prompt regardless of the task.
const STANDING_CONSTRAINTS = [
  'Single concern only. Do not refactor adjacent code, rename anything, or expand scope.',
  'Follow DESIGN-SYSTEM.md exactly. Semantic tokens only. No raw hex, no bg-gray-*, no text-white. Run scripts/check-design-tokens.mjs on changed .jsx files before calling the change done.',
  'Additive schema changes only. No renames or deletions of live fields.',
  'No secrets in code, prompts, logs or commits.',
  'No em dashes anywhere in code, comments, copy or documentation.',
  'Read the target files before writing. Never edit from memory of an earlier session.',
  'Read edited files back after writing them, and verify the rendered result in the live app.',
  'Anything that cannot be verified from the working environment is labelled NEEDS-ENV, never closed by assumption.',
];

// Delegates to the shared client: OpenAI first, automatic failover to
// Anthropic (ANTHROPIC_API_KEY) if OpenAI is unavailable for any reason.
// The name is kept so existing call sites are untouched.
async function callOpenAI({ prompt, system, model = 'gpt-4o', temperature = 0.2, maxTokens } = {}) {
  return await callLLM({ prompt, system, model, temperature, maxTokens });
}

const parse = (v: any, fallback: any) => {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

const SYSTEM = `You write implementation briefs for the Legenex Dashboard, a Base44 React application that is replacing LeadByte as a lead distribution platform.

You are writing FOR a coding agent or a developer who has not seen this conversation. Assume no shared context.

Rules you must obey:
- Use only the facts given to you. Never invent file paths, entity names, function names, metrics or behaviour. If something needed is missing, list it under Open questions instead of guessing.
- Separate what is OBSERVED (backed by the evidence supplied) from what is INFERRED. Label inferences.
- Preserve the operator's own words in the Original request section, verbatim.
- Be specific and terse. No preamble, no encouragement, no restating the obvious.
- Never use em dashes. Use commas, colons, parentheses or full stops.
- Produce Markdown with these exact headings, in this order:
  ## Objective
  ## Original request
  ## Current behaviour
  ## Expected behaviour
  ## Evidence
  ## Scope
  ## Non-goals
  ## Files likely to change
  ## Entity and schema impact
  ## Backend function impact
  ## Permission impact
  ## Constraints
  ## Required tests
  ## Manual verification
  ## Regression risks
  ## Validation commands
  ## Rollback
  ## Definition of done
  ## Open questions`;

async function loadAll(entity: any) {
  const pageSize = 500;
  const out: any[] = [];
  let skip = 0;
  while (true) {
    const batch = (await entity.list('-created_date', pageSize, skip)) || [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
  }
  return out;
}

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
    if (caller.role !== 'admin' && permissions.progress_admin !== true && permissions.progress_write !== true) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const changeRequestId = body?.change_request_id;
    const target = body?.target || 'claude_chat_connector';
    if (!changeRequestId) {
      return Response.json({ error: 'change_request_id is required' }, { status: 400 });
    }

    const svc = base44.asServiceRole.entities;
    const cr = await svc.ChangeRequest.get(changeRequestId).catch(() => null);
    if (!cr) return Response.json({ error: 'Change request not found' }, { status: 404 });

    // ---- assemble context from records, never from the model ----
    const page = cr.page_key
      ? ((await svc.ProgressPage.filter({ page_key: cr.page_key })) || [])[0] || null
      : null;

    const findingIds: string[] = parse(cr.related_finding_ids, []);
    const threadIds: string[] = parse(cr.related_thread_ids, []);

    const allFindings = await loadAll(svc.AuditFinding);
    const findings = allFindings.filter((f: any) => findingIds.includes(f.id)
      || (cr.page_key && f.page_key === cr.page_key && ['open', 'acknowledged'].includes(f.status || 'open')));

    const allThreads = cr.page_key ? ((await svc.ReviewThread.filter({ page_key: cr.page_key })) || []) : [];
    const threads = allThreads.filter((t: any) => threadIds.includes(t.id) || t.status === 'open');

    const verifications = page
      ? ((await svc.VerificationRecord.filter({ subject_type: 'page', subject_key: page.page_key })) || [])
      : [];
    const verification = verificationStateFor(verifications);

    const entityDeps: string[] = parse(page?.entity_dependencies, []);
    const functionDeps: string[] = parse(page?.function_dependencies, []);
    const componentDeps: string[] = parse(page?.component_dependencies, []);

    // ---- deterministic RED surface detection ----
    const red = detectRedSurfaces([
      cr.title, cr.problem, cr.proposed_solution, cr.scope, cr.user_request,
      page?.route, page?.component_path,
      entityDeps.join(' '), functionDeps.join(' '), componentDeps.join(' '),
    ]);

    const contextBlock = [
      `Change request: ${cr.reference} ${cr.title}`,
      `Priority: ${cr.priority}. Status: ${cr.status}. Estimated risk: ${cr.estimated_risk}.`,
      page ? `Page: ${page.title} at route ${page.route} (section ${page.section_label}, ${page.route_type}, ${page.portal_scope} scope).` : 'No single page targeted.',
      page?.component_path ? `Page component: ${page.component_path}` : '',
      page?.permission_key ? `Gated by permission key: ${page.permission_key}` : '',
      page ? `Lifecycle: ${page.lifecycle_status}. Verification: ${verification.status}. Missing checks: ${verification.missing_checks.join(', ') || 'none'}.` : '',
      '',
      'PROBLEM AS RECORDED:',
      cr.problem || '(none recorded)',
      '',
      "OPERATOR'S OWN WORDS (reproduce verbatim in the Original request section):",
      cr.user_request || '(none recorded)',
      '',
      'PROPOSED SOLUTION AS RECORDED:',
      cr.proposed_solution || '(none recorded)',
      '',
      `SCOPE: ${cr.scope || '(not yet scoped)'}`,
      `NON-GOALS AS RECORDED: ${cr.non_goals || '(none recorded, you must propose an explicit do-not-touch list)'}`,
      `ACCEPTANCE CRITERIA AS RECORDED: ${cr.acceptance_criteria || '(none recorded, you must propose testable criteria)'}`,
      '',
      `FINDINGS (${findings.length}):`,
      ...findings.slice(0, 25).map((f: any) => [
        `- [${f.priority || f.severity}] ${f.title || f.check_id}`,
        `  type: ${f.finding_type || f.category}, origin: ${f.origin || 'machine'}, confidence: ${f.confidence || 'unknown'}, evidence type: ${f.evidence_type || 'unknown'}${f.requires_verification ? ' (UNCONFIRMED, treat as a hypothesis)' : ''}`,
        f.expected ? `  expected: ${f.expected}` : '',
        f.observed ? `  observed: ${f.observed}` : '',
        f.evidence_path ? `  evidence: ${f.evidence_path}` : '',
        f.suggested_fix ? `  suggested fix: ${f.suggested_fix}` : '',
      ].filter(Boolean).join('\n')),
      '',
      `OPERATOR COMMENTS (${threads.length}):`,
      ...threads.slice(0, 25).map((t: any) => [
        `- on ${t.subject_type}${t.subject_ref ? ` "${t.subject_ref}"` : ''}${t.subject_label ? ` (label: ${t.subject_label})` : ''}${t.observed_value ? ` showing "${t.observed_value}"` : ''}:`,
        `  "${t.body}"`,
        `  severity ${t.severity}${t.finding_type ? `, type ${t.finding_type}` : ''}`,
      ].join('\n')),
      '',
      `ENTITIES THIS PAGE READS: ${entityDeps.join(', ') || 'none detected'}`,
      `BACKEND FUNCTIONS THIS PAGE CALLS: ${functionDeps.join(', ') || 'none detected'}`,
      `COMPONENT FILES IN THIS PAGE'S IMPORT GRAPH (${componentDeps.length}): ${componentDeps.slice(0, 60).join(', ')}${componentDeps.length > 60 ? ', ...' : ''}`,
      '',
      red.length > 0
        ? `RED SURFACES DETECTED. This work touches: ${red.map((r) => r.label).join('; ')}. State clearly in Constraints that these require Nick's explicit approval in conversation before any change, and that distribution_mode may only ever move via distributionSetMode.`
        : 'No RED surfaces detected by the deterministic check. Still instruct the implementer to stop and ask if they find one.',
      '',
      'STANDING CONSTRAINTS (include all of these under Constraints):',
      ...STANDING_CONSTRAINTS.map((c) => `- ${c}`),
      '',
      `VALIDATION COMMANDS AVAILABLE: npm test, npm run lint, npm run build, npm run design:check, npm run engine:check, node scripts/generate-page-inventory.mjs --check, node scripts/generate-progress-bundle.mjs --check`,
      '',
      `INTENDED IMPLEMENTER: ${target}`,
    ].filter((l) => l !== undefined).join('\n');

    const draftBody = await callOpenAI({ system: SYSTEM, prompt: contextBlock });

    const existing = (await svc.PromptDraft.filter({ change_request_id: cr.id })) || [];
    const version = existing.reduce((max: number, d: any) => Math.max(max, d.version || 1), 0) + 1;

    // Previous drafts become superseded rather than being deleted, so the
    // history of what was asked for survives.
    for (const prior of existing) {
      if (prior.status !== 'superseded') {
        await svc.PromptDraft.update(prior.id, { status: 'superseded' });
      }
    }

    const created = await svc.PromptDraft.create({
      reference: `${cr.reference}-P${version}`,
      change_request_id: cr.id,
      page_key: cr.page_key || null,
      target,
      body: draftBody,
      body_original: draftBody,
      generation_inputs: JSON.stringify({
        finding_ids: findings.map((f: any) => f.id),
        thread_ids: threads.map((t: any) => t.id),
        entity_dependencies: entityDeps,
        function_dependencies: functionDeps,
        component_dependency_count: componentDeps.length,
        red_surfaces: red,
        verification_state: verification.status,
        generated_at: new Date().toISOString(),
      }),
      model: 'gpt-4o',
      version,
      status: 'draft',
      red_surface_ack: false,
      human_edited: false,
    });

    // Keep the change request's RED flag in step with what was detected.
    await svc.ChangeRequest.update(cr.id, {
      prompt_draft_id: created?.id || null,
      touches_red_surface: red.length > 0,
      red_surfaces: JSON.stringify(red.map((r) => r.key)),
    });

    return Response.json({
      ok: true,
      prompt_draft_id: created?.id || null,
      reference: `${cr.reference}-P${version}`,
      version,
      red_surfaces: red,
      inputs: {
        findings: findings.length,
        comments: threads.length,
        entities: entityDeps.length,
        functions: functionDeps.length,
      },
      dispatched: false,
      note: 'Draft only. Nothing was sent to any agent and no code was changed.',
    });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
});
