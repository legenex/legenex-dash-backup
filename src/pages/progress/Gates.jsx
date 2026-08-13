import React, { useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, Cpu, Hand } from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import {
  pageReadiness, evaluateGates, gateSummary, migrationReadiness,
} from '@/lib/progress/readiness';
import {
  useReleaseGates, useProgressPages, useProgressFindings, useMigrationRequirements,
  useVerificationRecords, useProgressMutation, mergePagesWithManifest, usePageManifest,
} from '@/components/progress/useProgress';
import {
  ProgressPageHeader, Card, CardHeader, CardBody, Badge, EmptyState,
  LoadingBlock, StatCard, PrimaryButton, SecondaryButton,
} from '@/components/progress/progressUi';

// Release Gates: the objective conditions that must hold before cutover.
//
// Automatic gates are computed from records by the same model the backend uses,
// so nobody can mark one green by hand. Manual gates need an attestation and
// record who gave it. A waived blocking gate is displayed as a waiver, never as
// a pass, and still blocks the recommendation.

const STATUS_TONE = {
  passing: 'good',
  failing: 'bad',
  in_progress: 'warn',
  not_started: 'neutral',
  waived: 'warn',
};

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const groupBy = (list, key) => {
  const out = {};
  (list || []).forEach((i) => { const k = i[key]; if (k) (out[k] = out[k] || []).push(i); });
  return out;
};

