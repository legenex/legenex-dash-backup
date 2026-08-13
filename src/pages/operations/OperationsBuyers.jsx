import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '@/lib/theme';
import { toast } from 'sonner';
import SectionHeader from '@/components/shared/SectionHeader';
import RefreshButton from '@/components/shared/RefreshButton';
import ColumnManager from '@/components/leads/ColumnManager';
import { MultiSelect } from '@/components/ui/multi-select';
import { PulseDot } from '@/components/settings/settingsUi';
import BuyerTable from '@/components/operations/buyers/BuyerTable';
import BuyersEmptyState from '@/components/operations/buyers/BuyersEmptyState';
import BuyerActionDialog from '@/components/operations/buyers/BuyerActionDialog';
import BuyerDeleteDialog from '@/components/operations/buyers/BuyerDeleteDialog';
import BuyerBulkDeleteBar from '@/components/operations/buyers/BuyerBulkDeleteBar';
import BuyerDetailPage from '@/components/operations/buyers/BuyerDetailPage';
import BuyerCreateModal from '@/components/operations/buyers/BuyerCreateModal';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';
import { computeBlastRadius } from '@/components/operations/buyers/buyerListModel';
import { useRecomputeCoverage } from '@/components/operations/buyers/useRecomputeCoverage';
import RecomputingIndicator from '@/components/operations/buyers/RecomputingIndicator';
import AutoCreatedReviewBanner from '@/components/operations/AutoCreatedReviewBanner';
import { verticalFilterOptions } from '@/lib/verticalOptions';
import {
  BUYER_AVAILABLE_COLUMNS, loadBuyerColumnConfig, saveBuyerColumnConfig, getBuyerColumnDef,
} from '@/components/operations/buyers/buyerColumns';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'Law Firm', label: 'Law Firms' },
  { key: 'Aggregator', label: 'Aggregators' },
  { key: 'Network', label: 'Networks' },
  { key: 'Reseller', label: 'Resellers' },
  { key: 'Test', label: 'Test' },
  { key: 'needs_setup', label: 'Needs Setup' },
  { key: 'unclassified', label: 'Unclassified' },
  { key: 'disabled', label: 'Disabled' },
];

// A buyer is considered disabled when its status is paused or terminated.
function isDisabled(buyer) {
  const status = String(buyer.status || '').toLowerCase();
  return status === 'paused' || status === 'terminated';
}

// Match a buyer against a tab. Unclassified = client_type is null/empty.
// Disabled = status paused or terminated.
// A buyer that arrived from a lead payload rather than onboarding: it has no type
// and no pricing, so reports can point at it but nothing can route to it. These
// need an operator to finish them, which is what the Needs Setup tab collects.
export function needsSetup(buyer) {
  if (!buyer) return false;
  return !buyer.client_type || buyer.status === 'draft';
}

function matchesTab(buyer, tabKey) {
  if (tabKey === 'disabled') return isDisabled(buyer);
  if (tabKey === 'all') return true;
  if (tabKey === 'needs_setup') return needsSetup(buyer);
  if (tabKey === 'unclassified') return !buyer.client_type;
  return buyer.client_type === tabKey;
}

