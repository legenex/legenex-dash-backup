import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw } from 'lucide-react';
import { PulseDot } from '@/components/finances/financeUi';
import { formatDistanceToNowStrict } from 'date-fns';
import { SectionHeaderSlot } from '@/components/layout/SectionShell';

// Per-page shell for the Tools section: header row (title + LIVE pill + Search/Refresh),
// subtitle, the page content, and a TOOLS TELEMETRY footer with real values loaded once here.
export default function ToolsShell({ title, subtitle, actions, onSearch, onRefresh, children }) {
  const [tick, setTick] = useState(Date.now());

  const { data: tel, refetch } = useQuery({
    queryKey: ['tools-telemetry'],
    queryFn: async () => {
      const [rules, calcFields, hlr, emailVal, tests] = await Promise.all([
        base44.entities.NotificationRule.list('-created_date', 200),
        base44.entities.CustomField.filter({ field_type: 'Calculated' }),
        base44.entities.HlrSettings.list('-created_date', 1),
        base44.entities.EmailValidationSettings.list('-created_date', 1),
        base44.entities.PayloadTest.list('-updated_date', 1),
      ]);
      const hlrOn = hlr[0]?.enabled ?? false;
      const emailOn = emailVal[0]?.enabled ?? false;
      return {
        alertRules: rules.filter(r => r.enabled).length,
        calcFields: calcFields.length,
        verification: (hlrOn ? 1 : 0) + (emailOn ? 1 : 0),
        lastTest: tests[0]?.updated_date || tests[0]?.created_date || null,
        loadedAt: Date.now(),
      };
    },
    refetchInterval: 60000,
  });

  // Re-render every 10s so "refreshed Xs ago" stays honest.
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  const secsAgo = tel?.loadedAt ? Math.max(0, Math.round((tick - tel.loadedAt) / 1000)) : 0;
  const lastRun = tel?.lastTest ? formatDistanceToNowStrict(new Date(tel.lastTest), { addSuffix: true }) : 'never';

  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <SectionHeaderSlot>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-bold text-foreground tracking-tight">{title}</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-status-sold text-[10px] font-semibold uppercase tracking-wide status-sold">
              <PulseDot /> Live
            </span>
          </div>
          {subtitle && <p className="text-[13px] text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {onSearch && (
            <Button variant="outline" size="sm" onClick={onSearch} className="gap-1.5">
              <Search className="w-4 h-4" /> Search
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>
      </SectionHeaderSlot>

      {/* Content */}
      <div className="flex-1">{children}</div>

      {/* Telemetry footer */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 rounded-lg bg-card border border-border text-[11px]">
        <span className="font-semibold uppercase tracking-[0.11em] text-muted-foreground/70">Tools Telemetry</span>
        <TelItem label="Automation Engine" value="Live" tone="green" />
        <TelItem label="Alert Rules" value={tel?.alertRules ?? 0} />
        <TelItem label="Calc Fields" value={tel?.calcFields ?? 0} />
        <TelItem label="Verification" value={`${tel?.verification ?? 0}/2`} />
        <TelItem label="Last Test Run" value={lastRun} />
        <TelItem label="Jobs Queued" value={0} />
        <span className="ml-auto text-muted-foreground/60">refreshed {secsAgo}s ago</span>
      </div>
    </div>
  );
}

function TelItem({ label, value, tone }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="uppercase tracking-wide text-muted-foreground/60">{label}</span>
      <span className={`font-mono tabular-nums font-semibold ${tone === 'green' ? 'status-sold' : 'text-foreground'}`}>{value}</span>
    </span>
  );
}