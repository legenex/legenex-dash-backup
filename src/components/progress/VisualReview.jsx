import React, { useMemo, useRef, useState } from 'react';
import {
  Camera, RefreshCw, AlertTriangle, EyeOff, Eye, MessageSquarePlus, Trash2, X,
  Maximize2, Minimize2,
} from 'lucide-react';
import { usePermissions, useAuth } from '@/lib/AuthContext';
import { cropAndUpload } from '@/lib/progress/capture';
import { ALL_VIEWPORTS } from '@/lib/progress/captureTargets';
import { maskEnabled, setMaskEnabled } from '@/components/progress/CaptureController';
import { useProgressMutation } from '@/components/progress/useProgress';
import {
  Card, CardHeader, CardBody, Badge, EmptyState, PrimaryButton, SecondaryButton,
} from '@/components/progress/progressUi';

// Visual Review: the captured page, with comments drawn on it.
//
// Drag a box over the thing that is wrong. The box is stored in natural image
// pixels so it can be redrawn later, the region is cropped and uploaded on its
// own so the comment is readable without opening the full capture, and the
// element under the box is identified where possible.

const VIEWPORT_TABS = [
  { key: 'desktop', label: 'Desktop' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'mobile', label: 'Mobile' },
];

const SEVERITIES = [
  ['P0', 'P0 migration or production blocker'],
  ['P1', 'P1 critical'],
  ['P2', 'P2 high'],
  ['P3', 'P3 normal'],
  ['P4', 'P4 low'],
];

