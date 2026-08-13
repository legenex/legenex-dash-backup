import React, { useState, useMemo } from 'react';
import SectionHeader from '@/components/shared/SectionHeader';
import useAdManagerData from '@/hooks/useAdManagerData';
import { AINote } from '@/components/admanager/adAtoms';
import { TopControls, AccountTabs, AiInsightCard, StatusBar } from '@/components/admanager/adPanels';
import { CreativeLeaderboard, CreativeRollups, TagCreativeDialog } from '@/components/admanager/adCreatives';
import { buildCreatives } from '@/lib/adManagerMetrics';

// Creative Analyzer: which creatives, hooks, creators and concepts win on real
// revenue. Hook, creator and concept are operator-tagged because no ad platform
// reports them, so the rollups stay honest about what is tagged and what is not.
export default function CreativeAnalyzer() {
  const d = useAdManagerData();
  const { accounts, platform, platforms, spendRows, leads, creativeMeta, mappings, portfolio } = d;
  const [acctId, setAcctId] = useState('all');
  const [tagging, setTagging] = useState(null);

  const accountIds = acctId === 'all' ? null : [acctId];
  const scope = acctId === 'all' ? portfolio : (accounts.find((a) => a.id === acctId) || portfolio);

  const creatives = useMemo(
    () => buildCreatives({ spendRows, leads: scope.leads || [], creativeMeta, platform, accountIds }),
    [spendRows, scope, creativeMeta, platform, acctId]
  );

  const tagged = creatives.filter((c) => c.tagged).length;
  const lastSyncedAt = useMemo(() => {
    const stamps = mappings.map((m) => m.last_synced_at).filter(Boolean).sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  }, [mappings]);

  return (
    <div className="flex flex-col gap-5 pb-6">
      <SectionHeader
        title="Creative Analyzer"
        subtitle="Which creatives, hooks, creators and concepts consistently win on real revenue."
      />

      <TopControls
        platform={platform} setPlatform={d.setPlatform} platforms={platforms}
        period={d.period} setPeriod={d.setPeriod} custom={d.custom} setCustom={d.setCustom}
        lastSyncedAt={lastSyncedAt} onRefresh={d.refetch}
      />

      {accounts.length > 0 && (
        <AccountTabs list={accounts} acct={acctId} setAcct={setAcctId} onRenamed={d.refetch} includePortfolio />
      )}

      <AiInsightCard scope={scope} platform={platform} periodLabel={d.periodLabel} />
      <CreativeLeaderboard creatives={creatives} onTag={setTagging} />
      <CreativeRollups creatives={creatives} />

      <AINote>
        <span className="font-semibold text-primary">How this stays honest:</span>{' '}
        {tagged} of {creatives.length} creatives are tagged. Spend, impressions, thumbstop and hold come from Meta. Sold and revenue are joined back to a creative only where its utm_content matches the value the funnel recorded on the lead, so an untagged creative shows reported metrics and blank verified columns rather than a guess.
      </AINote>

      <StatusBar portfolio={portfolio} platform={platform} mappings={mappings} lastSyncedAt={lastSyncedAt} />

      <TagCreativeDialog
        creative={tagging}
        open={!!tagging}
        onOpenChange={(v) => !v && setTagging(null)}
        onSaved={d.refetch}
      />
    </div>
  );
}
