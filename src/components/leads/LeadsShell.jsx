import React, { useState, useEffect } from 'react';
import SectionHeader from '@/components/shared/SectionHeader';
import { PulseDot } from '@/components/settings/settingsUi';
import { RefreshCw, Download } from 'lucide-react';
import { format } from 'date-fns';
import ColumnManager from '@/components/leads/ColumnManager';

// Shared Leads shell. Portals the header (view title + LIVE pill + subtitle,
// with Refresh / Columns / Export CSV and the "N leads" count) into the section
// header slot, renders the filter bar + table (its children), and shows a
// LEADS TELEMETRY footer with real values. Fed entirely by LeadsTable.
export default function LeadsShell({
  title,
  subtitle,
  count,
  onRefresh,
  onExport,
  columnConfig,
  availableColumns,
  onColumnChange,
  telemetry,
  children,
}) {
  const [refreshedAt, setRefreshedAt] = useState(Date.now());
  const [nowTick, setNowTick] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secsAgo = Math.max(0, Math.round((nowTick - refreshedAt) / 1000));

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
      setRefreshedAt(Date.now());
    }
  };

  const { queued = 0, errors = 0, lastLeadAt = null } = telemetry || {};

  const Metric = ({ label, value, tone }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70">{label}</span>
      <span className={`text-[11px] font-mono font-semibold tabular-nums ${tone || 'text-foreground'}`}>{value}</span>
    </span>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <SectionHeader title={title} subtitle={subtitle}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-sold px-2 py-0.5 text-[9.5px] font-semibold tracking-wider status-sold">
            <PulseDot /> LIVE
          </span>
          <span className="text-[12px] text-muted-foreground font-mono tabular-nums ml-1">{count} leads</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 h-8 text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <div className="hidden lg:block">
            <ColumnManager config={columnConfig} availableColumns={availableColumns} onChange={onColumnChange} />
          </div>
          <button
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 h-8 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </SectionHeader>

      {children}

      {/* Pipeline health footer: stream state and anything stuck or failing.
          Deliberately NOT lead counts any more, those live above the table. */}
      <div className="mt-3 shrink-0 flex items-center gap-4 flex-wrap rounded-lg border border-border bg-card px-4 py-2.5">
        <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70">Leads Telemetry</span>
        <span className="inline-flex items-center gap-1.5">
          <PulseDot />
          <span className="text-[10.5px] text-muted-foreground">Live stream connected</span>
        </span>
        <Metric label="Queued" value={queued} tone={queued > 0 ? 'status-queued' : 'text-foreground'} />
        <Metric label="Errors" value={errors} tone={errors > 0 ? 'text-primary' : 'text-foreground'} />
        <Metric label="Last Lead" value={lastLeadAt ? format(new Date(lastLeadAt), 'MMM dd HH:mm') : 'none'} />
        <span className="ml-auto text-[10.5px] text-muted-foreground/70 font-mono">refreshed {secsAgo}s ago</span>
      </div>
    </div>
  );
}