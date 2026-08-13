import React, { useMemo, useState } from 'react';
import {
  GitPullRequest, ShieldAlert, Sparkles, Filter, Clock,
} from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import {
  useChangeRequests, useProgressPages, useProgressMutation, useGeneratePrompt,
  mergePagesWithManifest, usePageManifest, parseJson,
} from '@/components/progress/useProgress';
import {
  ProgressPageHeader, Card, CardHeader, CardBody, Badge, EmptyState,
  PrimaryButton, SecondaryButton, LoadingBlock, PRIORITY_TONE,
} from '@/components/progress/progressUi';

// Change Requests: the unit of work between a finding and a shipped fix.
//
// The status ladder is deliberately long because the interesting states are the
// ones in the middle. Implemented and awaiting verification are different
// things, and a change request cannot reach verified without acceptance criteria
// and evidence, which is enforced here rather than left to discipline.

export const STATUSES = [
  'draft', 'needs_context', 'ready_for_review', 'approved', 'ready_for_implementation',
  'in_progress', 'implemented', 'awaiting_verification', 'changes_requested',
  'verified', 'released', 'rejected', 'blocked',
];

const STATUS_TONE = {
  draft: 'neutral',
  needs_context: 'warn',
  ready_for_review: 'info',
  approved: 'info',
  ready_for_implementation: 'info',
  in_progress: 'info',
  implemented: 'warn',
  awaiting_verification: 'warn',
  changes_requested: 'warn',
  verified: 'good',
  released: 'good',
  rejected: 'neutral',
  blocked: 'bad',
};

