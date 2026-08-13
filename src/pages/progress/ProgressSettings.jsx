import React from 'react';
import {
  Cog, Database, RefreshCw, AlertTriangle, Camera, GitBranch, Globe, ShieldCheck,
} from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import {
  CRITICALITY_WEIGHTS, DIMENSIONS, LIFECYCLE_CEILINGS, UNVERIFIED_CEILING,
  P0_CEILING, REQUIRED_VERIFICATION_CHECKS, RISK_WEIGHTS,
  READY_THRESHOLD, CONDITIONAL_THRESHOLD,
} from '@/lib/progress/readiness';
import {
  useSyncInventory, useRecalculate, usePageManifest, useProgressPages,
} from '@/components/progress/useProgress';
import {
  ProgressPageHeader, Card, CardHeader, CardBody, Badge, Row,
  PrimaryButton, SecondaryButton,
} from '@/components/progress/progressUi';

// Progress Settings.
//
// The readiness constants are shown but not editable here on purpose. They live
// in src/lib/progress/readiness.js, which is bundled into the backend functions
// and guarded by a parity check, so a weight cannot be changed in one place and
// not the other. Making them database-editable would break that guarantee, so
// this surface explains the model and points at the file instead.

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const NOT_CONFIGURED = [
  {
    icon: GitBranch,
    title: 'GitHub synchronisation',
    what: 'Commits, pull requests, build status and commit to page mapping.',
    needs: 'A server side GitHub token stored as a Base44 secret, plus either a webhook endpoint or a scheduled poll. Morne or Nick must add the secret from the Base44 dashboard.',
    impact: 'Without it, last code change dates and stale review flags come only from the page inventory sync, not from real commits.',
  },
  {
    icon: Camera,
    title: 'Automated screenshots',
    what: 'Daily desktop, tablet and mobile captures with anchored visual review.',
    needs: 'A browser capable runner, a dedicated review account, secure storage, and masking for names, emails, phones, addresses, TrustedForm URLs, Jornaya tokens and credentials.',
    impact: 'Visual review is currently done by opening the live page. No screenshot data model has been created, so nothing falsely reports as working.',
  },
  {
    icon: Globe,
    title: 'progress.dashboard.legenex.com',
    what: 'Serving the Progress Control Center on its own subdomain.',
    needs: 'A CNAME for the nested subdomain pointing at the Base44 app, added by Morne, plus the domain registered in Base44 custom domains. The host detection is already in the router.',
    impact: 'Until the DNS record exists, use /progress on the main dashboard. Both routes serve the identical experience.',
  },
  {
    icon: RefreshCw,
    title: 'Scheduled daily maintenance',
    what: 'A nightly readiness recalculation and progress snapshot.',
    needs: 'A Base44 cron entry calling progressReadiness. Morne or Nick must add it from the Base44 dashboard.',
    impact: 'Trend charts only gain a point when somebody presses Recalculate readiness.',
  },
];

