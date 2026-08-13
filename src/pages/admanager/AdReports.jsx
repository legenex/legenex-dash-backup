import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import SectionHeader from '@/components/shared/SectionHeader';
import useAdManagerData from '@/hooks/useAdManagerData';
import { Btn, EmptyState } from '@/components/admanager/adAtoms';
import { TopControls, AccountTabs, AiInsightCard, PlatformKpis, TruthKpis, StatusBar } from '@/components/admanager/adPanels';
import { CampaignsTable, Breakouts } from '@/components/admanager/adTables';
import { buildCampaigns, platformLabel } from '@/lib/adManagerMetrics';

// Ad Reports: drill into a single ad account. Reported spend against the
// verified sold truth, then campaigns, ad sets, ads and breakouts.
export default function AdReports() {
  const d = useAdManagerData();
  const { accounts, platform, platforms, spendRows, creativeMeta, mappings, portfolio } = d;
  const [acctId, setAcctId] = useState(null);

  // Keep the selection valid when the platform or window changes the account list.
  useEffect(() => {
    if (!accounts.length) { setAcctId(null); return; }
    if (!accounts.some((a) => a.id === acctId)) setAcctId(accounts[0].id);
  }, [accounts, acctId]);

  const account = accounts.find((a) => a.id === acctId) || null;
  const campaigns = useMemo(() => (account ? buildCampaigns(account, spendRows) : []), [account, spendRows]);

  const lastSyncedAt = useMemo(() => {
    const stamps = mappings.map((m) => m.last_synced_at).filter(Boolean).sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  }, [mappings]);

  return (
    <div className="flex flex-col gap-5 pb-6">
      <SectionHeader
        title="Ad Reports"
        subtitle="Drill into a single account. Reported spend against the verified sold truth."
      />

      <TopControls
        platform={platform} setPlatform={d.setPlatform} platforms={platforms}
        period={d.period} setPeriod={d.setPeriod} custom={d.custom} setCustom={d.setCustom}
        lastSyncedAt={lastSyncedAt} onRefresh={d.refetch}
      />

      {accounts.length > 0 && (
        <AccountTabs list={accounts} acct={acctId} setAcct={setAcctId} onRenamed={d.refetch} />
      )}

      {!account ? (
        <EmptyState
          icon={Link2}
          title={`No ${platformLabel(platform)} account has spend in this window`}
          body="Switch platform, widen the date range, or run a sync to pull the latest spend."
          action={<Link to="/settings?tab=integrations"><Btn icon={Link2}>Open Integrations</Btn></Link>}
        />
      ) : (
        <>
          <AiInsightCard scope={account} campaigns={campaigns} platform={platform} periodLabel={d.periodLabel} />
          <PlatformKpis a={account} platform={platform} />
          <TruthKpis a={account} platform={platform} />
          <CampaignsTable account={account} spendRows={spendRows} creativeMeta={creativeMeta} />
          <Breakouts scope={account} spendRows={spendRows} creativeMeta={creativeMeta} />
        </>
      )}

      <StatusBar portfolio={portfolio} platform={platform} mappings={mappings} lastSyncedAt={lastSyncedAt} />
    </div>
  );
}
