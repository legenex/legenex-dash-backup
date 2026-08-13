import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/lib/theme';
import SectionHeader from '@/components/shared/SectionHeader';
import RefreshButton from '@/components/shared/RefreshButton';
import ColumnManager from '@/components/leads/ColumnManager';
import { PulseDot } from '@/components/settings/settingsUi';
import { SearchableSelect } from '@/components/ui/searchable-select';
import StateMapPanel from '@/components/operations/states/StateMapPanel';
import StateTable from '@/components/operations/states/StateTable';
import StateDetailDrawer from '@/components/operations/states/StateDetailDrawer';
import StatesEmptyState from '@/components/operations/states/StatesEmptyState';
import { METRICS, CLIENT_TYPES, cplBoundsFor, coverageSummary } from '@/components/operations/states/stateMetrics';
import {
  ALL_STATES, statusByState, buyerCoverageByState,
} from '@/components/operations/states/activeStatesModel';
import {
  STATE_AVAILABLE_COLUMNS, loadStateColumnConfig, saveStateColumnConfig, getStateColumnDef,
} from '@/components/operations/states/stateColumns';

export default function OperationsActiveStates() {
  useTheme();
  const qc = useQueryClient();

  const [vertical, setVertical] = useState('MVA');
  const [clientType, setClientType] = useState('all');
  const [buyerId, setBuyerId] = useState('all');
  const [metric, setMetric] = useState('tier');
  const [selectedState, setSelectedState] = useState(null);
  const [drawerState, setDrawerState] = useState(null);

  const [sortKey, setSortKey] = useState('state');
  const [sortDir, setSortDir] = useState('asc');
  const [config, setConfig] = useState(loadStateColumnConfig);

  const { data: stateStatuses = [] } = useQuery({
    queryKey: ['as-state-status'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.StateStatus.list('', limit, skip)),
  });
  const { data: buyers = [] } = useQuery({
    queryKey: ['as-buyers'],
    queryFn: () => base44.entities.Buyer.list('-updated_date', 500),
  });
  const { data: cplRows = [] } = useQuery({
    queryKey: ['as-buyer-state-cpl'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.BuyerStateCpl.list('', limit, skip)),
  });
  const { data: verticals = [] } = useQuery({
    queryKey: ['as-verticals'],
    queryFn: () => base44.entities.Vertical.filter({ active: true }, 'sort_order', 200),
  });

  // Vertical codes present on StateStatus, unioned with active verticals so the
  // selector always offers MVA even before other verticals are computed.
  const verticalOptions = useMemo(() => {
    const codes = new Set(verticals.map((v) => v.code));
    for (const s of stateStatuses) if (s.vertical) codes.add(s.vertical);
    if (codes.size === 0) codes.add('MVA');
    return [...codes].sort().map((c) => ({ value: c, label: c }));
  }, [verticals, stateStatuses]);

  const buyerScoped = buyerId !== 'all';

  // The status map the map and table render from. Buyer-scoped when a buyer is
  // selected, otherwise the resolved StateStatus tier for the vertical.
  const statusMap = useMemo(() => {
    if (buyerScoped) return buyerCoverageByState(buyerId, vertical, cplRows, buyers);
    return statusByState(stateStatuses, vertical);
  }, [buyerScoped, buyerId, vertical, cplRows, buyers, stateStatuses]);

  // Client type filter narrows which states are shown as covered on both the
  // map and table. Non matching states collapse to inactive so their tiles mute.
  const filteredStatusMap = useMemo(() => {
    if (clientType === 'all') return statusMap;
    const out = {};
    for (const code of ALL_STATES) {
      const s = statusMap[code];
      if (s && s.active && s.effective_client_type === clientType) out[code] = s;
    }
    return out;
  }, [statusMap, clientType]);

  const cplBounds = useMemo(() => cplBoundsFor(metric, filteredStatusMap), [metric, filteredStatusMap]);
  const summary = useMemo(() => coverageSummary(filteredStatusMap, ALL_STATES), [filteredStatusMap]);

  // Table rows: one per state including uncovered. Uncovered rows carry a
  // synthetic inactive status so columns render "-" rather than blanks.
  const tableRows = useMemo(() => {
    const base = ALL_STATES.map((code) => filteredStatusMap[code] || {
      state: code, vertical, active: false, effective_client_type: null,
      highest_cpl: 0, lowest_cpl: 0, active_buyer_count: 0,
      last_changed_at: null, last_change_direction: null,
    });
    const filtered = selectedState ? base.filter((r) => r.state === selectedState) : base;
    const col = getStateColumnDef(sortKey);
    const sorted = [...filtered].sort((a, b) => {
      // Uncovered states sort last regardless of direction (default sort).
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (!col) return 0;
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [filteredStatusMap, vertical, selectedState, sortKey, sortDir]);

  // When the vertical changes, drop any stale state selection.
  useEffect(() => { setSelectedState(null); }, [vertical, buyerId, clientType]);

  const onSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const onConfigChange = (next) => { setConfig(next); saveStateColumnConfig(next); };

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['as-state-status'] }),
    qc.invalidateQueries({ queryKey: ['as-buyers'] }),
    qc.invalidateQueries({ queryKey: ['as-buyer-state-cpl'] }),
  ]);

  // Clicking a tile toggles the state selection; clicking again clears it.
  const onTileSelect = (code) => setSelectedState((cur) => (cur === code ? null : code));

  const buyerOptions = useMemo(() => ([
    { value: 'all', label: 'All buyers' },
    ...buyers
      .slice()
      .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
      .map((b) => ({ value: b.id, label: b.company_name || b.buyer_code || 'Buyer' })),
  ]), [buyers]);

  const hasCoverageForVertical = stateStatuses.some((s) => s.vertical === vertical);
  const drawerStatus = drawerState ? (statusMap[drawerState] || null) : null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Active States" subtitle="Coverage, pricing and performance for all fifty states.">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <PulseDot /> Live
        </span>
        <RefreshButton onClick={refresh} />
      </SectionHeader>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-40">
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Vertical</label>
          <SearchableSelect value={vertical} onValueChange={setVertical} options={verticalOptions} />
        </div>
        <div className="w-full sm:w-44">
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Client type</label>
          <SearchableSelect
            value={clientType}
            onValueChange={setClientType}
            options={[{ value: 'all', label: 'All buyer types' }, ...CLIENT_TYPES.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        <div className="w-full sm:w-56">
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Buyer</label>
          <SearchableSelect value={buyerId} onValueChange={setBuyerId} options={buyerOptions} />
        </div>
        <div className="w-full sm:w-44 sm:ml-auto">
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Colour map by</label>
          <SearchableSelect value={metric} onValueChange={setMetric} options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />
        </div>
      </div>

      {!hasCoverageForVertical && !buyerScoped ? (
        <StatesEmptyState vertical={vertical} />
      ) : (
        <>
          <StateMapPanel
            statusMap={filteredStatusMap}
            metric={metric}
            cplBounds={cplBounds}
            selected={selectedState}
            onSelect={onTileSelect}
            summary={summary}
            buyerScoped={buyerScoped}
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[12px] text-muted-foreground">
              {selectedState ? (
                <span>Filtered to <span className="font-mono font-semibold text-foreground">{selectedState}</span>. Click the tile again to clear.</span>
              ) : (
                <span>All 51 states and DC, uncovered sorted last.</span>
              )}
            </div>
            <ColumnManager config={config} availableColumns={STATE_AVAILABLE_COLUMNS} onChange={onConfigChange} />
          </div>

          <StateTable
            rows={tableRows}
            config={config}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            selected={selectedState}
            onRowClick={(r) => setDrawerState(r.state)}
          />
        </>
      )}

      <StateDetailDrawer
        open={!!drawerState}
        onOpenChange={(v) => { if (!v) setDrawerState(null); }}
        state={drawerState}
        vertical={vertical}
        cplRows={cplRows}
        buyers={buyers}
        status={drawerStatus}
      />
    </div>
  );
}