export default function ProgressSettings() {
  const { can } = usePermissions();
  const manifest = usePageManifest();
  const pagesQ = useProgressPages();
  const sync = useSyncInventory();
  const recalc = useRecalculate();

  const registered = (pagesQ.data || []).length;
  const inManifest = manifest.pages.length;

  return (
    <>
      <ProgressPageHeader
        title="Progress Settings"
        description="How readiness is calculated, what is synchronised, and what still needs configuring."
      />

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Page inventory"
            subtitle="Generated from the router, nav and permission config by scripts/generate-page-inventory.mjs"
            icon={Database}
            actions={can('progress_admin') ? (
              <div className="flex items-center gap-2">
                <SecondaryButton onClick={() => sync.mutate({ dry_run: true })} disabled={sync.isPending}>
                  Dry run
                </SecondaryButton>
                <PrimaryButton onClick={() => sync.mutate({})} disabled={sync.isPending}>
                  {sync.isPending ? 'Syncing' : 'Sync now'}
                </PrimaryButton>
              </div>
            ) : null}
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="In the router" value={inManifest} />
              <Stat label="Registered" value={registered} />
              <Stat label="Unregistered" value={Math.max(0, inManifest - registered)} tone={inManifest > registered ? 'warn' : 'good'} />
              <Stat label="Manifest built" value={(manifest.generated_at || '').slice(0, 10)} />
            </div>
            <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
              Syncing copies generated fields onto records and leaves every human field alone: criticality, owners,
              lifecycle, notes, purpose, strengths, gaps and LeadByte judgements are never overwritten. A route removed
              from the router is flagged as blocked rather than deleted, so its review history survives.
            </p>
            {sync.isSuccess && sync.data && (
              <p className="mt-2 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground">
                {sync.data.dry_run ? 'Dry run: ' : ''}
                {sync.data.totals?.created} created, {sync.data.totals?.updated} updated,{' '}
                {sync.data.totals?.unchanged} unchanged, {sync.data.totals?.marked_stale} marked stale,{' '}
                {sync.data.totals?.retired} retired.
              </p>
            )}
            {sync.isError && (
              <p className="mt-2 text-[12px] text-primary">Sync failed: {String(sync.error?.message || sync.error)}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Readiness recalculation"
            subtitle="The only writer of readiness scores, verification status and daily snapshots"
            icon={RefreshCw}
            actions={can('progress_write') ? (
              <PrimaryButton onClick={() => recalc.mutate({})} disabled={recalc.isPending}>
                {recalc.isPending ? 'Recalculating' : 'Recalculate now'}
              </PrimaryButton>
            ) : null}
          />
          <CardBody>
            <p className="text-[12px] leading-snug text-muted-foreground">
              Runs the canonical model over every page, capability and gate, then upserts today's snapshot. Idempotent:
              running it twice in a day updates the same row rather than creating a second one.
            </p>
            {recalc.isSuccess && recalc.data && (
              <p className="mt-2 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground">
                Platform {recalc.data.platform?.value}%, migration {recalc.data.migration?.value}%,
                recommendation {humanise(recalc.data.verdict?.recommendation)} at {recalc.data.verdict?.confidence} confidence.
                {' '}{recalc.data.pages_written} page records updated.
              </p>
            )}
            {recalc.isError && (
              <p className="mt-2 text-[12px] text-primary">Recalculation failed: {String(recalc.error?.message || recalc.error)}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="How readiness is calculated"
            subtitle="Defined in src/lib/progress/readiness.js and bundled into the backend, guarded by a parity check"
            icon={ShieldCheck}
          />
          <CardBody className="space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Criticality weights</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(CRITICALITY_WEIGHTS).map(([k, v]) => (
                  <Badge key={k} tone="neutral">{humanise(k)}: {v}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Readiness dimensions</p>
              <div className="rounded-md border border-border">
                {DIMENSIONS.map((d) => (
                  <Row key={d.key}>
                    <span className="flex-1 text-[12px] text-foreground">{d.label}</span>
                    <span className="text-[11px] text-muted-foreground">{d.weight}%</span>
                  </Row>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                An unassessed dimension scores zero rather than being skipped, so a partly assessed page cannot
                accidentally read as complete.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lifecycle ceilings</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(LIFECYCLE_CEILINGS).map(([k, v]) => (
                  <Badge key={k} tone="neutral">{humanise(k)}: {v == null ? 'keeps achieved score' : v}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hard caps</p>
              <ul className="space-y-1 text-[12px] text-muted-foreground">
                <li>A page without complete verification evidence cannot exceed <span className="text-foreground">{UNVERIFIED_CEILING}</span>.</li>
                <li>A page carrying a confirmed open P0 cannot exceed <span className="text-foreground">{P0_CEILING}</span>.</li>
                <li>A capability claiming verified on inference alone is downgraded to implemented but unverified.</li>
                <li>A failing blocking release gate caps the recommendation at not ready regardless of the average.</li>
                <li>Ready needs migration readiness at or above <span className="text-foreground">{READY_THRESHOLD}</span>; below <span className="text-foreground">{CONDITIONAL_THRESHOLD}</span> is not ready.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Checks required before a page counts as verified
              </p>
              <div className="flex flex-wrap gap-1.5">
                {REQUIRED_VERIFICATION_CHECKS.map((c) => (
                  <Badge key={c} tone="neutral">{humanise(c)}</Badge>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                A result of needs_env never counts as a pass, and a record superseded by a later commit stops counting.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Migration risk weights</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(RISK_WEIGHTS).map(([k, v]) => (
                  <Badge key={k} tone="neutral">{humanise(k)}: {v}</Badge>
                ))}
              </div>
            </div>

            <p className="rounded-md border border-border bg-secondary px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
              These constants are code, not configuration. They are bundled into the backend functions and checked by
              <span className="font-mono text-foreground"> node scripts/generate-progress-bundle.mjs --check</span>, so the
              frontend and the backend can never disagree about whether the platform is ready. Changing a weight is a
              code change with a test run behind it.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Not configured yet"
            subtitle="Stated plainly rather than shown as broken panels"
            icon={AlertTriangle}
          />
          <div>
            {NOT_CONFIGURED.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">{item.what}</p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        <span className="text-foreground">Needs: </span>{item.needs}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        <span className="text-foreground">Meanwhile: </span>{item.impact}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Access" subtitle="Granted under Settings, Users and Roles" icon={Cog} />
          <div>
            {[
              ['progress_access', 'Read only progress and reporting'],
              ['progress_write', 'Update assigned work, record assessments, add notes'],
              ['progress_review', 'Create findings, verify fixes, approve or reject'],
              ['progress_prompts', 'Generate and approve implementation prompts'],
              ['progress_admin', 'Sync inventory, gates, settings'],
            ].map(([key, label]) => (
              <Row key={key}>
                <span className="flex-1 text-[12px] text-foreground">{label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
                <Badge tone={can(key) ? 'good' : 'neutral'}>{can(key) ? 'You have this' : 'Not granted'}</Badge>
              </Row>
            ))}
          </div>
          <CardBody className="border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              Buyer and supplier accounts can never hold any of these keys. The restriction is enforced in code
              regardless of which boxes are ticked.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, tone = 'neutral' }) {
  const cls = { good: 'text-chart-5', warn: 'text-chart-3', bad: 'text-primary', neutral: 'text-foreground' }[tone];
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-[15px] font-semibold ${cls}`}>{value}</p>
    </div>
  );
}
