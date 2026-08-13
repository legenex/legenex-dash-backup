import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { resolvePeriod, PERIOD_LABELS } from '@/lib/periodRange';
import {
  spendInWindow, leadsInWindow, platformsFrom, buildAccounts, portfolioOf,
} from '@/lib/adManagerMetrics';

// Single source of data for every Ad Manager page. Reads the same entities the
// Finances Ad Spend tab reads, so the two views can never disagree about spend.
// Nothing is written from the Ad Manager, it is a read-only analytics surface.
export default function useAdManagerData() {
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [platform, setPlatform] = useState('meta');

  const win = useMemo(() => resolvePeriod(period, custom), [period, custom]);

  const spendQ = useQuery({ queryKey: ['adspend'], queryFn: () => fetchAll((limit, skip) => base44.entities.AdSpend.list('-date', limit, skip)) });
  const leadsQ = useQuery({ queryKey: ['report-leads'], queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.list('-created_date', limit, skip)) });
  const mapQ = useQuery({ queryKey: ['adspend-mappings'], queryFn: () => base44.entities.AdSpendMapping.list() });
  const metaQ = useQuery({ queryKey: ['ad-creative-meta'], queryFn: () => base44.entities.AdCreativeMeta.list() });

  const allSpend = spendQ.data || [];
  const allLeads = leadsQ.data || [];
  const mappings = mapQ.data || [];
  const creativeMeta = metaQ.data || [];

  const spendRows = useMemo(() => spendInWindow(allSpend, win), [allSpend, win]);
  const leads = useMemo(() => leadsInWindow(allLeads, win), [allLeads, win]);

  const platforms = useMemo(() => platformsFrom(mappings, allSpend), [mappings, allSpend]);
  const accounts = useMemo(
    () => buildAccounts({ spendRows, leads, mappings, platform }),
    [spendRows, leads, mappings, platform]
  );
  const portfolio = useMemo(() => portfolioOf(accounts), [accounts]);

  const periodLabel = period === 'custom' && custom?.from
    ? `${custom.from} to ${custom.to || 'today'}`
    : (PERIOD_LABELS[period] || period);

  return {
    period, setPeriod, custom, setCustom,
    platform, setPlatform, platforms,
    win, periodLabel,
    spendRows, leads, mappings, creativeMeta,
    accounts, portfolio,
    isLoading: spendQ.isLoading || leadsQ.isLoading || mapQ.isLoading,
    refetch: () => { spendQ.refetch(); leadsQ.refetch(); mapQ.refetch(); metaQ.refetch(); },
  };
}
