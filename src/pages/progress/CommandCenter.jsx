import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  RefreshCw, AlertTriangle, CheckCircle2, HelpCircle, ArrowRight, Database, Clock,
} from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import {
  pageReadiness, weightedAverage, sectionBreakdown, migrationReadiness,
  evaluateGates, gateSummary, recommend,
} from '@/lib/progress/readiness';
import {
  useProgressPages, useProgressFindings, useReleaseGates, useMigrationRequirements,
  useVerificationRecords, useProgressSnapshots, useRecalculate, useSyncInventory,
  mergePagesWithManifest, usePageManifest,
} from '@/components/progress/useProgress';
import {
  ProgressPageHeader, Card, CardHeader, CardBody, StatCard, Badge, EmptyState,
  PrimaryButton, SecondaryButton, LoadingBlock, ReadinessBar, toneForReadiness,
  RECOMMENDATION_LABEL, RECOMMENDATION_TONE, Row,
} from '@/components/progress/progressUi';

// Command Center: the executive view.
//
// Every number here is computed from records through the same canonical model
// the backend uses (src/lib/progress/readiness.js, bundled into the functions and
// guarded by a parity check). Nothing on this page is a placeholder or a demo
// value. When there is no data, the surface says so plainly instead of showing a
// flattering number.

const groupBy = (list, key) => {
  const out = {};
  (list || []).forEach((item) => {
    const k = item[key];
    if (!k) return;
    (out[k] = out[k] || []).push(item);
  });
  return out;
};

