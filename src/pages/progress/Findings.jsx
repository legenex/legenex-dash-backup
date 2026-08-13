import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, MessageSquare, Filter, CheckCircle2, ArrowRight, Bot, User, Cpu,
} from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import {
  useProgressFindings, useReviewThreads, useProgressPages, useChangeRequests,
  useProgressMutation, mergePagesWithManifest, usePageManifest,
} from '@/components/progress/useProgress';
import {
  ProgressPageHeader, Card, CardHeader, CardBody, Badge, EmptyState,
  PrimaryButton, SecondaryButton, LoadingBlock, PRIORITY_TONE, EvidenceBadge,
} from '@/components/progress/progressUi';

// Findings: one list for machine checks, AI reviews and human comments.
//
// The three origins share a table on purpose. What matters is not who noticed a
// problem but whether the claim is backed by evidence, so origin is a label and
// evidence type is the thing that carries weight. An unconfirmed claim is shown
// as unconfirmed everywhere and is excluded from the blocking gate maths until
// somebody attaches evidence.

const FINDING_TYPES = [
  'ui_inconsistency', 'ux_problem', 'incorrect_metric', 'data_inconsistency',
  'backend_defect', 'missing_functionality', 'performance', 'permission', 'security',
  'mobile', 'accessibility', 'missing_state', 'integration', 'migration_blocker',
  'technical_debt', 'copy_terminology', 'user_request',
];

const ORIGIN_ICON = { machine: Cpu, ai_review: Bot, human: User };
const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const OPEN_STATES = ['open', 'acknowledged'];

