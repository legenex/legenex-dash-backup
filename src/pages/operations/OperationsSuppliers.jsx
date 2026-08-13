import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '@/lib/theme';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SectionHeader from '@/components/shared/SectionHeader';
import AutoCreatedReviewBanner from '@/components/operations/AutoCreatedReviewBanner';
import RefreshButton from '@/components/shared/RefreshButton';
import ColumnManager from '@/components/leads/ColumnManager';
import { PulseDot } from '@/components/settings/settingsUi';
import SupplierTable from '@/components/operations/suppliers/SupplierTable';
import SuppliersEmptyState from '@/components/operations/suppliers/SuppliersEmptyState';
import SupplierCreateModal from '@/components/operations/suppliers/SupplierCreateModal';
import SupplierActionDialog from '@/components/operations/suppliers/SupplierActionDialog';
import SupplierDeleteDialog from '@/components/operations/suppliers/SupplierDeleteDialog';
import SupplierBulkDeleteBar from '@/components/operations/suppliers/SupplierBulkDeleteBar';
import NoChannelBanner from '@/components/operations/suppliers/NoChannelBanner';
import SupplierDetailPage from '@/components/operations/suppliers/SupplierDetailPage';
import { suppliersWithNoChannel } from '@/components/operations/suppliers/supplierListModel';
import {
  SUPPLIER_AVAILABLE_COLUMNS, loadSupplierColumnConfig, saveSupplierColumnConfig, getSupplierColumnDef,
} from '@/components/operations/suppliers/supplierColumns';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'Internal', label: 'Internal' },
  { key: 'External', label: 'External' },
  { key: 'Calls', label: 'Calls' },
  { key: 'disabled', label: 'Disabled' },
];

// A supplier is considered disabled when its status is paused or terminated.
function isDisabled(supplier) {
  const status = String(supplier.status || '').toLowerCase();
  return status === 'paused' || status === 'terminated';
}

// Match a supplier against a tab by its supplier_type field. Disabled = status
// paused or terminated.
function matchesTab(supplier, tabKey) {
  if (tabKey === 'disabled') return isDisabled(supplier);
  if (tabKey === 'all') return true;
  return supplier.supplier_type === tabKey;
}