// Statuses a change request may not enter without the evidence that makes them
// meaningful. Enforced in the UI and stated plainly to whoever is blocked by it.
const REQUIREMENTS = {
  ready_for_implementation: {
    check: (cr) => Boolean(cr.non_goals?.trim()) && Boolean(cr.acceptance_criteria?.trim()),
    why: 'Needs an explicit do-not-touch list and testable acceptance criteria before anyone implements it.',
  },
  verified: {
    check: (cr) => Boolean(cr.verification_evidence?.trim()) && Boolean(cr.acceptance_criteria?.trim()),
    why: 'Needs verification evidence. A developer saying it is done is not verification.',
  },
};

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function ChangeRequests() {
  const { can } = usePermissions();
  const manifest = usePageManifest();
  const changesQ = useChangeRequests();
  const pagesQ = useProgressPages();
  const [filter, setFilter] = useState('active');

  const pages = useMemo(() => mergePagesWithManifest(pagesQ.data || [], manifest.pages), [pagesQ.data, manifest]);
  const pageTitle = useMemo(() => {
    const m = new Map(pages.map((p) => [p.page_key, p.title]));
    return (k) => m.get(k) || k || 'Not page specific';
  }, [pages]);

  const changes = changesQ.data || [];
  const filtered = useMemo(() => {
    if (filter === 'all') return changes;
    if (filter === 'active') return changes.filter((c) => !['released', 'rejected', 'verified'].includes(c.status));
    if (filter === 'red') return changes.filter((c) => c.touches_red_surface);
    return changes.filter((c) => c.status === filter);
  }, [changes, filter]);

  if (changesQ.isLoading) {
    return (
      <>
        <ProgressPageHeader title="Change Requests" description="Loading change requests." />
        <LoadingBlock label="Reading change requests" />
      </>
    );
  }

  const redCount = changes.filter((c) => c.touches_red_surface).length;

  return (
    <>
      <ProgressPageHeader
        title="Change Requests"
        description={`${changes.length} recorded. Raised from findings, turned into prompts, closed by evidence.`}
      />

      {redCount > 0 && (
        <Card className="mb-4">
          <CardBody className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-medium text-foreground">
                {redCount} change request{redCount === 1 ? '' : 's'} touch a RED surface
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                RED surfaces need your explicit approval in conversation before anyone implements them, whatever the change request status says.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-2 py-2.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="active">Active work</option>
            <option value="all">Everything</option>
            <option value="red">RED surfaces</option>
            {STATUSES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
          </select>
          <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} shown</span>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={GitPullRequest}
            title={changes.length === 0 ? 'No change requests yet' : 'Nothing matches this filter'}
            description={changes.length === 0
              ? 'Change requests are raised from findings. Triage a comment into a finding, then raise the work from there.'
              : 'Change the filter to see more.'}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((cr) => (
            <ChangeRequestCard
              key={cr.id}
              cr={cr}
              pageTitle={pageTitle}
              canWrite={can('progress_write') || can('progress_review')}
              canPrompt={can('progress_prompts')}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ChangeRequestCard({ cr, pageTitle, canWrite, canPrompt }) {
  const mutation = useProgressMutation('ChangeRequest', 'progress-changes');
  const generate = useGeneratePrompt();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    scope: cr.scope || '',
    non_goals: cr.non_goals || '',
    acceptance_criteria: cr.acceptance_criteria || '',
    rollback_approach: cr.rollback_approach || '',
    assignee: cr.assignee || '',
    verification_evidence: cr.verification_evidence || '',
  });
  const [error, setError] = useState('');

  const redSurfaces = parseJson(cr.red_surfaces, []);
  const findingCount = parseJson(cr.related_finding_ids, []).length;

  const move = (status) => {
    const req = REQUIREMENTS[status];
    if (req && !req.check({ ...cr, ...draft })) {
      setError(req.why);
      return;
    }
    setError('');
    const log = parseJson(cr.activity_log, []);
    log.push({ at: new Date().toISOString(), actor: 'progress', from: cr.status, to: status, note: '' });
    mutation.mutate({ action: 'update', id: cr.id, data: { status, activity_log: JSON.stringify(log) } });
  };

  const save = () => {
    mutation.mutate({ action: 'update', id: cr.id, data: draft }, { onSuccess: () => { setEditing(false); setError(''); } });
  };

  return (
    <Card>
      <CardHeader
        title={`${cr.reference}  ${cr.title}`}
        subtitle={`${pageTitle(cr.page_key)}${findingCount ? `, from ${findingCount} finding(s)` : ''}`}
        icon={GitPullRequest}
        actions={(
          <div className="flex flex-wrap items-center gap-1.5">
            {cr.touches_red_surface && <Badge tone="bad">RED</Badge>}
            <Badge tone={PRIORITY_TONE[cr.priority]}>{cr.priority}</Badge>
            <Badge tone={STATUS_TONE[cr.status] || 'neutral'}>{humanise(cr.status)}</Badge>
          </div>
        )}
      />
      <CardBody className="space-y-3">
        {cr.problem && <Detail label="Problem" value={cr.problem} />}
        {cr.user_request && <Detail label="Your words, preserved" value={cr.user_request} />}
        {cr.proposed_solution && <Detail label="Proposed solution" value={cr.proposed_solution} />}

        {cr.touches_red_surface && redSurfaces.length > 0 && (
          <div className="rounded-md border border-border bg-secondary px-2.5 py-2">
            <p className="text-[11px] font-medium text-primary">RED surfaces involved</p>
            <p className="mt-0.5 text-[12px] text-foreground">{redSurfaces.join(', ')}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Requires your explicit approval in conversation. distribution_mode may only ever move via distributionSetMode.
            </p>
          </div>
        )}

        {!editing ? (
          <>
            <Detail label="Scope" value={cr.scope} />
            <Detail label="Do not touch" value={cr.non_goals} missing="Not set. Required before implementation." />
            <Detail label="Acceptance criteria" value={cr.acceptance_criteria} missing="Not set. Required before implementation and before verified." />
            <Detail label="Rollback" value={cr.rollback_approach} />
            <Detail label="Verification evidence" value={cr.verification_evidence} missing="None. Required before this can reach verified." />
            {cr.assignee && <Detail label="Assigned to" value={cr.assignee} />}
          </>
        ) : (
          <div className="space-y-3">
            <EditField label="Scope" value={draft.scope} onChange={(v) => setDraft({ ...draft, scope: v })} />
            <EditField label="Do not touch (explicit exclusion list)" value={draft.non_goals} onChange={(v) => setDraft({ ...draft, non_goals: v })} />
            <EditField label="Acceptance criteria (testable)" value={draft.acceptance_criteria} onChange={(v) => setDraft({ ...draft, acceptance_criteria: v })} />
            <EditField label="Rollback approach" value={draft.rollback_approach} onChange={(v) => setDraft({ ...draft, rollback_approach: v })} />
            <EditField label="Verification evidence" value={draft.verification_evidence} onChange={(v) => setDraft({ ...draft, verification_evidence: v })} />
            <EditField label="Assigned to" value={draft.assignee} onChange={(v) => setDraft({ ...draft, assignee: v })} rows={1} />
          </div>
        )}

        {error && (
          <p className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[12px] text-chart-3">{error}</p>
        )}

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {editing ? (
              <>
                <PrimaryButton onClick={save} disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saving' : 'Save'}
                </PrimaryButton>
                <SecondaryButton onClick={() => { setEditing(false); setError(''); }}>Cancel</SecondaryButton>
              </>
            ) : (
              <>
                <SecondaryButton onClick={() => setEditing(true)}>Edit</SecondaryButton>
                <select
                  value=""
                  onChange={(e) => e.target.value && move(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Move to...</option>
                  {STATUSES.filter((s) => s !== cr.status).map((s) => (
                    <option key={s} value={s}>{humanise(s)}</option>
                  ))}
                </select>
                {canPrompt && (
                  <PrimaryButton
                    onClick={() => generate.mutate({ change_request_id: cr.id })}
                    disabled={generate.isPending}
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      {generate.isPending ? 'Generating' : cr.prompt_draft_id ? 'Regenerate prompt' : 'Generate prompt'}
                    </span>
                  </PrimaryButton>
                )}
              </>
            )}
          </div>
        )}

        {generate.isError && (
          <p className="text-[12px] text-primary">Prompt generation failed: {String(generate.error?.message || generate.error)}</p>
        )}
        {generate.isSuccess && (
          <p className="text-[12px] text-chart-5">
            Draft created. Nothing was sent to any agent. Review it under Prompt Studio.
          </p>
        )}

        <ActivityLog log={parseJson(cr.activity_log, [])} />
      </CardBody>
    </Card>
  );
}

function Detail({ label, value, missing }) {
  if (!value && !missing) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-[12px] leading-snug ${value ? 'text-foreground' : 'text-chart-3'}`}>
        {value || missing}
      </p>
    </div>
  );
}

function EditField({ label, value, onChange, rows = 2 }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

function ActivityLog({ log }) {
  if (!log || log.length === 0) return null;
  return (
    <div className="border-t border-border pt-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Clock className="h-3 w-3" />
        History
      </p>
      <ul className="space-y-1">
        {log.slice(-6).reverse().map((e, i) => (
          <li key={i} className="text-[11px] text-muted-foreground">
            {new Date(e.at).toLocaleString()}: {e.from ? `${humanise(e.from)} to ` : ''}{humanise(e.to)}
            {e.note ? `, ${e.note}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