export default function Findings() {
  const { can } = usePermissions();
  const manifest = usePageManifest();
  const findingsQ = useProgressFindings();
  const threadsQ = useReviewThreads();
  const pagesQ = useProgressPages();
  const changesQ = useChangeRequests();

  const [filters, setFilters] = useState({ priority: '', status: 'open', origin: '', type: '', page: '' });

  const pages = useMemo(
    () => mergePagesWithManifest(pagesQ.data || [], manifest.pages),
    [pagesQ.data, manifest],
  );
  const pageTitle = useMemo(() => {
    const m = new Map(pages.map((p) => [p.page_key, p.title]));
    return (k) => m.get(k) || k || 'Not page specific';
  }, [pages]);

  const findings = findingsQ.data || [];
  const threads = threadsQ.data || [];
  const unconverted = threads.filter((t) => t.status === 'open');

  const filtered = useMemo(() => findings.filter((f) => {
    if (filters.priority && f.priority !== filters.priority) return false;
    if (filters.status === 'open' && !OPEN_STATES.includes(f.status || 'open')) return false;
    if (filters.status === 'closed' && OPEN_STATES.includes(f.status || 'open')) return false;
    if (filters.origin && (f.origin || 'machine') !== filters.origin) return false;
    if (filters.type && f.finding_type !== filters.type) return false;
    if (filters.page && f.page_key !== filters.page) return false;
    return true;
  }).sort((a, b) => (a.priority || 'P9').localeCompare(b.priority || 'P9')), [findings, filters]);

  if (findingsQ.isLoading) {
    return (
      <>
        <ProgressPageHeader title="Findings" description="Loading findings." />
        <LoadingBlock label="Reading findings" />
      </>
    );
  }

  const openCount = findings.filter((f) => OPEN_STATES.includes(f.status || 'open')).length;
  const p0 = findings.filter((f) => f.priority === 'P0' && OPEN_STATES.includes(f.status || 'open'));
  const confirmedP0 = p0.filter((f) => !f.requires_verification);

  return (
    <>
      <ProgressPageHeader
        title="Findings"
        description={`${openCount} open of ${findings.length} total. Machine checks, AI reviews and your own comments share one list.`}
      />

      {confirmedP0.length > 0 && (
        <Card className="mb-4">
          <CardBody className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-medium text-foreground">
                {confirmedP0.length} confirmed open P0 finding{confirmedP0.length === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                While any of these stay open the migration recommendation is capped at not ready, whatever the readiness average says.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {unconverted.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title={`Comments awaiting triage (${unconverted.length})`}
            subtitle="Your observations become findings here. Nothing is auto-promoted."
            icon={MessageSquare}
          />
          <div>
            {unconverted.slice(0, 8).map((t) => (
              <ThreadTriageRow key={t.id} thread={t} pageTitle={pageTitle} canReview={can('progress_review') || can('progress_write')} />
            ))}
          </div>
          {unconverted.length > 8 && (
            <CardBody className="border-t border-border py-2">
              <p className="text-[11px] text-muted-foreground">
                {unconverted.length - 8} more. Triage from the page workspace under Application Review.
              </p>
            </CardBody>
          )}
        </Card>
      )}

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-2 py-2.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <FilterSelect value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })}
            options={[['open', 'Open'], ['closed', 'Closed'], ['', 'All statuses']]} />
          <FilterSelect value={filters.priority} onChange={(v) => setFilters({ ...filters, priority: v })}
            options={[['', 'Any priority'], ['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2'], ['P3', 'P3'], ['P4', 'P4']]} />
          <FilterSelect value={filters.origin} onChange={(v) => setFilters({ ...filters, origin: v })}
            options={[['', 'Any origin'], ['machine', 'Machine'], ['ai_review', 'AI review'], ['human', 'Human']]} />
          <FilterSelect value={filters.type} onChange={(v) => setFilters({ ...filters, type: v })}
            options={[['', 'Any type'], ...FINDING_TYPES.map((t) => [t, humanise(t)])]} />
          <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} shown</span>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={findings.length === 0 ? AlertTriangle : Filter}
            title={findings.length === 0 ? 'No findings recorded yet' : 'No findings match these filters'}
            description={findings.length === 0
              ? 'The audit harness has not run against this system and no comments have been triaged. An empty findings list is not evidence that the app is correct.'
              : 'Widen the filters to see more.'}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              pageTitle={pageTitle}
              canReview={can('progress_review') || can('progress_write')}
              changeRequests={changesQ.data || []}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ThreadTriageRow({ thread, pageTitle, canReview }) {
  const findingMutation = useProgressMutation('AuditFinding', 'progress-findings');
  const threadMutation = useProgressMutation('ReviewThread', 'progress-threads');
  const [busy, setBusy] = useState(false);

  const promote = () => {
    setBusy(true);
    // A human comment becomes a finding with evidence_type user_feedback and,
    // by default, requires_verification set. It is an observation from the
    // person who knows the business, not yet a proven defect.
    findingMutation.mutate({
      action: 'create',
      data: {
        run_id: `human-${Date.now()}`,
        check_id: `human.${thread.subject_type}.${(thread.subject_ref || 'page').replace(/\s+/g, '_').toLowerCase()}`,
        layer: 'ui',
        source: 'human_comment',
        verdict: 'fail',
        severity: thread.severity === 'P0' ? 'critical' : thread.severity === 'P1' ? 'high' : 'medium',
        category: 'usability',
        origin: 'human',
        page_key: thread.page_key,
        surface: thread.page_key,
        title: thread.body.slice(0, 120),
        description: thread.body,
        finding_type: thread.finding_type || 'user_request',
        priority: thread.severity || 'P3',
        confidence: 'high',
        evidence_type: 'user_feedback',
        requires_verification: true,
        observed: thread.observed_value ? `${thread.subject_ref || thread.subject_type} showing ${thread.observed_value}` : '',
        thread_id: thread.id,
        status: 'open',
        created_at: new Date().toISOString(),
      },
    }, {
      onSuccess: (created) => {
        threadMutation.mutate({
          action: 'update',
          id: thread.id,
          data: { status: 'converted', converted_finding_id: created?.id || null },
        });
        setBusy(false);
      },
      onError: () => setBusy(false),
    });
  };

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">
            {pageTitle(thread.page_key)} on {humanise(thread.subject_type)}
            {thread.subject_ref ? ` "${thread.subject_ref}"` : ''}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-foreground">{thread.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={PRIORITY_TONE[thread.severity]}>{thread.severity}</Badge>
          {canReview && (
            <SecondaryButton onClick={promote} disabled={busy}>
              {busy ? 'Promoting' : 'Make a finding'}
            </SecondaryButton>
          )}
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding: f, pageTitle, canReview, changeRequests }) {
  const findingMutation = useProgressMutation('AuditFinding', 'progress-findings');
  const changeMutation = useProgressMutation('ChangeRequest', 'progress-changes');
  const [busy, setBusy] = useState(false);
  const Icon = ORIGIN_ICON[f.origin || 'machine'] || Cpu;
  const isOpen = OPEN_STATES.includes(f.status || 'open');
  const linked = changeRequests.find((c) => c.id === f.change_request_id);

  const setStatus = (status) => {
    findingMutation.mutate({
      action: 'update',
      id: f.id,
      data: {
        status,
        ...(status === 'fixed' ? { resolved_at: new Date().toISOString() } : {}),
      },
    });
  };

  const confirm = () => {
    // Attaching evidence is what turns a hypothesis into something that counts.
    findingMutation.mutate({
      action: 'update',
      id: f.id,
      data: { requires_verification: false, confidence: 'high' },
    });
  };

  const raiseChangeRequest = () => {
    setBusy(true);
    const ref = `CR-${String(changeRequests.length + 1).padStart(3, '0')}`;
    changeMutation.mutate({
      action: 'create',
      data: {
        reference: ref,
        title: f.title || f.check_id,
        page_key: f.page_key || null,
        problem: f.description || f.detail || f.observed || '',
        user_request: f.origin === 'human' ? (f.description || '') : '',
        proposed_solution: f.suggested_fix || '',
        acceptance_criteria: f.acceptance_criteria || '',
        priority: f.priority || 'P3',
        status: 'draft',
        related_finding_ids: JSON.stringify([f.id]),
        related_thread_ids: JSON.stringify(f.thread_id ? [f.thread_id] : []),
        estimated_risk: f.priority === 'P0' || f.priority === 'P1' ? 'high' : 'medium',
        activity_log: JSON.stringify([{ at: new Date().toISOString(), actor: 'progress', from: null, to: 'draft', note: `Raised from finding ${f.title || f.check_id}` }]),
      },
    }, {
      onSuccess: (created) => {
        findingMutation.mutate({ action: 'update', id: f.id, data: { change_request_id: created?.id || null } });
        setBusy(false);
      },
      onError: () => setBusy(false),
    });
  };

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium leading-snug text-foreground">{f.title || f.check_id}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {pageTitle(f.page_key)}
                {f.check_id && f.title ? `, ${f.check_id}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {f.priority && <Badge tone={PRIORITY_TONE[f.priority]}>{f.priority}</Badge>}
            {f.finding_type && <Badge tone="neutral">{humanise(f.finding_type)}</Badge>}
            <Badge tone={isOpen ? 'neutral' : 'good'}>{humanise(f.status || 'open')}</Badge>
            <EvidenceBadge type={f.evidence_type} requiresVerification={f.requires_verification} />
          </div>
        </div>

        {(f.description || f.detail) && (
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{f.description || f.detail}</p>
        )}

        {(f.expected || f.observed) && (
          <div className="mt-2 space-y-0.5 rounded-md border border-border bg-secondary px-2.5 py-2">
            {f.expected && <p className="text-[11px] text-muted-foreground">Expected: <span className="text-foreground">{f.expected}</span></p>}
            {f.observed && <p className="text-[11px] text-muted-foreground">Observed: <span className="text-foreground">{f.observed}</span></p>}
          </div>
        )}

        {f.evidence_path && <p className="mt-2 font-mono text-[10px] text-muted-foreground">{f.evidence_path}</p>}

        {f.requires_verification && (
          <p className="mt-2 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[11px] text-chart-3">
            Unconfirmed. This claim is excluded from blocking gate calculations until evidence is attached.
          </p>
        )}

        {linked && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Change request <Link to="/progress/changes" className="text-primary">{linked.reference}</Link>, status {humanise(linked.status)}.
          </p>
        )}

        {canReview && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {f.requires_verification && (
              <SecondaryButton onClick={confirm}>Confirm with evidence</SecondaryButton>
            )}
            {!f.change_request_id && isOpen && (
              <PrimaryButton onClick={raiseChangeRequest} disabled={busy}>
                <span className="flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5" />
                  {busy ? 'Raising' : 'Raise change request'}
                </span>
              </PrimaryButton>
            )}
            {isOpen ? (
              <>
                <SecondaryButton onClick={() => setStatus('acknowledged')}>Acknowledge</SecondaryButton>
                <SecondaryButton onClick={() => setStatus('fixed')}>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />Mark fixed</span>
                </SecondaryButton>
                <SecondaryButton onClick={() => setStatus('wont_fix')}>Will not fix</SecondaryButton>
              </>
            ) : (
              <SecondaryButton onClick={() => setStatus('open')}>Reopen</SecondaryButton>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
