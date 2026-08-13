import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import StatusPill from '@/components/shared/StatusPill';
import CallsShell from '@/components/calls/CallsShell';
import CallsFilterBar from '@/components/calls/CallsFilterBar';
import CallStatsCards, { callStats } from '@/components/calls/CallStatsCards';
import { Panel, Tag, riseIn } from '@/components/settings/settingsUi';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { resolvePeriod } from '@/lib/periodRange';
import {
  callEventInstant, callStatusOf, matchesCallView, matchesCallSearch,
} from '@/lib/callFields';
import {
  loadCallColumnConfig, saveCallColumnConfig, getCallColumnDef,
  buildAvailableCallColumns, CALL_FILTER_FIELDS,
} from '@/lib/callColumns';

// Read a raw field for the custom-filter rows. Falls back to the operator's
// custom_fields bag so a mapped sheet column can be filtered on too.
function getFieldValue(call, field) {
  if (call[field] != null && call[field] !== '') return String(call[field]);
  let bag = {};
  try { bag = JSON.parse(call.custom_fields || '{}'); } catch { bag = {}; }
  if (bag[field] != null && bag[field] !== '') return String(bag[field]);
  return '';
}

function matchesFilter(call, filter) {
  if (!filter.field) return true;
  const value = getFieldValue(call, filter.field);
  const target = String(filter.value || '').toLowerCase();
  switch (filter.operator) {
    case 'equals': return value.toLowerCase() === target;
    case 'not_equals': return value.toLowerCase() !== target;
    case 'contains': return value.toLowerCase().includes(target);
    case 'not_contains': return !value.toLowerCase().includes(target);
    case 'starts_with': return value.toLowerCase().startsWith(target);
    case 'ends_with': return value.toLowerCase().endsWith(target);
    case 'is_empty': return !value;
    case 'is_not_empty': return !!value;
    case 'gt': return parseFloat(value) > parseFloat(target);
    case 'lt': return parseFloat(value) < parseFloat(target);
    default: return true;
  }
}

const STATUS_FILTER_OPTIONS = [
  { value: 'Converted', label: 'Converted' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Error', label: 'Error' },
];

const VIEW_CONFIGS = {
  all: { title: 'All Calls', subtitle: 'Every inbound call with its duration, outcome, payout and supplier attribution' },
  converted: { title: 'Converted Calls', subtitle: 'Calls the buyer accepted and paid for' },
  rejected: { title: 'Rejected Calls', subtitle: 'Calls the buyer declined, with the disposition they returned' },
};

const FILTERS_STORAGE_KEY = 'legenex_call_saved_filters';

function loadSavedSets(view) {
  try {
    const all = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY) || '{}');
    return all[view] || [];
  } catch { return []; }
}

function persistSavedSets(view, sets) {
  try {
    const all = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY) || '{}');
    all[view] = sets;
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}

