import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/lib/theme';
import { toast } from 'sonner';
import SectionHeader from '@/components/shared/SectionHeader';
import RefreshButton from '@/components/shared/RefreshButton';
import { PulseDot } from '@/components/settings/settingsUi';
import OnboardingTiles from '@/components/operations/onboarding/OnboardingTiles';
import OnboardingTable from '@/components/operations/onboarding/OnboardingTable';
import OnboardingEmptyState from '@/components/operations/onboarding/OnboardingEmptyState';
import OnboardingDrawer from '@/components/operations/onboarding/OnboardingDrawer';
import OnboardingEmailSettings from '@/components/operations/onboarding/OnboardingEmailSettings';
import { STATUS_TABS, tabCounts } from '@/components/operations/onboarding/onboardingModel';

export default function OperationsBuyerOnboarding() {
  useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [view, setView] = useState('pipeline');
  const [sortKey, setSortKey] = useState('submitted_at');
  const [sortDir, setSortDir] = useState('desc');
  const [drawerId, setDrawerId] = useState(null);
  const [running, setRunning] = useState(false);

  const { data: records = [] } = useQuery({
    queryKey: ['op-onboarding'],
    queryFn: () => base44.entities.BuyerOnboarding.list('-created_date', 500),
    // While a run is in flight, poll so the step rail updates live.
    refetchInterval: running ? 2000 : false,
  });

  const { data: buyers = [] } = useQuery({
    queryKey: ['op-onboarding-buyers'],
    queryFn: () => base44.entities.Buyer.list('-updated_date', 500),
    refetchInterval: running ? 2000 : false,
  });

  const buyerById = useMemo(() => {
    const map = {};
    for (const b of buyers) map[b.id] = b;
    return map;
  }, [buyers]);

  const buyerCodeById = useMemo(() => {
    const map = {};
    for (const b of buyers) map[b.id] = b.buyer_code || '';
    return map;
  }, [buyers]);

  const counts = useMemo(() => tabCounts(records), [records]);

  const filtered = useMemo(
    () => (tab === 'all' ? records : records.filter((r) => r.status === tab)),
    [records, tab],
  );

  // Resolve the drawer record and its linked buyer from live data so the rail
  // reflects each refetch while a run is in flight.
  const drawerRecord = records.find((r) => r.id === drawerId) || null;
  const drawerBuyer = drawerRecord?.buyer_id ? buyerById[drawerRecord.buyer_id] || null : null;

  const onSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['op-onboarding'] }),
    qc.invalidateQueries({ queryKey: ['op-onboarding-buyers'] }),
  ]);

  // Trigger the onboardBuyer function. from_step is null for a full run, or a
  // specific step key for a resume or a retry. Never blocks the page: the run
  // is awaited in the background while polling keeps the rail live.
  const runOnboarding = async (record, fromStep) => {
    setRunning(true);
    try {
      const args = { onboarding_id: record.id };
      if (fromStep) args.from_step = fromStep;
      const res = await base44.functions.invoke('onboardBuyer', args);
      const data = res?.data || {};
      if (data.error) toast.error(data.error);
      else if (data.status === 'blocked') toast.error('Onboarding stopped on a failed step. See the step rail.');
      else if (data.status === 'complete') toast.success('Onboarding complete.');
      else toast.success('Onboarding advanced.');
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Onboarding failed to run.');
    } finally {
      setRunning(false);
      await refresh();
    }
  };

  // Cancel: set status to cancelled. Does not delete the buyer or reverse
  // anything created externally.
  const cancelOnboarding = async (record) => {
    try {
      await base44.entities.BuyerOnboarding.update(record.id, { status: 'cancelled' });
      toast.success('Onboarding cancelled.');
      await refresh();
    } catch (err) {
      toast.error(err?.message || 'Could not cancel onboarding.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Buyer Onboarding" subtitle="Bring a new buyer live, one tracked step at a time.">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <PulseDot /> Live
        </span>
        <RefreshButton onClick={refresh} />
      </SectionHeader>

      <div className="flex gap-1 border-b border-border">
        {[{ key: 'pipeline', label: 'Pipeline' }, { key: 'emails', label: 'Emails' }].map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-3.5 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px
              ${view === v.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'emails' ? (
        <OnboardingEmailSettings />
      ) : records.length === 0 ? (
        <OnboardingEmptyState />
      ) : (
        <>
          <OnboardingTiles records={records} />

          <div className="flex gap-1 border-b border-border flex-wrap">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px inline-flex items-center gap-1.5
                  ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {counts[t.key] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <OnboardingTable
            records={filtered}
            buyerCodeById={buyerCodeById}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onRowClick={(record) => setDrawerId(record.id)}
          />
        </>
      )}

      {view === 'pipeline' && (
        <OnboardingDrawer
          open={!!drawerRecord}
          onOpenChange={(v) => { if (!v) setDrawerId(null); }}
          record={drawerRecord}
          buyer={drawerBuyer}
          running={running}
          onRun={runOnboarding}
          onCancel={cancelOnboarding}
        />
      )}
    </div>
  );
}