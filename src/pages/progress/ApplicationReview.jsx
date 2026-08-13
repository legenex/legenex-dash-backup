import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Search, FileCode, EyeOff, Camera, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { usePermissions, useAuth } from '@/lib/AuthContext';
import { pageReadiness } from '@/lib/progress/readiness';
import {
  useProgressPages, useProgressFindings, useReviewThreads, useVerificationRecords,
  usePageSnapshots, useProgressMutation, mergePagesWithManifest, usePageManifest,
} from '@/components/progress/useProgress';
import VisualReview from '@/components/progress/VisualReview';
import { TaskSidebar, BackendPlainEnglish } from '@/components/progress/ReviewPanels';
import { useOffscreenCapture } from '@/components/progress/OffscreenCapture';
import { planDailyRefresh } from '@/lib/progress/captureSchedule';
import { capturable, ALL_VIEWPORTS } from '@/lib/progress/captureTargets';
import { sortSections } from '@/components/progress/progressNav';
import {
  ProgressPageHeader, Card, CardBody, Badge, EmptyState,
  PrimaryButton, SecondaryButton, LoadingBlock, ReadinessBar, toneForReadiness,
  LIFECYCLE_LABEL, LIFECYCLE_TONE,
} from '@/components/progress/progressUi';

// Application Review: the tree of every section and page, plus the per page
// review workspace where Nick's knowledge actually enters the system.
//
// The tree is generated, not hand maintained. A route that exists in the router
// but has no review record shows as unregistered rather than being hidden, and a
// record whose route has disappeared shows as removed. Both are things worth
// seeing.

const SUBJECT_TYPES = [
  { value: 'page', label: 'The whole page' },
  { value: 'metric_card', label: 'A metric' },
  { value: 'lead_count', label: 'A lead count' },
  { value: 'status_pill', label: 'A status pill' },
  { value: 'table_column', label: 'A table column' },
  { value: 'filter', label: 'A filter' },
  { value: 'form_field', label: 'A form field' },
  { value: 'modal', label: 'A modal or drawer' },
  { value: 'component', label: 'A component' },
  { value: 'entity', label: 'An entity' },
  { value: 'field', label: 'An entity field' },
  { value: 'backend_function', label: 'A backend function' },
  { value: 'calculation', label: 'A calculation' },
  { value: 'permission', label: 'A permission' },
  { value: 'workflow', label: 'A workflow' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'migration_requirement', label: 'A migration requirement' },
];

const FINDING_TYPES = [
  'ui_inconsistency', 'ux_problem', 'incorrect_metric', 'data_inconsistency',
  'backend_defect', 'missing_functionality', 'performance', 'permission', 'security',
  'mobile', 'accessibility', 'missing_state', 'integration', 'migration_blocker',
  'technical_debt', 'copy_terminology', 'user_request',
];

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const groupBy = (list, key) => {
  const out = {};
  (list || []).forEach((i) => { const k = i[key]; if (k) (out[k] = out[k] || []).push(i); });
  return out;
};