export default function CallsTable({ view }) {
  const qc = useQueryClient();
  const config = VIEW_CONFIGS[view] || VIEW_CONFIGS.all;

  const [search, setSearch] = useState('');

  // Period ALWAYS starts at This Month, on every visit. The URL is an OUTPUT
  // only, never an input: CallsNav reads it so the badges resolve the same
  // window as the table. Same contract as the Leads section.
  const [, setSearchParams] = useSearchParams();
  const [period, setPeriodState] = useState('this_month');
  const [customPeriod, setCustomPeriodState] = useState({ from: '', to: '' });

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set('period', period);
    if (period === 'custom') {
      if (customPeriod.from) next.set('from', customPeriod.from); else next.delete('from');
      if (customPeriod.to) next.set('to', customPeriod.to); else next.delete('to');
    } else {
      next.delete('from');
      next.delete('to');
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customPeriod.from, customPeriod.to]);

  const setPeriod = (p) => {
    setPeriodState(p);
    if (p !== 'custom') setCustomPeriodState({ from: '', to: '' });
  };
  // Only switches to custom when dates are actually supplied, so the view-reset
  // effect below cannot knock the page back onto Custom on every mount.
  const setCustomPeriod = (c) => {
    const from = c?.from || '';
    const to = c?.to || '';
    setCustomPeriodState({ from, to });
    if (from || to) setPeriodState('custom');
  };

  const [customFilters, setCustomFilters] = useState([]);
  const [savedSets, setSavedSets] = useState(() => loadSavedSets(view));
  const [columnConfig, setColumnConfig] = useState(() => loadCallColumnConfig(view));
  const [statusFilter, setStatusFilter] = useState([]);
  const [supplierFilter, setSupplierFilter] = useState([]);
  const [sidFilter, setSidFilter] = useState([]);
  const [ssidFilter, setSsidFilter] = useState([]);
  const [buyerFilter, setBuyerFilter] = useState([]);
  const [verticalFilter, setVerticalFilter] = useState([]);
  const [sourceFilter, setSourceFilter] = useState([]);
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const PAGE_SIZE_KEY = 'legenex_calls_page_size_default';
  const readPageSize = () => {
    try {
      const v = parseInt(localStorage.getItem(PAGE_SIZE_KEY), 10);
      return [20, 50, 100, 200].includes(v) ? v : 50;
    } catch { return 50; }
  };
  const [pageSize, setPageSize] = useState(readPageSize);
  const [savedPageSize, setSavedPageSize] = useState(readPageSize);
  const saveDefaultPageSize = (n) => {
    try { localStorage.setItem(PAGE_SIZE_KEY, String(n)); } catch { /* private mode */ }
    setSavedPageSize(n);
  };

  useEffect(() => {
    setSearch('');
    setPeriodState('this_month');
    setCustomPeriodState({ from: '', to: '' });
    setCustomFilters([]);
    setSavedSets(loadSavedSets(view));
    setColumnConfig(loadCallColumnConfig(view));
    setStatusFilter([]);
    setSupplierFilter([]);
    setSidFilter([]);
    setSsidFilter([]);
    setBuyerFilter([]);
    setVerticalFilter([]);
    setSourceFilter([]);
  }, [view]);

  useEffect(() => {
    saveCallColumnConfig(view, columnConfig);
  }, [view, columnConfig]);

  // Same query key as CallsNav, so the badges and the rows share one cache.
  const { data: calls = [], isLoading } = useQuery({
    queryKey: ['call-records-all'],
    queryFn: async () => {
      // A single list call is hard capped at 500 rows regardless of the limit
      // argument, so page until a short tail comes back.
      const all = [];
      let p = 0;
      const size = 500;
      for (;;) {
        const batch = (await base44.entities.CallRecord.list('-call_at', size, p * size)) || [];
        all.push(...batch);
        if (batch.length < size || p > 40) break;
        p += 1;
      }
      return all;
    },
  });

  const availableColumns = useMemo(() => buildAvailableCallColumns(calls), [calls]);

  const filterFields = useMemo(() => {
    const customKeys = new Set();
    for (const c of calls || []) {
      let bag = {};
      try { bag = JSON.parse(c.custom_fields || '{}'); } catch { bag = {}; }
      for (const k of Object.keys(bag)) customKeys.add(k);
    }
    const customOpts = Array.from(customKeys).sort().map((k) => ({ value: k, label: k }));
    return [...CALL_FILTER_FIELDS, ...customOpts];
  }, [calls]);

  // Narrowed by everything EXCEPT the attribution multi-selects, so each of
  // those dropdowns still offers the values you could switch to. Options are
  // built from this set rather than the raw list, so a July range never offers
  // a supplier that only ever appeared in June.
  const scoped = useMemo(() => {
    const { start, end } = resolvePeriod(period, customPeriod);
    return (calls || []).filter((call) => {
      if (!matchesCallView(call, view)) return false;
      const inst = callEventInstant(call);
      if (start && (!inst || inst < start)) return false;
      if (end && (!inst || inst > end)) return false;
      if (!customFilters.every((f) => matchesFilter(call, f))) return false;
      if (search && !matchesCallSearch(call, search)) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(callStatusOf(call))) return false;
      return true;
    });
  }, [calls, view, period, customPeriod, customFilters, search, statusFilter]);

  const optionsFrom = (rows, read) => {
    const set = new Set();
    rows.forEach((r) => { const v = read(r); if (v != null && v !== '') set.add(String(v)); });
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  };

  const supplierOptions = useMemo(() => optionsFrom(scoped, (c) => c.supplier_name), [scoped]);
  const sidOptions = useMemo(() => optionsFrom(scoped, (c) => c.sid), [scoped]);
  const ssidOptions = useMemo(() => optionsFrom(scoped, (c) => c.ssid), [scoped]);
  const buyerOptions = useMemo(() => optionsFrom(scoped, (c) => c.buyer_code || c.buyer_name), [scoped]);
  const verticalOptions = useMemo(() => optionsFrom(scoped, (c) => c.vertical), [scoped]);
  const sourceOptions = useMemo(() => optionsFrom(scoped, (c) => c.source_name), [scoped]);

  const columns = columnConfig.columns;

  // Column resize, dragging the header right edge.
  const resizeRef = useRef(null);

  const handleResizeMove = useCallback((e) => {
    const r = resizeRef.current;
    if (!r) return;
    const newWidth = Math.max(70, r.startWidth + (e.clientX - r.startX));
    setColumnConfig((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c.key === r.colKey ? { ...c, width: newWidth } : c)),
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback((e, colKey) => {
    e.stopPropagation();
    e.preventDefault();
    const th = e.currentTarget.parentElement;
    resizeRef.current = { colKey, startX: e.clientX, startWidth: th.offsetWidth };
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove, handleResizeEnd]);

  const filtered = useMemo(() => {
    const result = scoped.filter((call) => {
      if (supplierFilter.length > 0 && !supplierFilter.includes(String(call.supplier_name ?? ''))) return false;
      if (sidFilter.length > 0 && !sidFilter.includes(String(call.sid ?? ''))) return false;
      if (ssidFilter.length > 0 && !ssidFilter.includes(String(call.ssid ?? ''))) return false;
      if (buyerFilter.length > 0 && !buyerFilter.includes(String(call.buyer_code || call.buyer_name || ''))) return false;
      if (verticalFilter.length > 0 && !verticalFilter.includes(String(call.vertical ?? ''))) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(String(call.source_name ?? ''))) return false;
      return true;
    });
    // Newest first by the call's real event time. Calls with no usable time
    // sort last. result is a fresh array, so the query cache is not mutated.
    const instant = (call) => {
      const d = callEventInstant(call);
      const t = d ? d.getTime() : NaN;
      return Number.isNaN(t) ? -Infinity : t;
    };
    return result.sort((a, b) => instant(b) - instant(a));
  }, [scoped, supplierFilter, sidFilter, ssidFilter, buyerFilter, verticalFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  );

  useEffect(() => { setPage(1); }, [
    view, search, period, customPeriod, customFilters, statusFilter,
    supplierFilter, sidFilter, ssidFilter, buyerFilter, verticalFilter, sourceFilter, pageSize,
  ]);

  // Cards describe exactly the rows on screen: fed `filtered`, which has had
  // every filter applied.
  const stats = useMemo(() => callStats(filtered), [filtered]);

  // Footer telemetry counts the whole period across all views, so the figures
  // here match what the sub-nav badges add up to.
  const periodCalls = useMemo(() => {
    const { start, end } = resolvePeriod(period, customPeriod);
    return (calls || []).filter((c) => {
      const inst = callEventInstant(c);
      if (start && (!inst || inst < start)) return false;
      if (end && (!inst || inst > end)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, period, customPeriod.from, customPeriod.to]);

  const telemetry = useMemo(() => ({
    pending: periodCalls.filter((c) => callStatusOf(c) === 'Pending').length,
    unattributed: periodCalls.filter((c) => !c.supplier_name).length,
    lastCallAt: calls[0]?.call_at || calls[0]?.created_date || null,
  }), [periodCalls, calls]);

  // Delete exactly the calls currently on screen: the filtered set, not the
  // whole entity. Deleting "everything" from a filtered view is the classic way
  // to lose records you could not see, so the confirmation names the count and
  // the filters that produced it.
  const deleteFiltered = async () => {
    setDeleting(true);
    let removed = 0;
    let failed = 0;
    for (const call of filtered) {
      try {
        await base44.entities.CallRecord.delete(call.id);
        removed += 1;
      } catch {
        failed += 1;
      }
    }
    setDeleting(false);
    setConfirmDelete(false);
    if (failed) toast.error(`Deleted ${removed}, ${failed} could not be removed`);
    else toast.success(`Deleted ${removed} call${removed === 1 ? '' : 's'}`);
    await qc.refetchQueries({ queryKey: ['call-records-all'], type: 'active' });
    qc.invalidateQueries({ queryKey: ['call-records-all'] });
  };

  const exportCSV = () => {
    const headers = columns.map((c) => getCallColumnDef(c.key)?.header || c.key);
    const rows = filtered.map((call) => columns.map((c) => {
      const def = getCallColumnDef(c.key);
      return def ? def.accessor(call) : '';
    }));
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${view}-calls.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const applySavedSet = (set) => {
    setPeriod(set.period || 'this_month');
    setCustomPeriod(set.customPeriod || { from: '', to: '' });
    setCustomFilters(set.customFilters || []);
    setSearch(set.search || '');
  };

  const saveCurrentAsSet = (name) => {
    const newSet = { id: Date.now().toString(), name, period, customPeriod, customFilters, search };
    const updated = [...savedSets, newSet];
    setSavedSets(updated);
    persistSavedSets(view, updated);
  };

  const deleteSavedSet = (id) => {
    const updated = savedSets.filter((s) => s.id !== id);
    setSavedSets(updated);
    persistSavedSets(view, updated);
  };

  const emptyMessage = calls.length === 0
    ? 'No calls yet. Connect a call sheet in Settings, Data Sources, Google Sheets.'
    : 'No calls match these filters';

  return (
    <CallsShell
      title={config.title}
      subtitle={config.subtitle}
      count={filtered.length}
      onRefresh={async () => {
        await qc.refetchQueries({ queryKey: ['call-records-all'], type: 'active' });
        qc.invalidateQueries({ queryKey: ['call-records-all'] });
      }}
      onExport={exportCSV}
      onDelete={filtered.length > 0 ? () => setConfirmDelete(true) : null}
      deleteLabel={`Delete ${filtered.length}`}
      columnConfig={columnConfig}
      availableColumns={availableColumns}
      onColumnChange={setColumnConfig}
      telemetry={telemetry}
    >
      <div className="shrink-0">
        <CallsFilterBar
          search={search}
          setSearch={setSearch}
          period={period}
          setPeriod={setPeriod}
          customPeriod={customPeriod}
          setCustomPeriod={setCustomPeriod}
          customFilters={customFilters}
          setCustomFilters={setCustomFilters}
          savedSets={savedSets}
          onSaveSet={saveCurrentAsSet}
          onDeleteSet={deleteSavedSet}
          onApplySet={applySavedSet}
          filterFields={filterFields}
          resultCount={filtered.length}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          statusOptions={STATUS_FILTER_OPTIONS}
          supplierFilter={supplierFilter}
          setSupplierFilter={setSupplierFilter}
          supplierOptions={supplierOptions}
          sidFilter={sidFilter}
          setSidFilter={setSidFilter}
          sidOptions={sidOptions}
          ssidFilter={ssidFilter}
          setSsidFilter={setSsidFilter}
          ssidOptions={ssidOptions}
          buyerFilter={buyerFilter}
          setBuyerFilter={setBuyerFilter}
          buyerOptions={buyerOptions}
          verticalFilter={verticalFilter}
          setVerticalFilter={setVerticalFilter}
          verticalOptions={verticalOptions}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          sourceOptions={sourceOptions}
        />

        {/* Call numbers sit directly under the filters that drive them. */}
        <CallStatsCards stats={stats} />
      </div>

      {/* Mobile card list: below lg only */}
      <div className="lg:hidden flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-card mt-3">
        {isLoading && <div className="px-4 py-8 text-center text-muted-foreground">Loading...</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground">{emptyMessage}</div>
        )}
        {paged.map((call) => (
          <div key={call.id} className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[13px] text-foreground">{call.mobile_raw || call.mobile || '-'}</span>
              <StatusPill status={callStatusOf(call)} />
            </div>
            <div className="text-[12px] text-muted-foreground mt-1 truncate">
              {[call.first_name, call.last_name].filter(Boolean).join(' ') || 'Unknown caller'}
              {call.supplier_name ? ` - ${call.supplier_name}` : ''}
              {call.sid ? ` (${call.sid})` : ''}
            </div>
          </div>
        ))}
      </div>

      <Panel className="hidden lg:block flex-1 min-h-0 overflow-auto mt-3" i={1}>
        <table className="min-w-full w-max text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted sticky top-0 z-10">
              {columns.map((col) => {
                const def = getCallColumnDef(col.key);
                const widthStyle = col.width ? { width: `${col.width}px`, minWidth: `${col.width}px` } : undefined;
                return (
                  <th
                    key={col.key}
                    className="text-left px-4 py-3 pr-6 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider relative whitespace-nowrap"
                    style={widthStyle}
                  >
                    {def?.header || col.key}
                    <span
                      onMouseDown={(e) => handleResizeStart(e, col.key)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/50 flex items-center justify-center"
                    >
                      <span className="block w-px h-4 bg-border" />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">{emptyMessage}</td></tr>
            )}
            {paged.map((call, idx) => (
              <motion.tr
                key={call.id}
                variants={riseIn}
                initial="hidden"
                animate="show"
                custom={Math.min(idx, 20)}
                className="hover:bg-accent/50 transition-colors"
              >
                {columns.map((col) => {
                  const def = getCallColumnDef(col.key);
                  const widthStyle = col.width ? { width: `${col.width}px`, minWidth: `${col.width}px` } : undefined;
                  if (!def) return <td key={col.key} className="px-4 py-3" style={widthStyle}>-</td>;
                  if (def.special === 'vertical') {
                    const v = def.accessor(call);
                    return (
                      <td key={col.key} className="px-4 py-3" style={widthStyle}>
                        {v && v !== '-' ? <Tag tone="good">{v}</Tag> : <span className="text-muted-foreground">-</span>}
                      </td>
                    );
                  }
                  if (def.special === 'callStatus') {
                    return (
                      <td key={col.key} className="px-4 py-3" style={widthStyle}>
                        <StatusPill status={def.accessor(call)} />
                      </td>
                    );
                  }
                  if (def.special === 'qualified') {
                    return (
                      <td key={col.key} className="px-4 py-3" style={widthStyle}>
                        <span
                          className={`inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium ${call.qualified ? 'text-primary' : 'text-muted-foreground'}`}
                          title={call.qualified_raw ? `From: ${call.qualified_raw}` : undefined}
                        >
                          {call.qualified ? 'Qualified' : 'No'}
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className={`px-4 py-3 ${def.className || ''}`} style={widthStyle}>
                      {def.accessor(call)}
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {filtered.length > 0 && (
        <div className="shrink-0 flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="text-[12px] text-muted-foreground">
            Showing {(safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 rounded-md border border-border bg-card text-foreground text-[12px] px-2"
            >
              {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none" title="Use the selected page length as the default">
              <input
                type="checkbox"
                checked={savedPageSize === pageSize}
                onChange={(e) => { if (e.target.checked) saveDefaultPageSize(pageSize); }}
                className="h-3.5 w-3.5 rounded border-border bg-card accent-[hsl(var(--primary))]"
              />
              Default
            </label>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="h-8 px-3 rounded-md border border-border bg-card text-foreground text-[12px] disabled:opacity-40 disabled:pointer-events-none hover:bg-accent transition-colors"
            >
              Prev
            </button>
            <span className="text-[12px] text-muted-foreground tabular-nums">Page {safePage} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="h-8 px-3 rounded-md border border-border bg-card text-foreground text-[12px] disabled:opacity-40 disabled:pointer-events-none hover:bg-accent transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      <AlertDialog open={confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(false); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {filtered.length} call{filtered.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the calls currently shown by these filters, not the whole call history. They can be pulled
              again from the source, but anything a buyer report had already filled in on them is lost. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteFiltered(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground"
            >
              {deleting ? 'Deleting...' : `Delete ${filtered.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CallsShell>
  );
}
