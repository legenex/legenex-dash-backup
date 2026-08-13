import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft, ChevronDown, ChevronRight, Search, AlertTriangle,
} from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import { migrationReadiness, RISK_WEIGHTS } from '@/lib/progress/readiness';
import {
  useMigrationRequirements, useProgressMutation,
} from '@/components/progress/useProgress';
import {
  ProgressPageHeader, Card, CardBody, Badge, EmptyState,
  LoadingBlock, ReadinessBar, toneForReadiness, StatCard, PrimaryButton, EvidenceBadge,
} from '@/components/progress/progressUi';

// LeadByte Migration: capability parity across the ten groups.
//
// This is not a checklist. A capability counts as verified only when its status
// says so AND its evidence is an observation rather than an inference, which the
// readiness model enforces by downgrading anything claiming verified on
// inference alone. A capability with no evidence recorded is an assumption, and
// the page says so on its face.

export const GROUPS = [
  { key: 'ingestion', label: 'A. Lead ingestion' },
  { key: 'processing', label: 'B. Lead processing' },
  { key: 'routing', label: 'C. Routing and distribution' },
  { key: 'delivery', label: 'D. Delivery and response handling' },
  { key: 'buyers', label: 'E. Buyers' },
  { key: 'suppliers', label: 'F. Suppliers' },
  { key: 'reporting', label: 'G. Reporting and finance' },
  { key: 'reliability', label: 'H. Reliability and operations' },
  { key: 'security', label: 'I. Security and permissions' },
  { key: 'execution', label: 'J. Migration execution' },
];

const STATUS_LABEL = {
  not_assessed: 'Not assessed',
  not_started: 'Not started',
  in_progress: 'In progress',
  implemented_unverified: 'Implemented, unverified',
  verified: 'Verified',
  blocked: 'Blocked',
  not_required: 'Not required',
};

const STATUS_TONE = {
  not_assessed: 'neutral',
  not_started: 'neutral',
  in_progress: 'info',
  implemented_unverified: 'warn',
  verified: 'good',
  blocked: 'bad',
  not_required: 'neutral',
};

