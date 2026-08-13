import React, { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, GitPullRequest, Sparkles, ShieldCheck, MessageSquare,
  RefreshCw, Filter, GitBranch,
} from 'lucide-react';
import {
  useProgressFindings, useChangeRequests, usePromptDrafts, useReviewThreads,
  useVerificationRecords, useProgressSnapshots, useProgressPages,
  mergePagesWithManifest, usePageManifest, parseJson,
} from '@/components/progress/useProgress';
import {
  ProgressPageHeader, Card, CardHeader, CardBody, Badge, EmptyState,
  LoadingBlock, PRIORITY_TONE,
} from '@/components/progress/progressUi';

// Build Activity: one timeline across everything the system records.
//
// Repository events are deliberately absent rather than faked. GitHub sync needs
// a server side token that has not been configured, so rather than showing an
// empty commits panel that looks broken, this page says plainly what is missing
// and shows the activity that genuinely exists.

const KIND = {
  finding: { icon: AlertTriangle, label: 'Finding' },
  comment: { icon: MessageSquare, label: 'Comment' },
  change: { icon: GitPullRequest, label: 'Change request' },
  prompt: { icon: Sparkles, label: 'Prompt' },
  verification: { icon: ShieldCheck, label: 'Verification' },
  snapshot: { icon: RefreshCw, label: 'Readiness snapshot' },
};

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function BuildActivity() {
  const manifest = usePageManifest();
  const findingsQ = useProgressFindings();
  const changesQ = useChangeRequests();
  const promptsQ = usePromptDrafts();
  const threadsQ = useReviewThreads();
  const verifsQ = useVerificationRecords();
  const snapsQ = useProgressSnapshots();
  const pagesQ = useProgressPages();

  const [kindFilter, setKindFilter] = useState('');

  const pages = useMemo(() => mergePagesWithManifest(pagesQ.data || [], manifest.pages), [pagesQ.data, manifest]);
  const pageTitle = useMemo(() => {
    const m = new Map(pages.map((p) => [p.page_key, p.title]));
    return (k) => (k ? (m.get(k) || k) : null);
  }, [pages]);

  const events = useMemo(() => {
    const out = [];

    (findingsQ.data || []).forEach((f) => {
      out.push({
        kind: 'finding',
        at: f.created_date || f.created_at,
        title: f.title || f.check_id,
        detail: `${humanise(f.origin || 'machine')} finding${f.finding_type ? `, ${humanise(f.finding_type)}` : ''}`,
        page_key: f.page_key,
        badge: f.priority,
      });
      if (f.resolved_at) {
        out.push({
          kind: 'finding',
          at: f.resolved_at,
          title: `Resolved: ${f.title || f.check_id}`,
          detail: humanise(f.status),
          page_key: f.page_key,
          badge: f.priority,
        });
      }
    });

    (threadsQ.data || []).forEach((t) => out.push({
      kind: 'comment',
      at: t.created_date,
      title: t.body.slice(0, 120),
      detail: `On ${humanise(t.subject_type)}${t.subject_ref ? ` "${t.subject_ref}"` : ''}`,
      page_key: t.page_key,
      badge: t.severity,
    }));

    (changesQ.data || []).forEach((c) => {
      out.push({
        kind: 'change',
        at: c.created_date,
        title: `${c.reference} raised: ${c.title}`,
        detail: humanise(c.status),
        page_key: c.page_key,
        badge: c.priority,
      });
      parseJson(c.activity_log, []).forEach((e) => {
        if (!e.from) return;
        out.push({
          kind: 'change',
          at: e.at,
          title: `${c.reference} moved to ${humanise(e.to)}`,
          detail: `From ${humanise(e.from)}${e.note ? `, ${e.note}` : ''}`,
          page_key: c.page_key,
          badge: c.priority,
        });
      });
    });

    (promptsQ.data || []).forEach((p) => out.push({
      kind: 'prompt',
      at: p.created_date,
      title: `${p.reference} generated`,
      detail: `Target ${humanise(p.target)}, version ${p.version || 1}, status ${humanise(p.status)}`,
      page_key: p.page_key,
    }));

    (verifsQ.data || []).forEach((v) => out.push({
      kind: 'verification',
      at: v.created_date,
      title: `${humanise(v.check)}: ${humanise(v.result)}`,
      detail: `${humanise(v.subject_type)} ${v.subject_key}${v.verified_by ? `, by ${v.verified_by}` : ''}`,
      page_key: v.subject_type === 'page' ? v.subject_key : null,
    }));

    (snapsQ.data || []).forEach((s) => out.push({
      kind: 'snapshot',
      at: s.created_date || `${s.snapshot_date}T12:00:00Z`,
      title: `Readiness recalculated: platform ${s.platform_readiness}%, migration ${s.migration_readiness}%`,
      detail: `Recommendation ${humanise(s.recommendation)} at ${s.confidence} confidence`,
    }));

    return out
      .filter((e) => e.at)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [findingsQ.data, threadsQ.data, changesQ.data, promptsQ.data, verifsQ.data, snapsQ.data]);

  const filtered = kindFilter ? events.filter((e) => e.kind === kindFilter) : events;
  const loading = findingsQ.isLoading || changesQ.isLoading;

  if (loading) {
    return (
      <>
        <ProgressPageHeader title="Build Activity" description="Loading activity." />
        <LoadingBlock label="Assembling the timeline" />
      </>
    );
  }

  return (
    <>
      <ProgressPageHeader
        title="Build Activity"
        description={`${events.length} recorded events across findings, comments, change requests, prompts, verification and readiness runs.`}
      />

      <Card className="mb-4">
        <CardBody className="flex items-start gap-2.5">
          <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[13px] font-medium text-foreground">Repository events are not connected</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Commits, pull requests and build results need a server side GitHub token that has not been configured.
              Rather than showing an empty commits panel, this page reports the gap. Until it is wired, the stale review
              detection in the page inventory sync is the mechanism that links code movement to affected pages.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-2 py-2.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Everything</option>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} shown</span>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Activity}
            title="Nothing has happened yet"
            description="Activity appears as you comment on pages, triage findings, raise change requests and recalculate readiness."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Timeline" subtitle="Newest first" icon={Activity} />
          <div>
            {filtered.slice(0, 200).map((e, i) => {
              const K = KIND[e.kind] || KIND.finding;
              const Icon = K.icon;
              const page = pageTitle(e.page_key);
              return (
                <div key={i} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-foreground">{e.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {K.label}
                      {e.detail ? `, ${e.detail}` : ''}
                      {page ? `, on ${page}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {e.badge && <Badge tone={PRIORITY_TONE[e.badge] || 'neutral'}>{e.badge}</Badge>}
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                      {new Date(e.at).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length > 200 && (
            <CardBody className="border-t border-border py-2">
              <p className="text-[11px] text-muted-foreground">Showing the most recent 200 of {filtered.length}.</p>
            </CardBody>
          )}
        </Card>
      )}
    </>
  );
}