export default function ApplicationReview() {
  const manifest = usePageManifest();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const selectedKey = params.get('page');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [treeOpen, setTreeOpen] = useState(true);

  const { user } = useAuth();
  const capture = useOffscreenCapture({ role: user?.role, capturedBy: user?.email });

  const pagesQ = useProgressPages();
  const findingsQ = useProgressFindings();
  const threadsQ = useReviewThreads();
  const verifsQ = useVerificationRecords();
  const snapsQ = usePageSnapshots();

  const pages = useMemo(
    () => mergePagesWithManifest(pagesQ.data || [], manifest.pages),
    [pagesQ.data, manifest],
  );

  const findingsByPage = useMemo(() => groupBy(findingsQ.data, 'page_key'), [findingsQ.data]);
  const threadsByPage = useMemo(() => groupBy(threadsQ.data, 'page_key'), [threadsQ.data]);
  const verifsByPage = useMemo(
    () => groupBy((verifsQ.data || []).filter((v) => v.subject_type === 'page'), 'subject_key'),
    [verifsQ.data],
  );
  const snapsByPage = useMemo(() => groupBy(snapsQ.data, 'page_key'), [snapsQ.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) =>
      (p.title || '').toLowerCase().includes(q)
      || (p.route || '').toLowerCase().includes(q)
      || (p.component_path || '').toLowerCase().includes(q)
      || (p.section_label || '').toLowerCase().includes(q));
  }, [pages, query]);

  const sections = useMemo(() => {
    const grouped = groupBy(filtered, 'section_key');
    return sortSections(Object.keys(grouped)).map((key) => ({
      key,
      label: grouped[key][0]?.section_label || key,
      pages: grouped[key].sort((a, b) => (a.route || '').localeCompare(b.route || '')),
    }));
  }, [filtered]);

  const selected = pages.find((p) => p.page_key === selectedKey) || null;




  // Daily structural refresh.
  //
  // Once per Regina day, retake anything MISSING a size or captured against an
  // older build. Data changes are deliberately ignored: a new lead must not
  // trigger hundreds of screenshots. It cannot literally fire at midnight with
  // nobody here, because rendering needs a browser, so it runs on the first
  // visit of each new day instead.
  const autoRan = useRef(false);
  const [autoPlan, setAutoPlan] = useState(null);
  const [autoOn, setAutoOn] = useState(() => {
    try { return localStorage.getItem('progress_capture_auto') !== '0'; } catch { return true; }
  });

  useEffect(() => {
    if (autoRan.current || capture.running) return;
    if (pagesQ.isLoading || snapsQ.isLoading) return;
    if (!(can('progress_write') || can('progress_admin'))) return;

    let lastRunDay = null;
    try { lastRunDay = localStorage.getItem('progress_capture_last_day'); } catch { lastRunDay = null; }

    const plan = planDailyRefresh({
      pages: capturable(pages),
      snapshots: snapsQ.data || [],
      currentCommit: manifest.app_commit,
      lastRunDay,
      enabled: autoOn,
    });

    if (!plan.shouldRun) return;
    autoRan.current = true;
    try { localStorage.setItem('progress_capture_last_day', plan.today); } catch { /* private mode */ }
    setAutoPlan(plan);
    capture.run(plan.targets, { label: `today's refresh, ${plan.reason}` });
  }, [pagesQ.isLoading, snapsQ.isLoading, snapsQ.data, pages, autoOn, capture, can, manifest]);

  if (pagesQ.isLoading) {
    return (
      <>
        <ProgressPageHeader title="Application Review" description="Loading the page inventory." />
        <LoadingBlock label="Reading the inventory" />
      </>
    );
  }

  return (
    <>
      <ProgressPageHeader
        title="Application Review"
        description={`${pages.length} surfaces derived from the router, nav and permission config. Select one to review it.`}
        actions={(can('progress_write') || can('progress_admin')) ? (
          <div className="flex flex-wrap items-center gap-2">
            <SecondaryButton
              onClick={() => {
                const next = !autoOn;
                setAutoOn(next);
                try { localStorage.setItem('progress_capture_auto', next ? '1' : '0'); } catch { /* private mode */ }
              }}
              title="Retake missing sizes and pages changed by a new build, once a day"
            >
              {autoOn ? 'Daily refresh on' : 'Daily refresh off'}
            </SecondaryButton>
            <SecondaryButton onClick={() => setTreeOpen(!treeOpen)}>
              {treeOpen ? 'Hide list' : 'Show list'}
            </SecondaryButton>
            {capture.running && (
              <SecondaryButton onClick={capture.cancel}>Stop</SecondaryButton>
            )}
            <PrimaryButton
              onClick={() => capture.run(capturable(pages), { viewports: ALL_VIEWPORTS, label: 'every page' })}
              disabled={capture.running}
            >
              <span className="flex items-center gap-1.5">
                {capture.running
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Camera className="h-3.5 w-3.5" />}
                {capture.running ? 'Capturing' : 'Capture every page'}
              </span>
            </PrimaryButton>
          </div>
        ) : null}
      />

      {capture.progress && (
        <Card className="mb-4">
          <CardBody className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5">
              {capture.running
                ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                : capture.progress.failed > 0
                  ? <XCircle className="h-4 w-4 text-chart-3" />
                  : <CheckCircle2 className="h-4 w-4 text-chart-5" />}
              <span className="text-[12px] text-foreground">
                {capture.running
                  ? `Capturing ${capture.progress.label}: ${capture.progress.done} of ${capture.progress.total}${capture.progress.viewport ? ` (${capture.progress.viewport})` : ''}`
                  : `${capture.progress.done - capture.progress.failed} captured, ${capture.progress.failed} failed of ${capture.progress.done} attempted${capture.progress.cancelled ? ', stopped early' : ''}`}
              </span>
              {capture.progress.current && (
                <span className="text-[11px] text-muted-foreground">{capture.progress.current}</span>
              )}
              {autoPlan && (
                <span className="text-[11px] text-muted-foreground">
                  automatic daily pass
                </span>
              )}
            </div>
            {!capture.running && (
              <button type="button" onClick={capture.clear} className="text-[11px] text-muted-foreground hover:text-foreground">
                Dismiss
              </button>
            )}
          </CardBody>
          {!capture.running && capture.progress.failures?.length > 0 && (
            <CardBody className="border-t border-border pt-2.5">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                What failed, and why
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {capture.progress.failures.slice(0, 40).map((f, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">
                    <span className="text-foreground">{f.page}</span> ({f.viewport}): {f.reason}
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>
      )}

      <div className={`grid grid-cols-1 gap-4 ${treeOpen ? 'lg:grid-cols-[minmax(0,250px)_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>
        {/* Tree */}
        <Card className={`h-fit lg:sticky lg:top-4 ${treeOpen ? '' : 'hidden'}`}>
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, routes, components"
                className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {sections.length === 0 ? (
              <EmptyState icon={Search} title="No matches" description="Nothing in the inventory matches that search." />
            ) : sections.map((section) => {
              const open = !collapsed[section.key];
              const sectionResults = section.pages.map((p) => pageReadiness(p, {
                findings: findingsByPage[p.page_key] || [],
                verifications: verifsByPage[p.page_key] || [],
              }));
              const scored = sectionResults.filter((r) => r.scored);
              const avg = scored.length
                ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length)
                : 0;
              // Section completion is Nick's tick, not the evidence score. A
              // section is done when every page in it has been ticked off.
              const sectionDone = section.pages.filter((p) => p.review_complete).length;
              return (
                <div key={section.key} className="border-b border-border last:border-b-0">
                  <div className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [section.key]: open }))}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                  >
                    {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-medium text-foreground">{section.label}</span>
                        {sectionDone === section.pages.length && section.pages.length > 0 && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-chart-5" />
                        )}
                      </span>
                      <ReadinessBar value={avg} tone={toneForReadiness(avg)} className="mt-1.5" />
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                      {sectionDone}/{section.pages.length}
                    </span>
                  </button>
                  {(can('progress_write') || can('progress_admin')) && (
                    <button
                      type="button"
                      title={`Capture the ${section.label} section`}
                      disabled={capture.running}
                      onClick={() => capture.run(capturable(section.pages), { viewports: ALL_VIEWPORTS, label: section.label })}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                    >
                      <Camera className="h-3.5 w-3.5" />
                    </button>
                  )}
                  </div>
                  {open && (
                    <div className="pb-1">
                      {section.pages.map((p) => {
                        const active = p.page_key === selectedKey;
                        const open0 = (findingsByPage[p.page_key] || []).filter((f) => ['open', 'acknowledged'].includes(f.status || 'open'));
                        const p0 = open0.filter((f) => f.priority === 'P0').length;
                        return (
                          <button
                            key={p.page_key}
                            type="button"
                            onClick={() => setParams({ page: p.page_key })}
                            className={`flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left transition-colors hover:bg-accent ${active ? 'bg-accent' : ''}`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-[12px] ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {p.title}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">{p.route}</span>
                            </span>
                            {p.review_complete && <CheckCircle2 className="h-3 w-3 shrink-0 text-chart-5" />}
                            {p.nav_visibility === 'hidden' && <EyeOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            {p0 > 0 && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">P0</span>}
                            {!p.registered && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">new</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Workspace */}
        <div className="min-w-0">
          {!selected ? (
            <Card>
              <EmptyState
                icon={FileCode}
                title="Select a surface to review"
                description="The tree lists every route, tab, redirect and portal page derived from the real router. Pick one to see what it does, what it depends on, and what is wrong with it."
              />
            </Card>
          ) : (
            <PageWorkspace
              page={selected}
              findings={findingsByPage[selected.page_key] || []}
              threads={threadsByPage[selected.page_key] || []}
              verifications={verifsByPage[selected.page_key] || []}
              snapshots={snapsByPage[selected.page_key] || []}
              capture={capture}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- *
 * Workspace
 *
 * One surface, not a set of tabs. The screenshot is the review, the task list
 * sits beside it, and the backend summary sits under it. The old header block of
 * route metadata and the separate Overview tab are gone: they told you things you
 * could already see and pushed the actual work below the fold.
 * ---------------------------------------------------------------- */

function PageWorkspace({ page, findings, threads, verifications, snapshots = [], capture }) {
  const { can } = usePermissions();
  const pageMutation = useProgressMutation('ProgressPage', 'progress-pages');
  const threadMutation = useProgressMutation('ReviewThread', 'progress-threads');
  const { user } = useAuth();
  const [showAssessment, setShowAssessment] = useState(false);
  const [quickSubject, setQuickSubject] = useState(null);

  const result = pageReadiness(page, { findings, verifications });
  const canWrite = can('progress_write');
  const openTasks = (threads || []).filter((t) => ['open', 'answered'].includes(t.status || 'open')).length;

  const latest = useMemo(() => (snapshots || [])
    .filter((s) => s.capture_status !== 'failed')
    .sort((a, b) => String(b.captured_at || b.created_date || '').localeCompare(String(a.captured_at || a.created_date || '')))[0], [snapshots]);

  const ageHours = latest
    ? (Date.now() - new Date(latest.captured_at || latest.created_date).getTime()) / 3600000
    : null;

  return (
    <div className="space-y-4">
      {/* Compact strip. Route, score, state, and the tick. Nothing else. */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-foreground">{page.title}</h2>
              <span className="font-mono text-[11px] text-muted-foreground">{page.route}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={toneForReadiness(result.score)}>{result.score}% ready</Badge>
              <Badge tone={LIFECYCLE_TONE[page.lifecycle_status] || 'neutral'}>
                {LIFECYCLE_LABEL[page.lifecycle_status] || 'Not started'}
              </Badge>
              {page.criticality && page.criticality !== 'normal' && (
                <Badge tone={page.criticality === 'critical' ? 'bad' : 'warn'}>{humanise(page.criticality)}</Badge>
              )}
              {openTasks > 0 && <Badge tone="warn">{openTasks} open</Badge>}
              {page.review_stale && <Badge tone="warn">Review stale</Badge>}
              {ageHours != null && ageHours > 24 && (
                <Badge tone="warn">Screenshot {Math.floor(ageHours / 24)}d old</Badge>
              )}
              {!page.registered && <Badge tone="warn">Not registered</Badge>}
            </div>
          </div>
          <SecondaryButton onClick={() => setShowAssessment(!showAssessment)}>
            {showAssessment ? 'Hide details' : 'Details'}
          </SecondaryButton>
        </CardBody>

        {showAssessment && (
          <CardBody className="border-t border-border">
            <AssessmentFields page={page} canWrite={canWrite} mutation={pageMutation} result={result} />
          </CardBody>
        )}
      </Card>

      {/* The review itself: screenshot beside the task list. */}
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <VisualReview
          page={page}
          snapshots={snapshots}
          threads={threads}
          capturing={capture?.running}
          onRecapture={(viewports) => capture?.run([page], { viewports, label: page.title })}
        />
        <TaskSidebar page={page} threads={threads} findings={findings} />
      </div>

      {/* What the backend actually does, in readable bullets. */}
      <BackendPlainEnglish page={page} onComment={setQuickSubject} />

      {quickSubject && (
        <QuickComment
          page={page}
          subject={quickSubject}
          role={user?.role}
          userEmail={user?.email}
          mutation={threadMutation}
          onClose={() => setQuickSubject(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Assessment, behind Details
 * ---------------------------------------------------------------- */

function AssessmentFields({ page, canWrite, mutation, result }) {
  const [draft, setDraft] = useState({
    purpose: page.purpose || '',
    gaps: page.gaps || '',
    human_notes: page.human_notes || '',
    criticality: page.criticality || 'normal',
    lifecycle_status: page.lifecycle_status || 'not_started',
    migration_required: page.migration_required == null ? '' : String(page.migration_required),
    leadbyte_equivalent: page.leadbyte_equivalent || '',
  });
  const [saved, setSaved] = useState(false);

  if (!page.registered) {
    return (
      <p className="text-[12px] text-muted-foreground">
        This route has no review record yet. Run Sync inventory from the Command Center to register it.
      </p>
    );
  }

  const save = () => {
    mutation.mutate({
      action: 'update',
      id: page.id,
      data: {
        ...draft,
        migration_required: draft.migration_required === '' ? null : draft.migration_required === 'true',
        last_reviewed_at: new Date().toISOString(),
        review_stale: false,
        needs_human_review: false,
      },
    }, { onSuccess: () => setSaved(true) });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Field label="What this page is for">
          <TextArea value={draft.purpose} onChange={(v) => setDraft({ ...draft, purpose: v })} disabled={!canWrite} rows={3} />
        </Field>
        <Field label="What is incomplete">
          <TextArea value={draft.gaps} onChange={(v) => setDraft({ ...draft, gaps: v })} disabled={!canWrite} rows={3} />
        </Field>
        <Field label="Your notes">
          <TextArea value={draft.human_notes} onChange={(v) => setDraft({ ...draft, human_notes: v })} disabled={!canWrite} rows={3} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Criticality">
          <Select value={draft.criticality} onChange={(v) => setDraft({ ...draft, criticality: v })} disabled={!canWrite}
            options={[['critical', 'Critical (5)'], ['high', 'High (3)'], ['normal', 'Normal (1)'], ['low', 'Low (0.5)']]} />
        </Field>
        <Field label="Lifecycle">
          <Select value={draft.lifecycle_status} onChange={(v) => setDraft({ ...draft, lifecycle_status: v })} disabled={!canWrite}
            options={Object.entries(LIFECYCLE_LABEL)} />
        </Field>
        <Field label="Needed for cutover">
          <Select value={draft.migration_required} onChange={(v) => setDraft({ ...draft, migration_required: v })} disabled={!canWrite}
            options={[['', 'Not decided'], ['true', 'Yes'], ['false', 'No']]} />
        </Field>
        <Field label="LeadByte equivalent">
          <TextInput value={draft.leadbyte_equivalent} onChange={(v) => setDraft({ ...draft, leadbyte_equivalent: v })} disabled={!canWrite} />
        </Field>
      </div>

      {result.explanation.applied_caps.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-2.5">
          {result.explanation.applied_caps.map((c, i) => (
            <li key={i} className="text-[11px] text-muted-foreground">
              Capped at {c.to} by {humanise(c.cap).toLowerCase()}: {c.why}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving' : 'Save'}
          </PrimaryButton>
          {saved && !mutation.isPending && <span className="text-[12px] text-chart-5">Saved</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Quick comment, raised from a backend bullet
 * ---------------------------------------------------------------- */

function QuickComment({ page, subject, role, userEmail, mutation, onClose }) {
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('P3');

  const submit = () => {
    if (!body.trim()) return;
    mutation.mutate({
      action: 'create',
      data: {
        page_key: page.page_key,
        subject_type: subject.subject_type,
        subject_ref: subject.subject_ref,
        subject_label: (subject.subject_label || '').slice(0, 300),
        body: body.trim(),
        severity,
        captured_context: JSON.stringify({
          route: page.route,
          page_key: page.page_key,
          subject: subject.subject_ref,
          role,
          captured_at: new Date().toISOString(),
        }),
        status: 'open',
        author_role: role,
        author_email: userEmail || null,
      },
    }, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-background/80" />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-popover">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-semibold text-foreground">
            Comment on {subject.subject_ref}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subject.subject_label}</p>
        </div>
        <div className="space-y-3 p-4">
          <Field label="What needs to change">
            <TextArea value={body} onChange={setBody} rows={4} />
          </Field>
          <Field label="Severity">
            <Select value={severity} onChange={setSeverity}
              options={[['P0', 'P0 blocker'], ['P1', 'P1 critical'], ['P2', 'P2 high'], ['P3', 'P3 normal'], ['P4', 'P4 low']]} />
          </Field>
          <div className="flex items-center gap-2">
            <PrimaryButton onClick={submit} disabled={!body.trim() || mutation.isPending}>
              {mutation.isPending ? 'Saving' : 'Add task'}
            </PrimaryButton>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Small form primitives
 * ---------------------------------------------------------------- */

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60';

function TextInput({ value, onChange, placeholder, disabled }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className={inputClass} />
  );
}

function TextArea({ value, onChange, rows = 3, placeholder, disabled }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} disabled={disabled} className={`${inputClass} resize-y`} />
  );
}

function Select({ value, onChange, options, disabled }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputClass}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