const PARITY_TONE = {
  not_assessed: 'neutral',
  gap: 'bad',
  partial: 'warn',
  parity: 'good',
  better: 'good',
  not_required: 'neutral',
};

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function Migration() {
  const { can } = usePermissions();
  const reqsQ = useMigrationRequirements();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [expanded, setExpanded] = useState(null);

  const requirements = reqsQ.data || [];
  const model = useMemo(() => migrationReadiness(requirements), [requirements]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requirements;
    return requirements.filter((r) =>
      (r.capability || '').toLowerCase().includes(q)
      || (r.capability_key || '').toLowerCase().includes(q)
      || (r.legenex_implementation || '').toLowerCase().includes(q)
      || (r.open_gaps || '').toLowerCase().includes(q));
  }, [requirements, query]);

  const byGroup = useMemo(() => {
    const out = {};
    filtered.forEach((r) => { (out[r.group_key] = out[r.group_key] || []).push(r); });
    return out;
  }, [filtered]);

  const groupReadiness = useMemo(() => {
    const map = {};
    model.by_group.forEach((g) => { map[g.group_key] = g; });
    return map;
  }, [model]);

  if (reqsQ.isLoading) {
    return (
      <>
        <ProgressPageHeader title="LeadByte Migration" description="Loading capability parity." />
        <LoadingBlock label="Reading migration requirements" />
      </>
    );
  }

  if (requirements.length === 0) {
    return (
      <>
        <ProgressPageHeader
          title="LeadByte Migration"
          description="Capability parity across the ten migration groups."
        />
        <Card>
          <EmptyState
            icon={ArrowRightLeft}
            title="No capabilities recorded yet"
            description="Migration readiness cannot be calculated until the LeadByte capability set is loaded. Until then the Command Center reports migration readiness as zero, which is the honest answer rather than an optimistic one."
          />
        </Card>
      </>
    );
  }

  const unassessed = requirements.filter((r) => r.status === 'not_assessed').length;
  const inferenceOnly = requirements.filter((r) =>
    r.status === 'verified' && !['code', 'runtime', 'screenshot', 'data', 'test', 'user_feedback'].includes(r.evidence_type)).length;

  return (
    <>
      <ProgressPageHeader
        title="LeadByte Migration"
        description={`${model.counted} capabilities required for cutover, ${model.excluded_not_required} deliberately out of scope. Weighted by migration risk.`}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Migration readiness"
          value={model.value}
          suffix="%"
          tone={toneForReadiness(model.value)}
          bar={model.value}
          hint="Risk weighted. Critical capabilities count five times a low risk one."
        />
        <StatCard
          label="Known gaps"
          value={model.gaps}
          tone={model.gaps > 0 ? 'bad' : 'good'}
          hint="Capabilities where LeadByte does something Legenex does not."
        />
        <StatCard
          label="Blocked"
          value={model.blocked}
          tone={model.blocked > 0 ? 'bad' : 'good'}
          hint="Work that cannot proceed without an external decision or action."
        />
        <StatCard
          label="Evidence coverage"
          value={model.evidence_coverage ?? 0}
          suffix="%"
          tone={(model.evidence_coverage ?? 0) >= 80 ? 'good' : (model.evidence_coverage ?? 0) >= 50 ? 'warn' : 'bad'}
          bar={model.evidence_coverage ?? 0}
          hint="Share of statuses backed by observation rather than inference."
        />
      </div>

      {(unassessed > 0 || inferenceOnly > 0) && (
        <Card className="mb-5">
          <CardBody className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" />
            <div className="text-[12px] leading-snug text-muted-foreground">
              {unassessed > 0 && (
                <p>
                  <span className="text-foreground">{unassessed} capabilities are unassessed.</span>{' '}
                  They score zero, so the readiness figure above is a floor rather than an estimate.
                </p>
              )}
              {inferenceOnly > 0 && (
                <p className="mt-1">
                  <span className="text-foreground">{inferenceOnly} capabilities claim verified without observed evidence.</span>{' '}
                  These have been automatically downgraded to implemented but unverified in the calculation.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardBody className="flex items-center gap-2 py-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search capabilities, implementations, gaps"
            className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </CardBody>
      </Card>

      <div className="space-y-3">
        {GROUPS.map((group) => {
          const items = byGroup[group.key] || [];
          if (items.length === 0) return null;
          const open = !collapsed[group.key];
          const gr = groupReadiness[group.key];
          return (
            <Card key={group.key}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group.key]: open }))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
              >
                {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-foreground">{group.label}</span>
                  <ReadinessBar
                    value={gr?.readiness ?? 0}
                    tone={toneForReadiness(gr?.readiness ?? 0)}
                    className="mt-1.5 max-w-md"
                  />
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={toneForReadiness(gr?.readiness ?? 0)}>{gr?.readiness ?? 0}%</Badge>
                  <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{items.length}</span>
                </span>
              </button>

              {open && (
                <div className="border-t border-border">
                  {items.map((r) => (
                    <RequirementRow
                      key={r.id}
                      requirement={r}
                      expanded={expanded === r.id}
                      onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                      canWrite={can('progress_write')}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function RequirementRow({ requirement: r, expanded, onToggle, canWrite }) {
  const mutation = useProgressMutation('MigrationRequirement', 'progress-migration');
  const [draft, setDraft] = useState(null);

  const startEdit = () => setDraft({
    status: r.status || 'not_assessed',
    parity: r.parity || 'not_assessed',
    migration_risk: r.migration_risk || 'medium',
    evidence: r.evidence || '',
    evidence_type: r.evidence_type || 'unknown',
    legenex_implementation: r.legenex_implementation || '',
    open_gaps: r.open_gaps || '',
    required_action: r.required_action || '',
    required_for_cutover: r.required_for_cutover !== false,
  });

  const save = () => {
    mutation.mutate({ action: 'update', id: r.id, data: draft }, { onSuccess: () => setDraft(null) });
  };

  const hasEvidence = ['code', 'runtime', 'screenshot', 'data', 'test', 'user_feedback'].includes(r.evidence_type);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-foreground">{r.capability}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{r.capability_key}</span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {r.required_for_cutover === false && <Badge tone="neutral">Out of scope</Badge>}
          <Badge tone={PARITY_TONE[r.parity] || 'neutral'}>{humanise(r.parity || 'not assessed')}</Badge>
          <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{STATUS_LABEL[r.status] || 'Not assessed'}</Badge>
          {r.migration_risk && <Badge tone={r.migration_risk === 'critical' ? 'bad' : r.migration_risk === 'high' ? 'warn' : 'neutral'}>
            {humanise(r.migration_risk)} risk
          </Badge>}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/40 px-4 py-3">
          {!draft ? (
            <div className="space-y-2.5">
              <Detail label="What this means" value={r.definition} />
              <Detail label="How LeadByte does it" value={r.leadbyte_equivalent} />
              <Detail label="Legenex implementation" value={r.legenex_implementation} />
              <Detail label="Open gaps" value={r.open_gaps} />
              <Detail label="Required action" value={r.required_action} />
              <Detail label="Test coverage" value={r.test_coverage} />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Evidence</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <EvidenceBadge type={r.evidence_type} />
                  {!hasEvidence && <span className="text-[11px] text-chart-3">Status is an assumption until evidence is attached.</span>}
                </div>
                {r.evidence && <p className="mt-1 text-[12px] text-foreground">{r.evidence}</p>}
              </div>
              {canWrite && (
                <PrimaryButton onClick={startEdit}>Update assessment</PrimaryButton>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniField label="Status">
                  <MiniSelect value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })}
                    options={Object.entries(STATUS_LABEL)} />
                </MiniField>
                <MiniField label="Parity vs LeadByte">
                  <MiniSelect value={draft.parity} onChange={(v) => setDraft({ ...draft, parity: v })}
                    options={[['not_assessed', 'Not assessed'], ['gap', 'Gap'], ['partial', 'Partial'], ['parity', 'Parity'], ['better', 'Better'], ['not_required', 'Not required']]} />
                </MiniField>
                <MiniField label="Migration risk">
                  <MiniSelect value={draft.migration_risk} onChange={(v) => setDraft({ ...draft, migration_risk: v })}
                    options={Object.keys(RISK_WEIGHTS).map((k) => [k, `${humanise(k)} (weight ${RISK_WEIGHTS[k]})`])} />
                </MiniField>
                <MiniField label="Evidence type">
                  <MiniSelect value={draft.evidence_type} onChange={(v) => setDraft({ ...draft, evidence_type: v })}
                    options={[['code', 'Code'], ['runtime', 'Runtime'], ['screenshot', 'Screenshot'], ['data', 'Data'], ['test', 'Test'], ['user_feedback', 'User feedback'], ['inference', 'Inference'], ['unknown', 'Unknown']]} />
                </MiniField>
              </div>
              <MiniField label="Evidence (what proves this status)">
                <MiniTextArea value={draft.evidence} onChange={(v) => setDraft({ ...draft, evidence: v })} />
              </MiniField>
              <MiniField label="Legenex implementation">
                <MiniTextArea value={draft.legenex_implementation} onChange={(v) => setDraft({ ...draft, legenex_implementation: v })} />
              </MiniField>
              <MiniField label="Open gaps">
                <MiniTextArea value={draft.open_gaps} onChange={(v) => setDraft({ ...draft, open_gaps: v })} />
              </MiniField>
              <MiniField label="Required action">
                <MiniTextArea value={draft.required_action} onChange={(v) => setDraft({ ...draft, required_action: v })} />
              </MiniField>
              <label className="flex items-center gap-2 text-[12px] text-foreground">
                <input
                  type="checkbox"
                  checked={draft.required_for_cutover}
                  onChange={(e) => setDraft({ ...draft, required_for_cutover: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Required before LeadByte can be switched off
              </label>
              <div className="flex items-center gap-2">
                <PrimaryButton onClick={save} disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saving' : 'Save'}
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-foreground">{value}</p>
    </div>
  );
}

function MiniField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const miniClass = 'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

function MiniSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={miniClass}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function MiniTextArea({ value, onChange }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={`${miniClass} resize-y`} />
  );
}