export default function OperationsBuyers() {
  useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [sortKey, setSortKey] = useState('company_name');
  const [sortDir, setSortDir] = useState('asc');
  const [config, setConfig] = useState(loadBuyerColumnConfig);

  const [actionState, setActionState] = useState(null); // { action, buyer, closesStates }
  const [deleteState, setDeleteState] = useState(null); // { buyer }
  const [drawerBuyerId, setDrawerBuyerId] = useState(null);
  const [drawerTab, setDrawerTab] = useState(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [manualRecomputing, setManualRecomputing] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { recomputing, scheduleRecompute } = useRecomputeCoverage();

  const { data: buyers = [] } = useQuery({
    queryKey: ['op-buyers'],
    queryFn: () => base44.entities.Buyer.list('-updated_date', 500),
  });

  const { data: cplRows = [] } = useQuery({
    queryKey: ['op-buyer-state-cpl'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.BuyerStateCpl.list('', limit, skip)),
  });

  const { data: stateStatuses = [] } = useQuery({
    queryKey: ['op-state-status'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.StateStatus.list('', limit, skip)),
  });

  const { data: verticals = [] } = useQuery({
    queryKey: ['op-verticals'],
    queryFn: () => base44.entities.Vertical.filter({ active: true }, 'sort_order', 200),
  });

  // Resolve the drawer's buyer from the live list so edits reflect immediately.
  const drawerBuyer = buyers.find((b) => b.id === drawerBuyerId) || null;

  // Deep link support: /operations/buyers?buyer=<id>[&tab=<tab>] opens that
  // buyer's detail directly. Mirrors the supplier deep link so cross-links from
  // Lead Distribution, and the redirect from the old standalone /buyers/:id
  // page, both land on the Operations surface where buyers are managed.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('buyer');
    if (id && drawerBuyerId !== id) {
      setDrawerBuyerId(id);
      setDrawerTab(searchParams.get('tab') || undefined);
    }
  }, [searchParams]);

  // Clearing the detail also clears the deep link so a back navigation does not
  // immediately reopen it.
  const closeDetail = () => {
    setDrawerBuyerId(null);
    setDrawerTab(undefined);
    if (searchParams.get('buyer')) {
      const next = new URLSearchParams(searchParams);
      next.delete('buyer');
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  };

  const ctx = { cplRows };

  // Vertical filter, applied alongside the client-type tabs. Empty means all.
  const [verticalFilter, setVerticalFilter] = useState([]);
  const matchesVertical = (b) => verticalFilter.length === 0 || verticalFilter.includes(b.vertical);

  const tabCounts = useMemo(() => {
    const counts = {};
    // Counts respect the vertical filter so the tab badges agree with the rows
    // actually listed underneath them.
    for (const t of TABS) counts[t.key] = buyers.filter((b) => matchesTab(b, t.key) && matchesVertical(b)).length;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyers, verticalFilter]);

  const rows = useMemo(() => {
    const filtered = buyers.filter((b) => matchesTab(b, tab) && matchesVertical(b));
    const col = getBuyerColumnDef(sortKey);
    if (!col) return filtered;
    const sorted = [...filtered].sort((a, b) => {
      const av = col.sortValue(a, ctx);
      const bv = col.sortValue(b, ctx);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    return sortDir === 'asc' ? sorted : sorted.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyers, tab, sortKey, sortDir, cplRows, verticalFilter]);

  const onSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const onConfigChange = (next) => {
    setConfig(next);
    saveBuyerColumnConfig(next);
  };

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['op-buyers'] }),
    qc.invalidateQueries({ queryKey: ['op-buyer-state-cpl'] }),
    qc.invalidateQueries({ queryKey: ['op-state-status'] }),
  ]);

  // Instant status-only transition. The active boolean is derived at the data
  // layer, so it is never written from the UI.
  const transition = async (buyer, nextStatus) => {
    await base44.entities.Buyer.update(buyer.id, { status: nextStatus });
    toast.success(`Buyer set to ${nextStatus}`);
    qc.invalidateQueries({ queryKey: ['op-buyers'] });
    // A status change flips the buyer's active flag, which changes which states
    // it can cover. Recompute after the write succeeds.
    scheduleRecompute(buyer);
  };

  const openPause = (buyer) => {
    setActionState({ action: 'pause', buyer, closesStates: computeBlastRadius(buyer.id, cplRows, stateStatuses) });
  };
  const openTerminate = (buyer) => {
    setActionState({ action: 'terminate', buyer, closesStates: computeBlastRadius(buyer.id, cplRows, stateStatuses) });
  };

  // Pause / Terminate: write the buyer status, then stamp the reason and paused
  // metadata on every BuyerStateCpl row belonging to this buyer. No engine call
  // and no notification are triggered from this page.
  const confirmAction = async (reason) => {
    const { action, buyer } = actionState;
    const nextStatus = action === 'pause' ? 'paused' : 'terminated';
    await base44.entities.Buyer.update(buyer.id, { status: nextStatus });

    let me = null;
    try { me = await base44.auth.me(); } catch {}
    const mine = cplRows.filter((r) => r.buyer_id === buyer.id);
    await Promise.all(mine.map((r) => base44.entities.BuyerStateCpl.update(r.id, {
      paused_reason: reason,
      paused_at: new Date().toISOString(),
      paused_by: me?.id || '',
    })));

    toast.success(action === 'pause' ? 'Buyer paused' : 'Buyer terminated');
    qc.invalidateQueries({ queryKey: ['op-buyers'] });
    qc.invalidateQueries({ queryKey: ['op-buyer-state-cpl'] });
    scheduleRecompute(buyer);
  };

  const confirmDelete = async () => {
    const buyer = deleteState.buyer;
    await base44.entities.Buyer.delete(buyer.id);
    toast.success('Buyer deleted');
    qc.invalidateQueries({ queryKey: ['op-buyers'] });
    scheduleRecompute(buyer);
  };

  const openBuyer = (buyer) => {
    setDrawerBuyerId(buyer.id);
    setDrawerTab(undefined);
  };

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelectAll = (checked) => setSelectedIds(checked ? new Set(rows.map((b) => b.id)) : new Set());
  const clearSelection = () => setSelectedIds(new Set());

  const confirmBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = [...selectedIds];
      const affected = buyers.filter((b) => selectedIds.has(b.id));
      await Promise.all(ids.map((id) => base44.entities.Buyer.delete(id)));
      toast.success(`${ids.length} ${ids.length === 1 ? 'buyer' : 'buyers'} deleted`);
      clearSelection();
      await qc.invalidateQueries({ queryKey: ['op-buyers'] });
      affected.forEach((b) => scheduleRecompute(b));
    } catch (err) {
      toast.error(`Could not delete buyers: ${err?.message || 'unknown error'}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  // Manual full recompute across all verticals. No buyer id, events enabled.
  // Reports the returned summary as a toast and refreshes the affected caches.
  const manualRecompute = async () => {
    setManualRecomputing(true);
    try {
      const res = await base44.functions.invoke('recomputeStateStatus', { emit_events: true });
      const s = res?.data || {};
      toast.success(
        `Coverage recomputed. ${s.created ?? 0} created, ${s.updated ?? 0} updated, ${s.unchanged ?? 0} unchanged, ${s.events_written ?? 0} events written.`
      );
      await refresh();
    } catch (err) {
      toast.error(`Could not recompute coverage: ${err?.message || 'unknown error'}`);
    } finally {
      setManualRecomputing(false);
    }
  };

  // After creating a buyer, refresh the table and open it on Coverage, since a
  // buyer with no state coverage receives no leads.
  const onCreated = async (created) => {
    await qc.invalidateQueries({ queryKey: ['op-buyers'] });
    openBuyer(created);
  };

  // Full-page detail swap: when a buyer is selected, render its detail in place
  // of the list. The list state (tab, filters, columns) is preserved behind it.
  if (drawerBuyer) {
    return (
      <BuyerDetailPage
        buyer={drawerBuyer}
        verticals={verticals}
        initialTab={drawerTab}
        onBack={closeDetail}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Buyer Management" subtitle="Lifecycle, coverage and pricing for every buyer.">
        <RecomputingIndicator active={recomputing} className="mr-1" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <PulseDot /> Live
        </span>
        <RefreshButton onClick={refresh} />
        <Button variant="outline" onClick={manualRecompute} disabled={manualRecomputing} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${manualRecomputing ? 'animate-spin' : ''}`} />
          {manualRecomputing ? 'Recomputing...' : 'Recompute coverage'}
        </Button>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Create Buyer
        </Button>
      </SectionHeader>

      <AutoCreatedReviewBanner kind="buyer" />

      {buyers.length === 0 ? (
        <BuyersEmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1 border-b border-border flex-wrap">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3.5 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px inline-flex items-center gap-1.5
                    ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {t.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {tabCounts[t.key] ?? 0}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {/* Vertical filter. Buyers already carry a vertical and the table
                  shows it as a column, so it needs to be filterable: with WC and
                  MVA buyers side by side the list is otherwise unreadable.
                  Multi-select, and it grows automatically as new verticals are
                  created rather than needing another hardcoded tab. */}
              <MultiSelect
                value={verticalFilter}
                onValueChange={setVerticalFilter}
                options={verticalFilterOptions(verticals)}
                placeholder="All Verticals"
                className={`h-9 w-[170px] text-[12px] bg-card ${verticalFilter.length > 0 ? 'border-primary' : 'border-border'}`}
              />
              <ColumnManager config={config} availableColumns={BUYER_AVAILABLE_COLUMNS} onChange={onConfigChange} />
            </div>
          </div>

          <BuyerBulkDeleteBar
            count={selectedIds.size}
            onClear={clearSelection}
            onConfirmDelete={confirmBulkDelete}
            deleting={bulkDeleting}
          />

          <BuyerTable
            buyers={rows}
            config={config}
            ctx={ctx}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onTransition={transition}
            onPause={openPause}
            onTerminate={openTerminate}
            onDelete={(buyer) => setDeleteState({ buyer })}
            onRowClick={(buyer) => openBuyer(buyer)}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        </>
      )}

      <BuyerActionDialog
        open={!!actionState}
        onOpenChange={(v) => { if (!v) setActionState(null); }}
        action={actionState?.action}
        buyer={actionState?.buyer}
        closesStates={actionState?.closesStates || []}
        onConfirm={confirmAction}
      />

      <BuyerDeleteDialog
        open={!!deleteState}
        onOpenChange={(v) => { if (!v) setDeleteState(null); }}
        buyer={deleteState?.buyer}
        onConfirm={confirmDelete}
      />

      <BuyerCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        verticals={verticals}
        onCreated={onCreated}
      />
    </div>
  );
}