const FINDING_TYPES = [
  'ui_inconsistency', 'ux_problem', 'incorrect_metric', 'data_inconsistency',
  'missing_functionality', 'mobile', 'accessibility', 'missing_state',
  'copy_terminology', 'user_request',
];

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function VisualReview({ page, snapshots, threads, onRecapture, capturing }) {
  const { can, role } = usePermissions();
  const { user } = useAuth();
  const [viewport, setViewport] = useState('desktop');
  const [masked, setMasked] = useState(maskEnabled());
  const [expanded, setExpanded] = useState(false);

  const canCapture = can('progress_write') || can('progress_admin');
  const canComment = can('progress_write') || can('progress_review');

  const forViewport = useMemo(
    () => (snapshots || [])
      .filter((s) => s.viewport === viewport)
      .sort((a, b) => String(b.captured_at || b.created_date || '').localeCompare(String(a.captured_at || a.created_date || ''))),
    [snapshots, viewport],
  );
  const latest = forViewport[0] || null;
  const previous = forViewport.slice(1, 5);

  const anchored = useMemo(
    () => (threads || []).filter((t) => t.snapshot_id && t.region),
    [threads],
  );

  // Offscreen. Nothing navigates: the page is mounted in a hidden container at a
  // fixed width, captured, and removed. That is also why tablet and mobile are
  // possible from a desktop browser.
  // Default to every size. Capturing one viewport and leaving the other two
  // stale was busywork nobody should have to remember.
  const recapture = (viewports) => onRecapture?.(viewports || ['desktop', 'tablet', 'mobile']);

  const toggleMask = () => {
    const next = !masked;
    setMaskEnabled(next);
    setMasked(next);
  };

  const counts = useMemo(() => {
    const byVp = {};
    (snapshots || []).forEach((s) => { byVp[s.viewport] = (byVp[s.viewport] || 0) + 1; });
    return byVp;
  }, [snapshots]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Visual review"
          subtitle={`Captured in your own session on the real page. ${masked ? 'Personal data is redacted before the image is stored.' : 'Masking is OFF: captures will contain real personal data.'}`}
          icon={Camera}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <SecondaryButton onClick={() => setExpanded(true)} disabled={!snapshots?.length}>
                <span className="flex items-center gap-1.5">
                  <Maximize2 className="h-3.5 w-3.5" />
                  Full size
                </span>
              </SecondaryButton>
              <SecondaryButton onClick={toggleMask}>
                <span className="flex items-center gap-1.5">
                  {masked ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {masked ? 'Masking on' : 'Masking off'}
                </span>
              </SecondaryButton>
              {canCapture && (
                <>
                  <SecondaryButton onClick={() => recapture([viewport])} disabled={capturing}>
                    {viewport} only
                  </SecondaryButton>
                  <PrimaryButton onClick={() => recapture()} disabled={capturing}>
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className={`h-3.5 w-3.5 ${capturing ? 'animate-spin' : ''}`} />
                      {capturing ? 'Capturing' : (latest ? 'Recapture all sizes' : 'Capture all sizes')}
                    </span>
                  </PrimaryButton>
                </>
              )}
            </div>
          )}
        />
        <CardBody className="pt-0">
          {!masked && (
            <p className="mb-3 rounded-md border border-border bg-secondary px-2.5 py-2 text-[12px] text-chart-3">
              Masking is off. Any capture taken now stores real names, emails, phone numbers and tokens in the
              snapshot store. Turn it back on unless you have a specific reason not to.
            </p>
          )}
          <div className="flex flex-wrap gap-1 border-b border-border">
            {VIEWPORT_TABS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setViewport(v.key)}
                className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  viewport === v.key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {v.label}
                {counts[v.key] > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {counts[v.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {!latest ? (
        <Card>
          <EmptyState
            icon={Camera}
            title={`No ${viewport} capture yet`}
            description={canCapture
              ? 'Capture renders this page with its real sidebar and sub-menu, lets it settle, and stores desktop, tablet and mobile in one go. Nothing navigates.'
              : 'Nobody with capture permission has taken a screenshot of this page yet.'}
            action={canCapture ? <PrimaryButton onClick={() => recapture(ALL_VIEWPORTS)} disabled={capturing}>Capture all sizes</PrimaryButton> : null}
          />
        </Card>
      ) : latest.capture_status === 'failed' ? (
        <Card>
          <CardBody className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-medium text-foreground">The last capture failed</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{latest.failure_reason}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Attempted {new Date(latest.captured_at || latest.created_date).toLocaleString()}. This is recorded as a
                failed capture rather than left blank, so the gap is visible.
              </p>
              {canCapture && <div className="mt-3"><SecondaryButton onClick={() => recapture()} disabled={capturing}>Try again</SecondaryButton></div>}
            </div>
          </CardBody>
        </Card>
      ) : (
        <AnnotatableSnapshot
          snapshot={latest}
          page={page}
          threads={anchored.filter((t) => t.snapshot_id === latest.id)}
          canComment={canComment}
          role={role}
          userEmail={user?.email}
        />
      )}

      {expanded && latest?.image_url && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-foreground">{page.title}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{page.route}</span>
              <Badge tone="neutral">{viewport}</Badge>
              {latest.masked
                ? <Badge tone="good">{latest.mask_count || 0} redacted</Badge>
                : <Badge tone="warn">Unmasked</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                Drag a box over anything that is wrong
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Close
              </button>
            </div>
          </div>
          {/* The capture is 1920 wide. In a column it scales down to something
              unreadable, which defeats the point of reviewing it. Here it gets
              the whole viewport and scrolls at full size. */}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <AnnotatableSnapshot
              snapshot={latest}
              page={page}
              threads={anchored.filter((t) => t.snapshot_id === latest.id)}
              canComment={canComment}
              role={role}
              userEmail={user?.email}
              bare
            />
          </div>
        </div>
      )}

      {previous.length > 0 && (
        <Card>
          <CardHeader title={`Previous ${viewport} captures (${previous.length})`} subtitle="Compare against the current one to see what moved" />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {previous.map((s) => (
                <a
                  key={s.id}
                  href={s.image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block overflow-hidden rounded-md border border-border transition-colors hover:border-primary"
                >
                  {s.image_url ? (
                    <img src={s.image_url} alt="" className="h-24 w-full object-cover object-top" />
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-secondary text-[10px] text-muted-foreground">
                      failed
                    </div>
                  )}
                  <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                    {new Date(s.captured_at || s.created_date).toLocaleDateString()}
                    {s.app_commit ? `, ${s.app_commit.slice(0, 7)}` : ''}
                  </p>
                </a>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * The annotatable image
 * ---------------------------------------------------------------- */

function AnnotatableSnapshot({ snapshot, page, threads, canComment, role, userEmail, bare }) {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [pending, setPending] = useState(null);
  const [active, setActive] = useState(null);

  // Display coordinates to natural image pixels.
  const toNatural = (clientX, clientY) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    return {
      x: Math.max(0, Math.min(img.naturalWidth, (clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(img.naturalHeight, (clientY - rect.top) * scaleY)),
    };
  };

  const onPointerDown = (e) => {
    if (!canComment || pending) return;
    e.preventDefault();
    const start = toNatural(e.clientX, e.clientY);
    setDrag({ start, current: start });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    setDrag({ ...drag, current: toNatural(e.clientX, e.clientY) });
  };

  const onPointerUp = () => {
    if (!drag) return;
    const region = normalise(drag.start, drag.current);
    setDrag(null);
    // Ignore an accidental click rather than opening a composer for a 2px box.
    if (region.w < 8 || region.h < 8) return;
    setPending(region);
  };

  const previewRegion = drag ? normalise(drag.start, drag.current) : null;

  const surface = (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-md border border-border bg-background"
      style={{ cursor: canComment ? 'crosshair' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <img
        ref={imgRef}
        src={snapshot.image_url}
        alt={`${page.title} capture`}
        className="block w-full select-none"
        draggable={false}
      />
      {threads.map((t) => {
        const r = safeRegion(t.region);
        if (!r) return null;
        return (
          <button
            key={t.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); setActive(t); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`absolute rounded-sm border-2 transition-colors ${
              t.severity === 'P0' || t.severity === 'P1'
                ? 'border-primary bg-primary/10 hover:bg-primary/20'
                : 'border-chart-3 bg-chart-3/10 hover:bg-chart-3/20'
            }`}
            style={pct(r, imgRef.current)}
            title={t.body}
          >
            <span className="absolute -top-2 -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {t.severity?.replace('P', '') ?? '?'}
            </span>
          </button>
        );
      })}
      {previewRegion && (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/10"
          style={pct(previewRegion, imgRef.current)}
        />
      )}
    </div>
  );

  if (bare) {
    return (
      <>
        {surface}
        {pending && (
          <RegionComposer
            region={pending}
            snapshot={snapshot}
            page={page}
            role={role}
            userEmail={userEmail}
            onClose={() => setPending(null)}
          />
        )}
        {active && <ThreadViewer thread={active} onClose={() => setActive(null)} />}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title={page.title}
          subtitle={canComment
            ? 'Drag a box over anything that is wrong to comment on it'
            : 'Read only. You need progress write or review permission to annotate.'}
          actions={(
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{snapshot.width} by {snapshot.height}</Badge>
              {snapshot.masked
                ? <Badge tone="good">{snapshot.mask_count || 0} redacted</Badge>
                : <Badge tone="warn">Unmasked</Badge>}
              <Badge tone="neutral">
                {new Date(snapshot.captured_at || snapshot.created_date).toLocaleString()}
              </Badge>
            </div>
          )}
        />
        <CardBody>
          {surface}

          {threads.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {threads.length} anchored comment{threads.length === 1 ? '' : 's'} on this capture. Click a box to read it.
            </p>
          )}
        </CardBody>
      </Card>

      {pending && (
        <RegionComposer
          region={pending}
          snapshot={snapshot}
          page={page}
          role={role}
          userEmail={userEmail}
          onClose={() => setPending(null)}
        />
      )}

      {active && <ThreadViewer thread={active} onClose={() => setActive(null)} />}
    </>
  );
}

function normalise(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function safeRegion(value) {
  try {
    const r = typeof value === 'string' ? JSON.parse(value) : value;
    if (!r || !Number.isFinite(r.x)) return null;
    return r;
  } catch { return null; }
}

// Position a box over the image using percentages, so it stays correct when the
// image is scaled to fit whatever width the workspace has.
function pct(region, img) {
  const nw = img?.naturalWidth || 1;
  const nh = img?.naturalHeight || 1;
  return {
    left: `${(region.x / nw) * 100}%`,
    top: `${(region.y / nh) * 100}%`,
    width: `${(region.w / nw) * 100}%`,
    height: `${(region.h / nh) * 100}%`,
  };
}

/* ---------------------------------------------------------------- *
 * Composer
 * ---------------------------------------------------------------- */

function RegionComposer({ region, snapshot, page, role, userEmail, onClose }) {
  const mutation = useProgressMutation('ReviewThread', 'progress-threads');
  const [form, setForm] = useState({
    body: '',
    severity: 'P3',
    finding_type: '',
    subject_ref: '',
    observed_value: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.body.trim()) return;
    setSaving(true);
    setError('');
    let cropUrl = '';
    try {
      cropUrl = await cropAndUpload(snapshot.image_url, region, `${page.page_key}-region`);
    } catch (err) {
      // A missing crop is not worth losing the comment over.
      setError(`The region crop could not be saved (${String(err?.message || err)}). The comment and its coordinates were kept.`);
    }

    mutation.mutate({
      action: 'create',
      data: {
        page_key: page.page_key,
        subject_type: 'screenshot_region',
        subject_ref: form.subject_ref || null,
        observed_value: form.observed_value || null,
        body: form.body.trim(),
        severity: form.severity,
        finding_type: form.finding_type || null,
        snapshot_id: snapshot.id,
        region: JSON.stringify(region),
        crop_url: cropUrl || null,
        captured_context: JSON.stringify({
          route: snapshot.route,
          page_key: page.page_key,
          viewport: snapshot.viewport,
          capture_width: snapshot.width,
          theme: snapshot.theme,
          app_commit: snapshot.app_commit,
          role,
          masked: snapshot.masked,
          captured_at: new Date().toISOString(),
        }),
        status: 'open',
        author_role: role,
        author_email: userEmail || null,
      },
    }, {
      onSuccess: () => { setSaving(false); onClose(); },
      onError: (err) => { setSaving(false); setError(String(err?.message || err)); },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-background/80" />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-popover">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Comment on this region</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {Math.round(region.w)} by {Math.round(region.h)} pixels on {page.title}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <Field label="What is wrong, and what it should do instead">
            <textarea
              autoFocus
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={4}
              placeholder="e.g. This sold count does not match the Leads page for the same range. Looks like it filters on created date rather than sold date."
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="What is this (metric, pill, column)">
              <input
                value={form.subject_ref}
                onChange={(e) => setForm({ ...form, subject_ref: e.target.value })}
                placeholder="e.g. Sold leads"
                className={inputClass}
              />
            </Field>
            <Field label="Value shown">
              <input
                value={form.observed_value}
                onChange={(e) => setForm({ ...form, observed_value: e.target.value })}
                placeholder="e.g. 1,482"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Severity">
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className={inputClass}>
                {SEVERITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select value={form.finding_type} onChange={(e) => setForm({ ...form, finding_type: e.target.value })} className={inputClass}>
                <option value="">Not classified</option>
                {FINDING_TYPES.map((t) => <option key={t} value={t}>{humanise(t)}</option>)}
              </select>
            </Field>
          </div>

          {error && <p className="text-[12px] text-chart-3">{error}</p>}

          <div className="flex items-center gap-2">
            <PrimaryButton onClick={submit} disabled={!form.body.trim() || saving}>
              <span className="flex items-center gap-1.5">
                <MessageSquarePlus className="h-3.5 w-3.5" />
                {saving ? 'Saving' : 'Add comment'}
              </span>
            </PrimaryButton>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadViewer({ thread, onClose }) {
  const mutation = useProgressMutation('ReviewThread', 'progress-threads');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-background/80" />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-popover">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge tone={thread.severity === 'P0' || thread.severity === 'P1' ? 'bad' : 'warn'}>{thread.severity}</Badge>
            <Badge tone="neutral">{humanise(thread.status)}</Badge>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          {thread.crop_url && (
            <img src={thread.crop_url} alt="" className="w-full rounded-md border border-border" />
          )}
          {thread.subject_ref && (
            <p className="text-[11px] text-muted-foreground">
              On <span className="text-foreground">{thread.subject_ref}</span>
              {thread.observed_value ? ` showing ${thread.observed_value}` : ''}
            </p>
          )}
          <p className="text-[13px] leading-snug text-foreground">{thread.body}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(thread.created_date).toLocaleString()}
            {thread.author_email ? ` by ${thread.author_email}` : ''}
          </p>
          {thread.status === 'open' && (
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <SecondaryButton onClick={() => { mutation.mutate({ action: 'update', id: thread.id, data: { status: 'resolved' } }); onClose(); }}>
                Mark resolved
              </SecondaryButton>
              <button
                type="button"
                onClick={() => { mutation.mutate({ action: 'delete', id: thread.id }); onClose(); }}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-accent"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass = 'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
