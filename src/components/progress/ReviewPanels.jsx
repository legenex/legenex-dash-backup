import React, { useMemo, useState } from 'react';
import {
  CheckSquare, Square, Sparkles, ChevronDown, ChevronRight, Server, Database,
  ShieldAlert, MessageSquarePlus, Loader2, ArrowRight, FileWarning,
} from 'lucide-react';
import { usePermissions, useAuth } from '@/lib/AuthContext';
import backendSummary from '@/lib/progress/backendSummary.json';
import {
  useProgressMutation, useChangeRequests, useGeneratePrompt, parseJson,
} from '@/components/progress/useProgress';
import {
  Card, CardHeader, CardBody, Badge, EmptyState, PrimaryButton, SecondaryButton,
  PRIORITY_TONE,
} from '@/components/progress/progressUi';

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const OPEN_STATES = ['open', 'answered'];

/* ================================================================ *
 * Task sidebar
 * ================================================================ */

// The comments on a page ARE the task list. Ticking one off resolves it; the
// selected ones become a change request, and from there a prompt. There is no
// separate task entity to keep in step with the comments.
export function TaskSidebar({ page, threads, findings, onJumpToRegion }) {
  const { can } = usePermissions();
  const { user } = useAuth();
  const threadMutation = useProgressMutation('ReviewThread', 'progress-threads');
  const pageMutation = useProgressMutation('ProgressPage', 'progress-pages');
  const changeMutation = useProgressMutation('ChangeRequest', 'progress-changes');
  const changesQ = useChangeRequests();
  const generate = useGeneratePrompt();

  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const canWrite = can('progress_write') || can('progress_review');
  const canPrompt = can('progress_prompts');

  const open = useMemo(
    () => (threads || []).filter((t) => OPEN_STATES.includes(t.status || 'open')),
    [threads],
  );
  const done = useMemo(
    () => (threads || []).filter((t) => ['resolved', 'converted', 'wont_fix'].includes(t.status)),
    [threads],
  );
  const openFindings = useMemo(
    () => (findings || []).filter((f) => ['open', 'acknowledged'].includes(f.status || 'open')),
    [findings],
  );

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const tick = (thread) => {
    threadMutation.mutate({
      action: 'update',
      id: thread.id,
      data: { status: OPEN_STATES.includes(thread.status || 'open') ? 'resolved' : 'open' },
    });
  };

  const markPageComplete = () => {
    if (!page.id) return;
    const next = !page.review_complete;
    pageMutation.mutate({
      action: 'update',
      id: page.id,
      data: {
        review_complete: next,
        review_completed_at: next ? new Date().toISOString() : null,
        review_completed_by: next ? (user?.email || null) : null,
        last_reviewed_at: next ? new Date().toISOString() : page.last_reviewed_at,
        review_stale: false,
      },
    });
  };

  // Turn the selected comments into one change request, then generate the prompt.
  const buildFix = async () => {
    const chosen = open.filter((t) => selected.includes(t.id));
    if (chosen.length === 0) return;
    setBusy(true);
    setResult('');

    const worst = ['P0', 'P1', 'P2', 'P3', 'P4'].find((p) => chosen.some((t) => t.severity === p)) || 'P3';
    const ref = `CR-${String((changesQ.data || []).length + 1).padStart(3, '0')}`;

    changeMutation.mutate({
      action: 'create',
      data: {
        reference: ref,
        title: `${page.title}: ${chosen.length} review item${chosen.length === 1 ? '' : 's'}`,
        page_key: page.page_key,
        problem: chosen.map((t) => `${t.subject_ref ? `${t.subject_ref}: ` : ''}${t.body}`).join('\n\n'),
        user_request: chosen.map((t) => t.body).join('\n\n'),
        priority: worst,
        status: 'draft',
        related_thread_ids: JSON.stringify(chosen.map((t) => t.id)),
        related_finding_ids: JSON.stringify([]),
        estimated_risk: worst === 'P0' || worst === 'P1' ? 'high' : 'medium',
        activity_log: JSON.stringify([{
          at: new Date().toISOString(),
          actor: user?.email || 'progress',
          from: null,
          to: 'draft',
          note: `Raised from ${chosen.length} visual review comment(s)`,
        }]),
      },
    }, {
      onSuccess: (created) => {
        chosen.forEach((t) => threadMutation.mutate({
          action: 'update',
          id: t.id,
          data: { status: 'converted', converted_change_request_id: created?.id || null },
        }));
        if (canPrompt && created?.id) {
          generate.mutate({ change_request_id: created.id }, {
            onSuccess: () => { setBusy(false); setSelected([]); setResult(`${ref} created and a prompt drafted. Review it in Prompt Studio.`); },
            onError: (e) => { setBusy(false); setResult(`${ref} created, but the prompt failed: ${String(e?.message || e)}`); },
          });
        } else {
          setBusy(false);
          setSelected([]);
          setResult(`${ref} created. Generate the prompt from Change Requests.`);
        }
      },
      onError: (e) => { setBusy(false); setResult(String(e?.message || e)); },
    });
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardBody className="space-y-3">
          <button
            type="button"
            onClick={markPageComplete}
            disabled={!canWrite || !page.id}
            className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
              page.review_complete
                ? 'border-chart-5 bg-chart-5/10'
                : 'border-border hover:bg-accent'
            }`}
          >
            {page.review_complete
              ? <CheckSquare className="h-4 w-4 shrink-0 text-chart-5" />
              : <Square className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">
                {page.review_complete ? 'Page reviewed' : 'Mark this page reviewed'}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {page.review_complete && page.review_completed_at
                  ? `Ticked ${new Date(page.review_completed_at).toLocaleDateString()}`
                  : 'Your tick. Separate from the evidence based readiness score.'}
              </span>
            </span>
          </button>

          {open.length > 0 && page.review_complete && (
            <p className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[11px] text-chart-3">
              {open.length} open item{open.length === 1 ? '' : 's'} still on this page.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Tasks (${open.length})`}
          subtitle={open.length ? 'Tick to close. Select to turn into a fix.' : 'Drag a box on the screenshot to add one.'}
          icon={CheckSquare}
        />
        {open.length === 0 && done.length === 0 && openFindings.length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="Nothing raised yet"
            description="Draw on the screenshot, or select a backend bullet below."
          />
        ) : (
          <div className="max-h-[26rem] overflow-y-auto">
            {open.map((t) => (
              <div key={t.id} className="border-b border-border px-3 py-2.5 last:border-b-0">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => canWrite && toggle(t.id)}
                    disabled={!canWrite}
                    className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    aria-label="Select"
                  >
                    {selected.includes(t.id)
                      ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      : <Square className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    {t.subject_ref && (
                      <p className="text-[10px] text-muted-foreground">
                        {t.subject_ref}
                        {t.observed_value ? ` showing ${t.observed_value}` : ''}
                      </p>
                    )}
                    <p className="text-[12px] leading-snug text-foreground">{t.body}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={PRIORITY_TONE[t.severity]}>{t.severity}</Badge>
                      {t.finding_type && <Badge tone="neutral">{humanise(t.finding_type)}</Badge>}
                      {t.region && onJumpToRegion && (
                        <button
                          type="button"
                          onClick={() => onJumpToRegion(t)}
                          className="text-[10px] text-primary hover:opacity-80"
                        >
                          show on screenshot
                        </button>
                      )}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => tick(t)}
                      title="Mark resolved"
                      className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-chart-5"
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {openFindings.map((f) => (
              <div key={f.id} className="border-b border-border bg-secondary/40 px-3 py-2.5 last:border-b-0">
                <div className="flex items-start gap-2">
                  <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chart-3" />
                  <div className="min-w-0">
                    <p className="text-[12px] leading-snug text-foreground">{f.title || f.check_id}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {f.priority && <Badge tone={PRIORITY_TONE[f.priority]}>{f.priority}</Badge>}
                      <Badge tone="neutral">finding</Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {done.length > 0 && (
              <div className="px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {done.length} closed
                </p>
              </div>
            )}
          </div>
        )}

        {canWrite && open.length > 0 && (
          <CardBody className="border-t border-border">
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={buildFix} disabled={selected.length === 0 || busy}>
                <span className="flex items-center gap-1.5">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {busy ? 'Building' : `Generate fix (${selected.length})`}
                </span>
              </PrimaryButton>
              {selected.length > 0 && (
                <SecondaryButton onClick={() => setSelected([])}>Clear</SecondaryButton>
              )}
            </div>
            {result && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-chart-5">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                {result}
              </p>
            )}
            {!canPrompt && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                You can raise the change request. Prompt generation needs the progress prompts permission.
              </p>
            )}
          </CardBody>
        )}
      </Card>
    </div>
  );
}

