import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import SectionHeader from '@/components/shared/SectionHeader';
import useAdManagerData from '@/hooks/useAdManagerData';
import { Btn, EmptyState } from '@/components/admanager/adAtoms';
import { TopControls, AiInsightCard, PlatformKpis, TruthKpis, StatusBar } from '@/components/admanager/adPanels';
import { PortfolioChart, AccountsSummary, SyncRoster } from '@/components/admanager/adTables';
import { platformLabel } from '@/lib/adManagerMetrics';

// Performance Dashboard: every ad account in one summary. Platform reported
// spend joined to the verified sold economics the platform cannot see.
export default function AdPerformanceDashboard() {
  const d = useAdManagerData();
  const { portfolio, accounts, platform, platforms, mappings } = d;

  const lastSyncedAt = useMemo(() => {
    const stamps = mappings.map((m) => m.last_synced_at).filter(Boolean).sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  }, [mappings]);

  const connected = platforms.find((p) => p.id === platform)?.connected;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <SectionHeader
        title="Performance Dashboard"
        subtitle="Every ad account in one summary. Platform spend joined to verified sold economics."
      />

      <TopControls
        platform={platform} setPlatform={d.setPlatform} platforms={platforms}
        period={d.period} setPeriod={d.setPeriod} custom={d.custom} setCustom={d.setCustom}
        lastSyncedAt={lastSyncedAt} onRefresh={d.refetch}
      />

      {!connected ? (
        <EmptyState
          icon={Link2}
          title={`${platformLabel(platform)} is not connected`}
          body={`No ad account is mapped to ${platformLabel(platform)}. Add an AdSpendMapping so its spend attributes to a supplier, brand and vertical.`}
          action={<Link to="/settings?tab=integrations"><Btn icon={Link2} primary>Open Integrations</Btn></Link>}
        />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No spend synced in this window"
          body={`${platformLabel(platform)} is connected but no AdSpend rows landed for the selected dates. Run Sync now, or widen the date range.`}
        />
      ) : (
        <>
          <AiInsightCard scope={portfolio} platform={platform} periodLabel={d.periodLabel} />
          <PlatformKpis a={portfolio} platform={platform} />
          <TruthKpis a={portfolio} platform={platform} />
          <PortfolioChart accounts={accounts} platform={platform} />
          <AccountsSummary accounts={accounts} platform={platform} />
        </>
      )}

      <SyncRoster accounts={accounts} mappings={mappings} platform={platform} onSync={d.refetch} />
      <StatusBar portfolio={portfolio} platform={platform} mappings={mappings} lastSyncedAt={lastSyncedAt} />
    </div>
  );
}