export default function Gates() {
  const { can } = usePermissions();
  const manifest = usePageManifest();
  const gatesQ = useReleaseGates();
  const pagesQ = useProgressPages();
  const findingsQ = useProgressFindings();
  const reqsQ = useMigrationRequirements();
  const verifsQ = useVerificationRecords();

  const evaluated = useMemo(() => {
    const gates = gatesQ.data || [];
    const pages = mergePagesWithManifest(pagesQ.data || [], manifest.pages);
    const findings = findingsQ.data || [];
    const requirements = reqsQ.data || [];
    const verifications = verifsQ.data || [];
    const findingsByPage = groupBy(findings, 'page_key');
    const verifsByPage = groupBy(verifications.filter((v) => v.subject_type === 'page'), 'subject_key');
    const pageResults = pages.map((p) => pageReadiness(p, {
      findings: findingsByPage[p.page_key] || [],
      verifications: verifsByPage[p.page_key] || [],
    }));
    return evaluateGates(gates, { findings, pageResults, pages, requirements });
  }, [gatesQ.data, pagesQ.data, findingsQ.data, reqsQ.data, verifsQ.data, manifest]);

  const summary = useMemo(() => gateSummary(evaluated), [evaluated]);
  const migration = useMemo(() => migrationReadiness(reqsQ.data || []), [reqsQ.data]);

  if (gatesQ.isLoading || pagesQ.isLoading) {
    return (
      <>
        <ProgressPageHeader title="Release Gates" description="Loading gate status." />
        <LoadingBlock label="Evaluating gates" />
      </>
    );
  }

  if (evaluated.length === 0) {
    return (
      <>
        <ProgressPageHeader title="Release Gates" description="Objective conditions that must hold before cutover." />
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="No release gates defined"
            description="Without gates the recommendation rests on the weighted average alone, which is exactly the failure mode this system exists to prevent. Load the standard gate set to fix that."
          />
        </Card>
      </>
    );
  }

  const blocked = summary.blocking_failing > 0 || summary.blocking_waived > 0;

  return (
    <>
      <ProgressPageHeader
        title="Release Gates"
        description={`${summary.blocking_total} blocking gates, ${summary.total - summary.blocking_total} advisory. A single failing blocking gate caps the recommendation at not ready.`}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Blocking gates passing"
          value={`${summary.blocking_passing} / ${summary.blocking_total}`}
          tone={summary.blocking_failing === 0 && summary.blocking_waived === 0 ? 'good' : 'bad'}
          bar={summary.blocking_total ? (summary.blocking_passing / summary.blocking_total) * 100 : 0}
          hint="Waived gates are not counted as passing."
        />
        <StatCard label="Failing" value={summary.failing} tone={summary.failing > 0 ? 'bad' : 'good'} hint="Evaluated and did not hold." />
        <StatCard label="Not started" value={summary.not_started} tone={summary.not_started > 0 ? 'warn' : 'good'} hint="Nothing to measure yet, so cannot pass." />
        <StatCard label="Waived" value={summary.waived} tone={summary.waived > 0 ? 'warn' : 'neutral'} hint="A waiver is a decision, not evidence." />
      </div>

      <Card className="mb-5">
        <CardBody className="flex items-start gap-2.5">
          {blocked
            ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-chart-5" />}
          <div>
            <p className="text-[13px] font-medium text-foreground">
              {blocked
                ? 'Cutover is gated'
                : 'All blocking gates are passing'}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {blocked
                ? `${summary.failing_gates.length} blocking gate(s) not passing. The migration recommendation stays at not ready until every one of them holds, whatever the readiness average says. Migration readiness is currently ${migration.value}%.`
                : `Migration readiness is ${migration.value}%. Gates alone do not authorise cutover; the readiness threshold and the absence of open P0 findings also apply.`}
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-3">
        {evaluated.map((gate) => (
          <GateCard key={gate.id || gate.gate_key} gate={gate} canWrite={can('progress_admin')} />
        ))}
      </div>
    </>
  );
}

function GateCard({ gate, canWrite }) {
  const mutation = useProgressMutation('ReleaseGate', 'progress-gates');
  const [attesting, setAttesting] = useState(false);
  const [form, setForm] = useState({ status: gate.status, evidence: gate.evidence || '', waiver_reason: '' });

  const save = () => {
    const payload = {
      status: form.status,
      evidence: form.evidence,
      evidence_source: 'human_attestation',
      last_evaluated_at: new Date().toISOString(),
    };
    if (form.status === 'waived') payload.waiver_reason = form.waiver_reason;
    mutation.mutate({ action: 'update', id: gate.id, data: payload }, { onSuccess: () => setAttesting(false) });
  };

  return (
    <Card>
      <CardHeader
        title={gate.title}
        subtitle={gate.description}
        icon={gate.auto ? Cpu : Hand}
        actions={(
          <div className="flex flex-wrap items-center gap-1.5">
            {gate.blocking !== false && <Badge tone="neutral">Blocking</Badge>}
            <Badge tone={gate.auto ? 'info' : 'neutral'}>{gate.auto ? 'Automatic' : 'Manual'}</Badge>
            <Badge tone={STATUS_TONE[gate.computed_status] || 'neutral'}>
              {humanise(gate.computed_status)}
            </Badge>
          </div>
        )}
      />
      <CardBody>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Evidence</p>
        <p className="mt-1 text-[12px] leading-snug text-foreground">
          {gate.computed_evidence || 'No evidence recorded. A gate with no evidence cannot be treated as passing.'}
        </p>

        {gate.computed_status === 'waived' && gate.waiver_reason && (
          <div className="mt-3 rounded-md border border-border bg-secondary px-3 py-2">
            <p className="text-[11px] font-medium text-chart-3">Waived, not passed</p>
            <p className="mt-0.5 text-[12px] text-foreground">{gate.waiver_reason}</p>
            {gate.waived_by && <p className="mt-0.5 text-[11px] text-muted-foreground">Waived by {gate.waived_by}</p>}
          </div>
        )}

        {gate.auto && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Computed from records by rule <span className="font-mono">{gate.auto_rule}</span>. It cannot be set by hand.
          </p>
        )}

        {!gate.auto && canWrite && !attesting && (
          <div className="mt-3">
            <SecondaryButton onClick={() => setAttesting(true)}>Record attestation</SecondaryButton>
          </div>
        )}

        {!gate.auto && attesting && (
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="passing">Passing</option>
                <option value="failing">Failing</option>
                <option value="waived">Waived (still blocks)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                What proves this. Be specific: a command run, a record checked, a test performed.
              </span>
              <textarea
                value={form.evidence}
                onChange={(e) => setForm({ ...form, evidence: e.target.value })}
                rows={3}
                className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            {form.status === 'waived' && (
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Why this is being waived rather than met
                </span>
                <textarea
                  value={form.waiver_reason}
                  onChange={(e) => setForm({ ...form, waiver_reason: e.target.value })}
                  rows={2}
                  className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
            )}
            <div className="flex items-center gap-2">
              <PrimaryButton onClick={save} disabled={mutation.isPending || !form.evidence.trim()}>
                {mutation.isPending ? 'Saving' : 'Save attestation'}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setAttesting(false)}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