export default function CommandCenter() {
  const { can } = usePermissions();
  const manifest = usePageManifest();

  const pagesQ = useProgressPages();
  const findingsQ = useProgressFindings();
  const gatesQ = useReleaseGates();
  const reqsQ = useMigrationRequirements();
  const verifsQ = useVerificationRecords();
  const snapsQ = useProgressSnapshots();

  const recalc = useRecalculate();
  const sync = useSyncInventory();

  const loading = pagesQ.isLoading || findingsQ.isLoading || gatesQ.isLoading || reqsQ.isLoading;

  const model = useMemo(() => {
    const records = pagesQ.data || [];
    const pages = mergePagesWithManifest(records, manifest.pages);
    const findings = findingsQ.data || [];
    const gates = gatesQ.data || [];
    const requirements = reqsQ.data || [];
    const verifications = verifsQ.data || [];

    const findingsByPage = groupBy(findings, 'page_key');
    const verifsByPage = groupBy(verifications.filter((v) => v.subject_type === 'page'), 'subject_key');

    const results = pages.map((p) => pageReadiness(p, {
      findings: findingsByPage[p.page_key] || [],
      verifications: verifsByPage[p.page_key] || [],
    }));

    const platform = weightedAverage(results);
    const sections = sectionBreakdown(results, pages);
    const migration = migrationReadiness(requirements);
    const evaluated = evaluateGates(gates, { findings, pageResults: results, pages, requirements });
    const gateStats = gateSummary(evaluated);
    const verdict = recommend({ platform, migration, gates: gateStats, findings, pages, requirements });

    const scored = results.filter((r) => r.scored);
    const openFindings = findings.filter((f) => ['open', 'acknowledged'].includes(f.status || 'open'));

    return {
      pages, results, platform, sections, migration, gateStats, verdict, scored, openFindings,
      registered: records.length,
      inManifest: manifest.pages.length,
      verified: scored.filter((r) => r.verification_status === 'verified').length,
      implemented: scored.filter((r) => ['implemented_unverified', 'verified'].includes(r.lifecycle)).length,
      blocked: scored.filter((r) => r.blocked).length,
      staleReviews: pages.filter((p) => p.review_stale).length,
      needingReview: pages.filter((p) => p.needs_human_review).length,
      neverAssessed: scored.filter((r) => r.lifecycle === 'not_started').length,
      requirements,
      findingsBySeverity: ['P0', 'P1', 'P2', 'P3', 'P4'].map((p) => ({
        severity: p,
        open: openFindings.filter((f) => f.priority === p).length,
      })),
    };
  }, [pagesQ.data, findingsQ.data, gatesQ.data, reqsQ.data, verifsQ.data, manifest]);

  const trend = useMemo(() => (snapsQ.data || [])
    .slice(0, 60)
    .map((s) => ({
      date: (s.snapshot_date || '').slice(5),
      platform: s.platform_readiness ?? 0,
      migration: s.migration_readiness ?? 0,
    }))
    .reverse(), [snapsQ.data]);

  if (loading) {
    return (
      <>
        <ProgressPageHeader title="Command Center" description="Loading readiness from live records." />
        <LoadingBlock label="Reading progress records" />
      </>
    );
  }

  const notSynced = model.registered === 0;
  const partiallySynced = model.registered > 0 && model.registered < model.inManifest;

  return (
    <>
      <ProgressPageHeader
        title="Command Center"
        description={`${model.inManifest} surfaces in the router, ${model.registered} registered for review. Every figure below is computed from records, never estimated.`}
        actions={(
          <>
            {can('progress_admin') && (
              <SecondaryButton onClick={() => sync.mutate({})} disabled={sync.isPending}>
                <span className="flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5" />
                  {sync.isPending ? 'Syncing' : 'Sync inventory'}
                </span>
              </SecondaryButton>
            )}
            {can('progress_write') && (
              <PrimaryButton onClick={() => recalc.mutate({})} disabled={recalc.isPending}>
                <span className="flex items-center gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${recalc.isPending ? 'animate-spin' : ''}`} />
                  {recalc.isPending ? 'Recalculating' : 'Recalculate readiness'}
                </span>
              </PrimaryButton>
            )}
          </>
        )}
      />

      {(notSynced || partiallySynced) && (
        <Card className="mb-5">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" />
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  {notSynced ? 'The page inventory has not been synced yet' : 'The page inventory is out of date'}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {model.registered} of {model.inManifest} routes have a review record. Unregistered
                  routes are shown in the tree but score zero, which is why platform readiness reads low.
                </p>
              </div>
            </div>
            {can('progress_admin') && (
              <SecondaryButton onClick={() => sync.mutate({})} disabled={sync.isPending}>
                Sync now
              </SecondaryButton>
            )}
          </CardBody>
        </Card>
      )}

      {/* Headline figures */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Platform readiness"
          value={model.platform.value}
          suffix="%"
          tone={toneForReadiness(model.platform.value)}
          bar={model.platform.value}
          hint={`Weighted across ${model.platform.counted} scored surfaces. Unassessed surfaces count as zero.`}
        />
        <StatCard
          label="LeadByte replacement readiness"
          value={model.migration.value}
          suffix="%"
          tone={toneForReadiness(model.migration.value)}
          bar={model.migration.value}
          hint={model.migration.counted === 0
            ? 'No cutover capabilities recorded yet, so this cannot be trusted.'
            : `${model.migration.counted} cutover capabilities. ${model.migration.gaps} known gaps.`}
        />
        <StatCard
          label="Page completion"
          value={model.scored.length ? Math.round((model.implemented / model.scored.length) * 100) : 0}
          suffix="%"
          tone="info"
          bar={model.scored.length ? (model.implemented / model.scored.length) * 100 : 0}
          hint={`${model.implemented} of ${model.scored.length} surfaces implemented or better.`}
        />
        <StatCard
          label="Independently verified"
          value={model.scored.length ? Math.round((model.verified / model.scored.length) * 100) : 0}
          suffix="%"
          tone={model.verified === 0 ? 'bad' : toneForReadiness((model.verified / Math.max(1, model.scored.length)) * 100)}
          bar={model.scored.length ? (model.verified / model.scored.length) * 100 : 0}
          hint={`${model.verified} surfaces have passing verification evidence. Developer sign-off alone does not count.`}
        />
      </div>

      {/* The call */}
      <Card className="mb-5">
        <CardHeader
          title="Migration recommendation"
          subtitle="Capped by blocking gates and open P0 findings, never by the average alone"
          icon={model.verdict.recommendation === 'ready' ? CheckCircle2 : AlertTriangle}
          actions={(
            <div className="flex items-center gap-2">
              <Badge tone={RECOMMENDATION_TONE[model.verdict.recommendation]}>
                {RECOMMENDATION_LABEL[model.verdict.recommendation]}
              </Badge>
              <Badge tone={model.verdict.confidence === 'high' ? 'good' : model.verdict.confidence === 'medium' ? 'warn' : 'bad'}>
                {model.verdict.confidence} confidence
              </Badge>
            </div>
          )}
        />
        <CardBody className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Blockers ({model.verdict.blockers.length})
            </p>
            {model.verdict.blockers.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No blockers recorded.</p>
            ) : (
              <ul className="space-y-2">
                {model.verdict.blockers.map((b, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-snug text-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Supporting evidence
            </p>
            <ul className="space-y-2">
              {model.verdict.evidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-snug text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-chart-2" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Assumptions and missing evidence ({model.verdict.assumptions.length})
            </p>
            {model.verdict.assumptions.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Nothing outstanding.</p>
            ) : (
              <ul className="space-y-2">
                {model.verdict.assumptions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-snug text-muted-foreground">
                    <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Safest next actions */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Safest next actions" subtitle="Ordered by what unblocks the most" icon={ArrowRight} />
          {model.verdict.next_actions.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing queued"
              description="No failing gates, blocked capabilities or unverified critical pages to act on."
            />
          ) : (
            <div>
              {model.verdict.next_actions.map((a, i) => (
                <Row key={i}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground">{a.action}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{a.why}</span>
                  </span>
                </Row>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Attention" subtitle="Surfaces that need a human look" icon={Clock} />
          <div>
            <Row><AttentionRow label="Never assessed" value={model.neverAssessed} to="/progress/review" tone="bad" /></Row>
            <Row><AttentionRow label="Needs your business knowledge" value={model.needingReview} to="/progress/review" tone="warn" /></Row>
            <Row><AttentionRow label="Reviews gone stale after code changes" value={model.staleReviews} to="/progress/review" tone="warn" /></Row>
            <Row><AttentionRow label="Blocked surfaces" value={model.blocked} to="/progress/review" tone="bad" /></Row>
            <Row><AttentionRow label="Open findings" value={model.openFindings.length} to="/progress/findings" tone="neutral" /></Row>
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Readiness by section" subtitle="Weakest first. Bars are weighted, not simple averages." />
          <CardBody>
            {model.sections.length === 0 ? (
              <EmptyState icon={Database} title="No sections scored yet" description="Sync the inventory, then assess a page to see this fill in." />
            ) : (
              <div className="space-y-2.5">
                {model.sections.map((s) => (
                  <div key={s.section_key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] text-foreground">{s.section_label}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {s.readiness}% of {s.pages}
                        {s.open_p0 > 0 ? `, ${s.open_p0} P0` : ''}
                      </span>
                    </div>
                    <ReadinessBar value={s.readiness} tone={toneForReadiness(s.readiness)} />
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Open findings by severity" subtitle="P0 is a migration or production blocker" />
          <CardBody>
            {model.openFindings.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No open findings" description="Nothing has been raised against any surface yet." />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.findingsBySeverity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="severity" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Bar dataKey="open" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Progress over time"
            subtitle="One point per recalculation day. Recalculate to add today's point."
          />
          <CardBody>
            {trend.length < 2 ? (
              <EmptyState
                icon={Clock}
                title="Not enough history yet"
                description="Trend needs at least two daily snapshots. Recalculating readiness writes today's snapshot."
              />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Line type="monotone" dataKey="platform" name="Platform" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="migration" name="Migration" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function AttentionRow({ label, value, to, tone }) {
  return (
    <Link to={to} className="flex w-full items-center justify-between gap-3">
      <span className="text-[13px] text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <Badge tone={value > 0 ? tone : 'neutral'}>{value}</Badge>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    </Link>
  );
}
