import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import ToolsShell from '@/components/tools/ToolsShell';
import ToolTile from '@/components/tools/ToolTile';
import { Button } from '@/components/ui/button';
import { Brain, Bell, Calculator, ShieldCheck, FlaskConical } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';

export default function ToolsDashboard() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['tools-dashboard'],
    queryFn: async () => {
      const [leads, calcFields, rules, hlr, emailVal, tests] = await Promise.all([
        base44.entities.Lead.list('-created_date', 500),
        base44.entities.CustomField.filter({ field_type: 'Calculated' }),
        base44.entities.NotificationRule.list('-created_date', 200),
        base44.entities.HlrSettings.list('-created_date', 1),
        base44.entities.EmailValidationSettings.list('-created_date', 1),
        base44.entities.PayloadTest.list('-updated_date', 1),
      ]);
      const hasCampaignField = calcFields.some(f => f.field_name === 'campaign');
      return {
        leadCount: leads.length,
        calcTotal: calcFields.length,
        hasCampaignField,
        rulesEnabled: rules.filter(r => r.enabled).length,
        hlrEnabled: hlr[0]?.enabled ?? false,
        emailEnabled: emailVal[0]?.enabled ?? false,
        lastTest: tests[0]?.updated_date || tests[0]?.created_date || null,
      };
    },
  });

  const d = data || {};
  const verificationActive = (d.hlrEnabled ? 1 : 0) + (d.emailEnabled ? 1 : 0);
  const lastRun = d.lastTest ? formatDistanceToNowStrict(new Date(d.lastTest), { addSuffix: true }) : null;

  // Factual audit line built from real state.
  const buildAudit = () => {
    if (isLoading) return 'Reading current tooling state...';
    const gaps = [];
    if ((d.rulesEnabled ?? 0) === 0) gaps.push('no notification rules');
    if ((d.calcTotal ?? 0) === 0) gaps.push('no calculated fields');
    if (verificationActive === 0) gaps.push('phone and email verification are off');
    else if (verificationActive === 1) gaps.push('only one of two quality gates is active');

    if (gaps.length === 0) {
      return `The pipeline is live and guarded: ${d.rulesEnabled} alert rule(s), ${d.calcTotal} calculated field(s) and ${verificationActive} of 2 quality gates active. ${(d.leadCount ?? 0).toLocaleString()} leads have passed through.`;
    }
    const list = gaps.length === 1 ? gaps[0] : gaps.slice(0, -1).join(', ') + ' and ' + gaps[gaps.length - 1];
    return `The pipeline is live but partly unguarded: ${list}. ${(d.leadCount ?? 0).toLocaleString()} leads have passed through with limited quality gating.`;
  };

  const statusFor = {
    rules: (d.rulesEnabled ?? 0) > 0 ? 'ok' : 'warn',
    calc: (d.calcTotal ?? 0) > 0 ? 'ok' : 'warn',
    verify: verificationActive === 2 ? 'ok' : verificationActive === 1 ? 'warn' : 'error',
    payload: 'ok',
  };

  return (
    <ToolsShell
      title="Tools"
      subtitle="Operational tooling: automation, quality gates and pipeline diagnostics."
    >
      {/* AI Tooling Audit banner */}
      <div className="rounded-[10px] border border-primary/25 bg-primary/5 p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-primary/80">AI Tooling Audit</div>
            <p className="text-[13px] text-foreground mt-1 leading-relaxed">{buildAudit()}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button size="sm" onClick={() => navigate('/payload-tester')} className="gap-1.5">
                <FlaskConical className="w-4 h-4" /> Run pipeline test
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/notifications')} className="gap-1.5">
                <Bell className="w-4 h-4" /> Add first rule
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ToolTile
          to="/notifications"
          icon={Bell}
          title="Notifications"
          description="Alert rules for failures, spikes and silence across the pipeline."
          status={statusFor.rules}
          stats={[
            { label: 'Active rules', value: isLoading ? '-' : (d.rulesEnabled ?? 0) },
            { label: 'Hint', value: (d.rulesEnabled ?? 0) > 0 ? 'Monitored' : 'Failures unnoticed' },
          ]}
        />
        <ToolTile
          to="/calculated-fields"
          icon={Calculator}
          title="Calculated Fields"
          description="Derived fields computed on ingest, used in routing and reports."
          status={statusFor.calc}
          stats={[
            { label: 'Fields', value: isLoading ? '-' : (d.calcTotal ?? 0) },
            { label: 'Hint', value: d.hasCampaignField ? 'Mapped' : 'campaign unmapped' },
          ]}
        />
        <ToolTile
          to="/verification"
          icon={ShieldCheck}
          title="Verification"
          description="Phone and email quality gates protecting buyer acceptance."
          status={statusFor.verify}
          stats={[
            { label: 'Active', value: isLoading ? '-' : `${verificationActive} of 2` },
            { label: 'Hint', value: d.hlrEnabled ? 'HLR live' : 'HLR not configured' },
          ]}
        />
        <ToolTile
          to="/payload-tester"
          icon={FlaskConical}
          title="Payload Tester"
          description="Fire a synthetic lead through the full pipeline and inspect every hop."
          status={statusFor.payload}
          stats={[
            { label: 'Last run', value: isLoading ? '-' : (lastRun || 'never') },
            { label: 'Hint', value: lastRun ? 'Ready' : 'Recommended first action' },
          ]}
        />
      </div>
    </ToolsShell>
  );
}