/* ================================================================ *
 * Backend, in plain English
 * ================================================================ */

const byName = (list) => {
  const m = new Map();
  (list || []).forEach((x) => m.set(x.name, x));
  return m;
};
const FUNCTIONS = byName(backendSummary.functions);
const ENTITIES = byName(backendSummary.entities);

// A readable sentence for a function, using its own header comment where one
// exists and derived facts where it does not. Never invented.
function functionBullets(fn) {
  if (!fn) return [];
  const out = [];
  if (fn.documented && fn.headline) {
    out.push({ kind: 'purpose', text: fn.headline });
    fn.detail.slice(0, 2).forEach((d) => out.push({ kind: 'detail', text: d }));
  } else {
    out.push({
      kind: 'undocumented',
      text: 'No description written at the top of this function, so what it is for has to be inferred from the code.',
    });
  }
  if (fn.writes.length) {
    out.push({ kind: 'writes', text: `Writes to ${fn.writes.join(', ')}.` });
  } else {
    out.push({ kind: 'reads', text: 'Read only. It never creates, updates or deletes a record.' });
  }
  if (fn.reads.length) out.push({ kind: 'reads', text: `Reads ${fn.reads.slice(0, 8).join(', ')}${fn.reads.length > 8 ? ' and others' : ''}.` });
  const AUTH_TEXT = {
    operator_session: 'Requires a signed-in operator and checks their role before reading anything.',
    session_only: 'Requires a signed-in user, but no role check was detected.',
    api_key: 'Authenticated by API key, which is how suppliers post in.',
    route_token: 'Authenticated by a route token.',
    none_detected: 'No authentication mechanism was detected. Worth confirming by hand.',
  };
  out.push({ kind: 'auth', text: AUTH_TEXT[fn.auth_style] || '' });
  if (fn.external_hosts.length) out.push({ kind: 'external', text: `Calls out to ${fn.external_hosts.join(', ')}.` });
  if (fn.red_surfaces.length) {
    out.push({ kind: 'red', text: `Touches RED surfaces: ${fn.red_surfaces.join(', ')}. Never change without explicit approval.` });
  }
  return out.filter((b) => b.text);
}

