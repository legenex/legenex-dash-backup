import React, { useState, useEffect } from 'react';
import SectionHeader from '@/components/shared/SectionHeader';
import { PulseDot } from '@/components/settings/settingsUi';
import { RefreshCw, Download, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import ColumnManager from '@/components/leads/ColumnManager';

// Shared Calls shell. Same contract as LeadsShell: portals the header (view
// title + LIVE pill + subtitle, with Refresh / Columns / Export CSV and the
// "N calls" count) into the section header slot, renders the filter bar and
// table as its children, then a CALLS TELEMETRY footer. Fed by CallsTable.
export default function CallsShell({
  title,
  subtitle,
  count,
  onRefresh,
  onExport,
  onDelete,
  deleteLabel,
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

  const { pending = 0, unattributed = 0, lastCallAt = null } = telemetry || {};

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
          <span className="text-[12px] text-muted-foreground font-mono tabular-nums ml-1">{count} calls</span>
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
          {/* Deleting the calls currently on screen. Destructive, so it is a
              distinct control rather than something hidden in a menu, and the
              caller confirms before anything is removed. */}
          {onDelete && (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 h-8 text-[12px] text-destructive hover:bg-accent transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> {deleteLabel || 'Delete'}
            </button>
          )}
          <button
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 h-8 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </SectionHeader>

      {children}

      {/* Pipeline health footer: what is stuck or unmatched in this period. */}
      <div className="mt-3 shrink-0 flex items-center gap-4 flex-wrap rounded-lg border border-border bg-card px-4 py-2.5">
        <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70">Calls Telemetry</span>
        <span className="inline-flex items-center gap-1.5">
          <PulseDot />
          <span className="text-[10.5px] text-muted-foreground">Call feed connected</span>
        </span>
        <Metric label="Pending" value={pending} tone={pending > 0 ? 'status-queued' : 'text-foreground'} />
        <Metric label="Unattributed" value={unattributed} tone={unattributed > 0 ? 'text-primary' : 'text-foreground'} />
        <Metric label="Last Call" value={lastCallAt ? format(new Date(lastCallAt), 'MMM dd HH:mm') : 'none'} />
        <span className="ml-auto text-[10.5px] text-muted-foreground/70 font-mono">refreshed {secsAgo}s ago</span>
      </div>
    </div>
  );
}
