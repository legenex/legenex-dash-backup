import React from 'react';
import { motion } from 'framer-motion';
import { GitCompareArrows } from 'lucide-react';
import RefreshButton from '@/components/shared/RefreshButton';
import { PulseDot } from '@/components/finances/financeUi';
import { money } from '@/lib/reportMetrics';
import { SectionHeaderSlot } from '@/components/layout/SectionShell';

// Per-page shell for every Finances tab: header ("Finances / <TabName>" with LIVE pill,
// Compare + Refresh), a subtitle, the content, and a FINANCE TELEMETRY footer bar with
// real values. `telemetry` carries the already-computed real numbers.
export default function FinanceShell({ tabName, subtitle, telemetry = {}, onRefresh, onCompare, filter, children }) {
  const {
    bankOnline = false, unmatchedIn = 0, openGaps = 0, overdue = 0, payoutsOwing = 0,
    adSyncedPlatforms = 0, adTotalPlatforms = 3,
  } = telemetry;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <SectionHeaderSlot>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[19px] font-semibold text-foreground">
              Finances <span className="text-muted-foreground/70 font-normal">/ {tabName}</span>
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-status-sold px-2 py-0.5 text-[10px] font-semibold tracking-wide status-sold">
              <PulseDot /> LIVE
            </span>
          </div>
          {subtitle && <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {filter}
          {onCompare && (
            <button
              onClick={onCompare}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <GitCompareArrows className="w-4 h-4" /> Compare
            </button>
          )}
          <RefreshButton onClick={onRefresh} />
        </div>
      </div>
      </SectionHeaderSlot>

      {/* Content */}
      <div>{children}</div>

      {/* Finance telemetry footer */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-[11px]"
      >
        <span className="font-semibold tracking-[0.12em] uppercase text-muted-foreground/70">Finance Telemetry</span>
        <TeleItem label="BANK FEED" value={bankOnline ? 'Online' : 'Offline'} tone={bankOnline ? 'good' : 'risk'} />
        <TeleItem label="UNMATCHED IN" value={money(unmatchedIn)} tone={unmatchedIn > 0 ? 'warn' : undefined} />
        <TeleItem label="OPEN GAPS" value={String(openGaps)} tone={openGaps > 0 ? 'risk' : 'good'} />
        <TeleItem label="OVERDUE" value={money(overdue)} tone={overdue > 0 ? 'risk' : undefined} />
        <TeleItem label="PAYOUTS OWING" value={money(payoutsOwing)} tone={payoutsOwing > 0 ? 'warn' : undefined} />
        <TeleItem label="AD SPEND SYNC" value={`${adSyncedPlatforms}/${adTotalPlatforms}`} tone={adSyncedPlatforms > 0 ? 'good' : undefined} />
        <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground/70">
          <PulseDot /> auto-refresh on
        </span>
      </motion.div>
    </div>
  );
}

function TeleItem({ label, value, tone }) {
  const valueClass = tone === 'good' ? 'status-sold' : tone === 'risk' ? 'text-primary' : tone === 'warn' ? 'status-unsold' : 'text-foreground';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground/70">{label}</span>
      <span className={`font-mono tabular-nums font-medium ${valueClass}`}>{value}</span>
    </span>
  );
}