function entityBullets(ent) {
  if (!ent) return [];
  const out = [
    { kind: 'shape', text: `${ent.field_count} fields${ent.required.length ? `, required: ${ent.required.join(', ')}` : ', nothing required'}.` },
  ];
  if (!ent.has_rls) {
    out.push({ kind: 'red', text: 'No row level security on this entity. Access depends entirely on the calling code.' });
  } else {
    out.push({ kind: 'auth', text: `Row level security set on ${ent.rls_operations.join(', ')}.` });
  }
  if (ent.undocumented_fields > 0) {
    out.push({ kind: 'undocumented', text: `${ent.undocumented_fields} of ${ent.field_count} fields have no description.` });
  }
  ent.highlights.slice(0, 2).forEach((h) => out.push({ kind: 'detail', text: h }));
  return out;
}

const KIND_TONE = {
  red: 'bad',
  undocumented: 'warn',
  writes: 'warn',
  auth: 'info',
  external: 'info',
};

// Two columns of bullets. Click any bullet to comment on that specific thing.
export function BackendPlainEnglish({ page, onComment }) {
  const { can } = usePermissions();
  const [openItem, setOpenItem] = useState(null);

  const functions = parseJson(page.function_dependencies, []);
  const entities = parseJson(page.entity_dependencies, []);
  const canComment = can('progress_write') || can('progress_review');

  const items = useMemo(() => {
    const list = [];
    functions.forEach((name) => list.push({
      type: 'backend_function',
      name,
      icon: Server,
      bullets: functionBullets(FUNCTIONS.get(name)),
      known: FUNCTIONS.has(name),
    }));
    entities.forEach((name) => list.push({
      type: 'entity',
      name,
      icon: Database,
      bullets: entityBullets(ENTITIES.get(name)),
      known: ENTITIES.has(name),
    }));
    return list;
  }, [functions, entities]);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader title="What the backend does here" icon={Server} />
        <EmptyState
          icon={Server}
          title="No backend dependencies detected"
          description="This surface either renders static content or gets its data through a layout. Nothing to summarise."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="What the backend does here, in plain English"
        subtitle={`${functions.length} function${functions.length === 1 ? '' : 's'} and ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'}. Click any line to comment on it.`}
        icon={Server}
      />
      <CardBody>
        <div className="columns-1 gap-4 lg:columns-2">
          {items.map((item) => {
            const Icon = item.icon;
            const expanded = openItem === `${item.type}:${item.name}`;
            return (
              <div key={`${item.type}:${item.name}`} className="mb-3 break-inside-avoid rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setOpenItem(expanded ? null : `${item.type}:${item.name}`)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  {expanded
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{item.name}</span>
                  {item.bullets.some((b) => b.kind === 'red') && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  {!item.known && <Badge tone="warn">unknown</Badge>}
                </button>

                {expanded && (
                  <ul className="space-y-1 border-t border-border px-3 py-2">
                    {item.bullets.map((b, i) => (
                      <li key={i} className="group flex items-start gap-2">
                        <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${
                          b.kind === 'red' ? 'bg-primary' : b.kind === 'undocumented' ? 'bg-chart-3' : 'bg-muted-foreground'
                        }`} />
                        <span className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
                          {b.text}
                          {KIND_TONE[b.kind] && (
                            <span className="ml-1.5 align-middle">
                              <Badge tone={KIND_TONE[b.kind]}>{humanise(b.kind)}</Badge>
                            </span>
                          )}
                        </span>
                        {canComment && onComment && (
                          <button
                            type="button"
                            onClick={() => onComment({
                              subject_type: item.type,
                              subject_ref: item.name,
                              subject_label: b.text,
                            })}
                            className="shrink-0 rounded-md p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                            title="Comment on this"
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