export default function OperationsSuppliers() {
  useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [config, setConfig] = useState(loadSupplierColumnConfig);

  const [actionState, setActionState] = useState(null); // { action, supplier }
  const [deleteState, setDeleteState] = useState(null); // { supplier }
  const [drawer, setDrawer] = useState(null); // { supplierId, tab }
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Deep link support: /operations/suppliers?supplier=<id>[&tab=<tab>] opens
  // that supplier's detail directly. This is what cross-links from Lead
  // Distribution point at, so Operations stays the one place suppliers are
  // managed instead of the older standalone /suppliers/:id page.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('supplier');
    if (id && drawer?.supplierId !== id) {
      setDrawer({ supplierId: id, tab: searchParams.get('tab') || undefined });
    }
  }, [searchParams]);

  // Clearing the detail also clears the deep link so a back navigation does not
  // immediately reopen it.
  const closeDetail = () => {
    setDrawer(null);
    if (searchParams.get('supplier')) {
      const next = new URLSearchParams(searchParams);
      next.delete('supplier');
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  };

  const { data: suppliers = [] } = useQuery({
    queryKey: ['op-suppliers'],
    queryFn: () => base44.entities.Supplier.list('-updated_date', 500),
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['op-supplier-sources'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.SupplierSource.list('', limit, skip)),
  });

  const ctx = { sources };

  const tabCounts = useMemo(() => {
    const counts = {};
    for (const t of TABS) counts[t.key] = suppliers.filter((s) => matchesTab(s, t.key)).length;
    return counts;
  }, [suppliers]);

  const noChannelCount = useMemo(() => suppliersWithNoChannel(suppliers).length, [suppliers]);

  const rows = useMemo(() => {
    const filtered = suppliers.filter((s) => matchesTab(s, tab));
    const col = getSupplierColumnDef(sortKey);
    if (!col) return filtered;
    const sorted = [...filtered].sort((a, b) => {
      const av = col.sortValue(a, ctx);
      const bv = col.sortValue(b, ctx);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [suppliers, tab, sortKey, sortDir, sources]);

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
    saveSupplierColumnConfig(next);
  };

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['op-suppliers'] }),
    qc.invalidateQueries({ queryKey: ['op-supplier-sources'] }),
  ]);

  // Instant status-only transition. The active boolean is derived at the data
  // layer, so it is never written from the UI.
  const transition = async (supplier, nextStatus) => {
    await base44.entities.Supplier.update(supplier.id, { status: nextStatus });
    toast.success(`Supplier set to ${nextStatus}`);
    qc.invalidateQueries({ queryKey: ['op-suppliers'] });
  };

  const openPause = (supplier) => setActionState({ action: 'pause', supplier });
  const openTerminate = (supplier) => setActionState({ action: 'terminate', supplier });

  // Pause / Terminate: write only the Supplier status field. No engine call and
  // no notification are triggered from this page.
  const confirmAction = async () => {
    const { action, supplier } = actionState;
    const nextStatus = action === 'pause' ? 'paused' : 'terminated';
    await base44.entities.Supplier.update(supplier.id, { status: nextStatus });
    toast.success(action === 'pause' ? 'Supplier paused' : 'Supplier terminated');
    qc.invalidateQueries({ queryKey: ['op-suppliers'] });
  };

  const confirmDelete = async () => {
    await base44.entities.Supplier.delete(deleteState.supplier.id);
    toast.success('Supplier deleted');
    qc.invalidateQueries({ queryKey: ['op-suppliers'] });
  };

  // Clone a supplier: copy its editable fields, reset status to new, blank the
  // SID, and append "(Copy)" to the name. Sources are not copied.
  const cloneSupplier = async (supplier) => {
    const { id, created_date, updated_date, created_by_id, ...rest } = supplier;
    const created = await base44.entities.Supplier.create({
      ...rest,
      name: `${supplier.name || 'Supplier'} (Copy)`,
      sid: '',
      status: 'new',
    });
    toast.success('Supplier cloned');
    await refresh();
    setDrawer({ supplierId: created.id });
  };

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelectAll = (checked) => setSelectedIds(checked ? new Set(rows.map((s) => s.id)) : new Set());
  const clearSelection = () => setSelectedIds(new Set());

  const confirmBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = [...selectedIds];
      await Promise.all(ids.map((id) => base44.entities.Supplier.delete(id)));
      toast.success(`${ids.length} ${ids.length === 1 ? 'supplier' : 'suppliers'} deleted`);
      clearSelection();
      await qc.invalidateQueries({ queryKey: ['op-suppliers'] });
    } catch (err) {
      toast.error(`Could not delete suppliers: ${err?.message || 'unknown error'}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  // After a create, refresh the table then open the new supplier on Sources,
  // since a supplier with no source falls back to its supplier level payout.
  const onCreated = async (created) => {
    await refresh();
    setDrawer({ supplierId: created.id });
  };

  // Open the detail page for a supplier.
  const openSupplier = (supplier) => setDrawer({ supplierId: supplier.id });
  const fixChannel = (supplier) => setDrawer({ supplierId: supplier.id });

  // Resolve the live record so the detail reflects list refreshes after saves.
  const drawerSupplier = drawer ? suppliers.find((s) => s.id === drawer.supplierId) : null;

  // Full-page detail swap: when a supplier is selected, render its detail in
  // place of the list. The list state is preserved behind it.
  if (drawerSupplier) {
    return (
      <SupplierDetailPage
        supplier={drawerSupplier}
        initialTab={drawer?.tab}
        onBack={closeDetail}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Supplier Management" subtitle="Payouts, sources and notification health for every supplier.">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <PulseDot /> Live
        </span>
        <RefreshButton onClick={refresh} />
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Create Supplier
        </Button>
      </SectionHeader>

      <AutoCreatedReviewBanner kind="supplier" />

      {suppliers.length === 0 ? (
        <SuppliersEmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <>
          <NoChannelBanner count={noChannelCount} />

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
            <ColumnManager config={config} availableColumns={SUPPLIER_AVAILABLE_COLUMNS} onChange={onConfigChange} />
          </div>

          <SupplierBulkDeleteBar
            count={selectedIds.size}
            onClear={clearSelection}
            onConfirmDelete={confirmBulkDelete}
            deleting={bulkDeleting}
          />

          <SupplierTable
            suppliers={rows}
            sources={sources}
            config={config}
            ctx={ctx}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onTransition={transition}
            onDelete={(supplier) => setDeleteState({ supplier })}
            onClone={cloneSupplier}
            onRowClick={openSupplier}
            onFixChannel={fixChannel}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        </>
      )}

      <SupplierActionDialog
        open={!!actionState}
        onOpenChange={(v) => { if (!v) setActionState(null); }}
        action={actionState?.action}
        supplier={actionState?.supplier}
        onConfirm={confirmAction}
      />

      <SupplierDeleteDialog
        open={!!deleteState}
        onOpenChange={(v) => { if (!v) setDeleteState(null); }}
        supplier={deleteState?.supplier}
        onConfirm={confirmDelete}
      />

      <SupplierCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onCreated}
      />
    </div>
  );
}