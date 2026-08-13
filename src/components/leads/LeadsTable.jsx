import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorStatusPill from '@/components/leads/ErrorStatusPill';
import StatusPill from '@/components/shared/StatusPill';
import LeadDetailModal from '@/components/leads/LeadDetailModal';
import LeadsFilterBar from '@/components/leads/LeadsFilterBar';
import LeadsShell from '@/components/leads/LeadsShell';
import BulkActionBar from '@/components/leads/BulkActionBar';
import LeadCard from '@/components/leads/LeadCard';
import { Panel, Tag, riseIn } from '@/components/settings/settingsUi';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { processLead } from '@/functions/processLead';
import { bulkDeleteLeads } from '@/functions/bulkDeleteLeads';
import { loadColumnConfig, saveColumnConfig, getColumnDef, buildAvailableColumns } from '@/lib/columnConfig';
import { leadEventInstant, leadField } from '@/lib/reportMetrics';
import { invalidateLeadCaches } from '@/lib/leadCaches';
import { resolvePeriod } from '@/lib/periodRange';
import LeadCountsStrip, { leadCounts } from '@/components/shared/LeadCountsStrip';

function getFieldValue(lead, field) {
  if (lead[field] != null && lead[field] !== '') return String(lead[field]);
  let mf = {};
  try { mf = JSON.parse(lead.mapped_fields || '{}'); } catch {}
  if (mf[field] != null && mf[field] !== '') return String(mf[field]);
  return '';
}

function matchesView(lead, view) {
  switch (view) {
    case 'all': return true;
    case 'sold': return lead.final_status === 'Sold';
    case 'unsold': return lead.final_status === 'Unsold';
    case 'disqualified':
      return lead.final_status === 'Disqualified' || lead.final_status === 'Error' || /disqual|dq/i.test(lead.leadbyte_record_status || '');
    case 'rejected':
      // Was matching final_status === 'Duplicate', which is wrong now that
      // Duplicate is a real merge outcome rather than a stand-in for Rejected.
      return lead.final_status === 'Rejected' || /reject/i.test(lead.leadbyte_record_status || '');
    case 'converted': return lead.final_status === 'Converted';
    case 'queued': return lead.final_status === 'Queued';
    default: return true;
  }
}

function matchesFilter(lead, filter) {
  if (!filter.field) return true;
  const value = getFieldValue(lead, filter.field);
  const target = (filter.value || '').toLowerCase();
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

function matchesSearch(lead, q) {
  const query = q.toLowerCase();
  return (lead.first_name || '').toLowerCase().includes(query)
    || (lead.last_name || '').toLowerCase().includes(query)
    || (lead.mobile || '').includes(query)
    || (lead.email || '').toLowerCase().includes(query)
    || (lead.supplier_name || '').toLowerCase().includes(query);
}

// Permanent filter dropdown options shown above every leads table.
const STATUS_FILTER_OPTIONS = [
  { value: 'Sold', label: 'Sold' },
  { value: 'Converted', label: 'Converted' },
  { value: 'Qualified', label: 'Qualified' },
  { value: 'Disqualified', label: 'Disqualified' },
  { value: 'Unsold', label: 'Unsold' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Returned', label: 'Returned' },
  { value: 'Queued', label: 'Queued' },
  { value: 'Error', label: 'Error' },
  { value: 'Duplicate', label: 'Duplicate' },
];

function getSource(lead) {
  let mf = {};
  try { mf = JSON.parse(lead.mapped_fields || '{}'); } catch {}
  for (const key of ['utm_source', 'source', 'lead_source', 'source_id', 'src']) {
    const lk = key.toLowerCase();
    for (const [k, v] of Object.entries(mf)) {
      if (k.toLowerCase() === lk && v != null && v !== '') return String(v);
    }
  }
  return null;
}

// Colored tag per Lead Type value. Falls back to neutral for unknown values.
const LEAD_TYPE_COLORS = {
  survey: 'bg-status-qualified status-qualified',
  form: 'bg-status-duplicate status-duplicate',
  experiment: 'bg-status-queued status-queued',
  lander: 'bg-status-unsold status-unsold',
  call: 'bg-status-disqualified status-disqualified',
  data: 'bg-status-sold status-sold',
  email: 'bg-status-rejected status-rejected',
};

function LeadTypeTag({ value }) {
  if (!value || value === '-') return <span className="text-muted-foreground">-</span>;
  const cls = LEAD_TYPE_COLORS[String(value).toLowerCase()] || 'tag-neutral';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {value}
    </span>
  );
}

const VIEW_CONFIGS = {
  all: { title: 'All Leads', subtitle: 'All processed leads with full trace data' },
  sold: { title: 'Sold Leads', subtitle: 'Sold leads with revenue and buyer data' },
  unsold: { title: 'Unsold Leads', subtitle: 'Leads that were not sold' },
  disqualified: { title: 'Disqualified Leads', subtitle: 'Leads that were disqualified' },
  rejected: { title: 'Rejected Leads', subtitle: 'Leads that were rejected' },
  queued: { title: 'Queued Leads', subtitle: 'Leads queued for manual handling' },
};

const SYSTEM_FILTER_FIELDS = [
  { value: 'supplier_name', label: 'Supplier' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'final_status', label: 'Final Status' },
  { value: 'hlr_status', label: 'HLR Status' },
  { value: 'leadbyte_record_status', label: 'LB Record Status' },
  { value: 'lead_id', label: 'Lead ID' },
  { value: 'revenue', label: 'Revenue' },
];

const FILTERS_STORAGE_KEY = 'legenex_saved_filters';

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
  } catch {}
}

export default function LeadsTable({ view }) {
  const qc = useQueryClient();
  const config = VIEW_CONFIGS[view] || VIEW_CONFIGS.all;

  const [search, setSearch] = useState('');
  // Period ALWAYS starts at This Month, on every visit, refresh and login.
  //
  // The URL is an OUTPUT only, never an input: the sub-nav badges and the
  // telemetry footer read it so they resolve the same window as this table.
  // Reading it back in was the bug: navigating within the app carried
  // ?period=custom from a previous screen, so the page reopened on a stale
  // custom range with the Custom tab lit. Nothing is persisted either, so two
  // visits can never resolve different windows and report different counts.
  const [, setSearchParams] = useSearchParams();
  const [period, setPeriodState] = useState('this_month');
  const [customPeriod, setCustomPeriodState] = useState({ from: '', to: '' });

  // Publish the current window to the URL, including on first mount, which
  // overwrites anything inherited from the previous screen.
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
  // Only switches to the custom range when dates are actually supplied.
  //
  // This used to flip to 'custom' unconditionally, and the view-reset effect
  // below clears the range by calling it with two empty strings. So every mount
  // and every view change reset the period to This Month and then immediately
  // knocked it back to Custom, which is why the page always opened on Custom no
  // matter how many times the default was 'fixed'.
  const setCustomPeriod = (c) => {
    const from = c?.from || '';
    const to = c?.to || '';
    setCustomPeriodState({ from, to });
    if (from || to) setPeriodState('custom');
  };
  const [customFilters, setCustomFilters] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [initialTab, setInitialTab] = useState('summary');
  const [savedSets, setSavedSets] = useState(() => loadSavedSets(view));
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitProgress, setResubmitProgress] = useState(null);
  const [columnConfig, setColumnConfig] = useState(() => loadColumnConfig(view));
  const [statusFilter, setStatusFilter] = useState([]);
  const [supplierFilter, setSupplierFilter] = useState([]);
  const [buyerFilter, setBuyerFilter] = useState([]);
  const [sourceFilter, setSourceFilter] = useState([]);
  const [verticalFilter, setVerticalFilter] = useState([]);
  const [page, setPage] = useState(1);
  // Rows per page. 50 unless the operator saved a different default with the
  // tick box next to the selector (persisted per browser).
  const PAGE_SIZE_KEY = 'legenex_leads_page_size_default';
  const [pageSize, setPageSize] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(PAGE_SIZE_KEY), 10);
      return [20, 50, 100, 200].includes(v) ? v : 50;
    } catch { return 50; }
  });
  const [savedPageSize, setSavedPageSize] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(PAGE_SIZE_KEY), 10);
      return [20, 50, 100, 200].includes(v) ? v : 50;
    } catch { return 50; }
  });
  const saveDefaultPageSize = (n) => {
    try { localStorage.setItem(PAGE_SIZE_KEY, String(n)); } catch { /* private mode */ }
    setSavedPageSize(n);
  };

  useEffect(() => {
    setSearch('');
    // Reset straight through the raw setters. Going via setPeriod /
    // setCustomPeriod here is what caused the Custom-on-load bug.
    setPeriodState('this_month');
    setCustomPeriodState({ from: '', to: '' });
    setCustomFilters([]);
    setSavedSets(loadSavedSets(view));
    setSelectedIds(new Set());
    setColumnConfig(loadColumnConfig(view));
    setStatusFilter([]);
    setSupplierFilter([]);
    setSourceFilter([]);
  }, [view]);

  // Persist column layout whenever it changes.
  useEffect(() => {
    saveColumnConfig(view, columnConfig);
  }, [view, columnConfig]);

  // Keep the table (and Status column) in sync when leads change in the backend.
  useEffect(() => {
    const unsubscribe = base44.entities.Lead.subscribe(() => {
      invalidateLeadCaches(qc);
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [qc]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads-all-non-archived'],
    queryFn: async () => {
      // Page through all matching leads. A single call is capped at 500, so
      // loop until a page returns fewer than 500 rows.
      const all = [];
      let p = 0;
      const size = 500;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await base44.entities.Lead.filter({ archived: false }, '-created_date', size, p * size);
        all.push(...batch);
        if (batch.length < size) break;
        p += 1;
      }
      return all;
    },
  });

  const { data: errorLogs = [] } = useQuery({
    queryKey: ['error-logs-recent'],
    queryFn: () => base44.entities.ErrorLog.list('-created_date', 200),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const errorLogByLeadId = useMemo(() => {
    const map = {};
    for (const e of errorLogs) {
      if (e.lead_id && !map[e.lead_id]) map[e.lead_id] = e;
    }
    return map;
  }, [errorLogs]);

  const filterFields = useMemo(() => {
    const customOpts = customFields.map(f => ({ value: f.field_name, label: f.label || f.field_name }));
    return [...SYSTEM_FILTER_FIELDS, ...customOpts];
  }, [customFields]);

  const availableColumns = useMemo(() => buildAvailableColumns(customFields), [customFields]);

  // Leads narrowed by everything EXCEPT the supplier and source multi-selects.
  //
  // The dropdown options used to be built from the raw all-time `leads`, so a
  // July range still listed sources that had only ever appeared in June. The
  // options have to reflect the current range.
  //
  // Each dropdown is then cross-filtered by the OTHER one but never by itself:
  // filtering a select by its own value would collapse its list to the single
  // option already chosen and you could never widen the selection again.
  const scoped = useMemo(() => {
    const { start, end } = resolvePeriod(period, customPeriod);
    return leads.filter(lead => {
      if (!matchesView(lead, view)) return false;
      const inst = leadEventInstant(lead);
      if (start && (!inst || inst < start)) return false;
      if (end && (!inst || inst > end)) return false;
      if (!customFilters.every(f => matchesFilter(lead, f))) return false;
      if (search && !matchesSearch(lead, search)) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(lead.final_status)) return false;
      return true;
    });
  }, [leads, view, period, customPeriod, customFilters, search, statusFilter]);

  const supplierOptions = useMemo(() => {
    const set = new Set();
    scoped.forEach(l => {
      if (sourceFilter.length > 0 && !sourceFilter.includes(getSource(l))) return;
      if (l.supplier_name) set.add(l.supplier_name);
    });
    return Array.from(set).sort().map(s => ({ value: s, label: s }));
  }, [scoped, sourceFilter]);

  const verticalOptions = useMemo(() => {
    const set = new Set();
    scoped.forEach(l => { const v = leadField(l, 'vertical'); if (v) set.add(String(v)); });
    return Array.from(set).sort().map(v => ({ value: v, label: v }));
  }, [scoped]);

  // Buyer options come from the buyer CODE, which is what the table column and
  // the supplier portal both show. Column first, bag as fallback, so a resold
  // lead offers its current buyer and not the previous one.
  const buyerOptions = useMemo(() => {
    const set = new Set();
    scoped.forEach(l => {
      const b = l.buyer_id || l.buyer_name || leadField(l, 'buyer_id') || leadField(l, 'buyer');
      if (b) set.add(String(b));
    });
    return Array.from(set).sort().map(b => ({ value: b, label: b }));
  }, [scoped]);

  const sourceOptions = useMemo(() => {
    const set = new Set();
    scoped.forEach(l => {
      if (supplierFilter.length > 0 && !supplierFilter.includes(l.supplier_name)) return;
      const s = getSource(l);
      if (s) set.add(s);
    });
    return Array.from(set).sort().map(s => ({ value: s, label: s }));
  }, [scoped, supplierFilter]);

  const columns = columnConfig.columns;

  // ── Column resize (drag the header right edge) ───────────────────────
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
    // scoped already applied view, period, custom filters, search and status.
    // Only the two multi-selects remain.
    const result = scoped.filter(lead => {
      if (supplierFilter.length > 0 && !supplierFilter.includes(lead.supplier_name)) return false;
      if (buyerFilter.length > 0) {
        const b = lead.buyer_id || lead.buyer_name || leadField(lead, 'buyer_id') || leadField(lead, 'buyer');
        if (!buyerFilter.includes(String(b ?? ''))) return false;
      }
      if (sourceFilter.length > 0 && !sourceFilter.includes(getSource(lead))) return false;
      if (verticalFilter.length > 0 && !verticalFilter.includes(String(leadField(lead, 'vertical') ?? ''))) return false;
      return true;
    });
    // Sort newest first by the lead's real event time. leadEventInstant is the
    // single source of truth (it already falls back to created_date). Leads
    // with no usable event time sort last. result is a fresh array from
    // filter(), so this does not mutate the query cache.
    const instant = (lead) => {
      const d = leadEventInstant(lead);
      const t = d ? d.getTime() : NaN;
      return Number.isNaN(t) ? -Infinity : t;
    };
    return result.sort((a, b) => instant(b) - instant(a));
  }, [scoped, supplierFilter, sourceFilter]);

  // Client-side pagination over the filtered set. Selection and bulk actions
  // still span the whole filtered set; only the rendered rows are sliced.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  );
  // Reset to page 1 whenever the view, search, or any filter changes.
  useEffect(() => { setPage(1); }, [view, search, period, customPeriod, customFilters, statusFilter, supplierFilter, buyerFilter, sourceFilter, verticalFilter, pageSize]);

  // Real telemetry for the shell footer.
  //
  // Counted over the SELECTED PERIOD, not every lead ever loaded. Counting all
  // time here while the table showed one month is what made the footer read
  // Sold 562 under a table showing 292. The view filter is deliberately not
  // applied: the footer is a summary of the period across all statuses, so the
  // Sold figure here matches the Sold tab's own row count.
  const periodLeads = useMemo(() => {
    const { start, end } = resolvePeriod(period, customPeriod);
    return leads.filter((l) => {
      const inst = leadEventInstant(l);
      if (start && (!inst || inst < start)) return false;
      if (end && (!inst || inst > end)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, period, customPeriod.from, customPeriod.to]);

  // Counts for the strip above the table. Derived from `filtered`, which has
  // had EVERY filter applied (period, view, search, status, supplier, source,
  // vertical and any custom filters), so the numbers always describe exactly
  // the rows on screen.
  const counts = useMemo(() => leadCounts(filtered), [filtered]);

  const telemetry = useMemo(() => ({
    total: periodLeads.length,
    sold: periodLeads.filter(l => l.final_status === 'Sold').length,
    queued: periodLeads.filter(l => l.final_status === 'Queued').length,
    errors: periodLeads.filter(l => l.final_status === 'Error').length,
    lastLeadAt: leads[0]?.created_date || null,
  }), [periodLeads, leads]);

  const exportCSV = () => {
    const cols = columns;
    const headers = cols.map(c => getColumnDef(c.key, customFields)?.header || c.key);
    const rows = filtered.map(l => cols.map(c => {
      const def = getColumnDef(c.key, customFields);
      return def ? def.accessor(l) : '';
    }));
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${view}-leads.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const openLeadDetail = (lead, stage) => {
    setInitialTab(stage === 'hlr' ? 'hlr' : stage === 'leadbyte' ? 'delivery' : 'summary');
    setSelectedLead(lead);
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
    const updated = savedSets.filter(s => s.id !== id);
    setSavedSets(updated);
    persistSavedSets(view, updated);
  };

  // Two-stage select all: the header checkbox toggles ONLY the current page's
  // rows. A banner then offers to extend the selection to the whole filtered set.
  const pageIds = useMemo(() => paged.map(l => l.id), [paged]);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const allFilteredSelected = filtered.length > 0 && filtered.every(l => selectedIds.has(l.id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(() => new Set(filtered.map(l => l.id)));
  };

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedLeads = useMemo(
    () => filtered.filter(l => selectedIds.has(l.id)),
    [filtered, selectedIds]
  );

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    setBulkDeleteOpen(false);
    try {
      const res = await bulkDeleteLeads({ ids });
      const deleted = res?.data?.deleted ?? 0;
      toast.success(`${deleted} lead${deleted !== 1 ? 's' : ''} deleted`);
      clearSelection();
      invalidateLeadCaches(qc);
      await Promise.all([
        qc.refetchQueries({ queryKey: ['leads-all-non-archived'] }),
              ]);
    } catch (e) {
      toast.error(`Delete failed: ${e?.message || 'unknown error'}`);
    }
    setDeleting(false);
  };

  const handleBulkQueue = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await base44.entities.Lead.update(id, { final_status: 'Queued' });
    }
    toast.success(`${ids.length} lead${ids.length !== 1 ? 's' : ''} queued`);
    clearSelection();
    invalidateLeadCaches(qc);
  };

  const handleBulkResubmit = async () => {
    const leadsToResubmit = selectedLeads;
    setResubmitting(true);
    setResubmitProgress({ done: 0, total: leadsToResubmit.length });
    let success = 0;
    let failed = 0;
    for (let i = 0; i < leadsToResubmit.length; i++) {
      const lead = leadsToResubmit[i];
      try {
        const payload = JSON.parse(lead.raw_payload || '{}');
        const keys = await base44.entities.ApiKey.filter({ id: lead.supplier_key_id });
        const key = keys[0]?.key;
        if (!key) { failed++; continue; }
        await processLead({ ...payload, _supplier_key: key });
        success++;
      } catch {
        failed++;
      }
      setResubmitProgress({ done: i + 1, total: leadsToResubmit.length });
    }
    toast.success(`${success} re-submitted${failed > 0 ? `, ${failed} failed` : ''}`);
    setResubmitting(false);
    setResubmitProgress(null);
    clearSelection();
    invalidateLeadCaches(qc);
  };

  const handleBulkEdit = () => {
    if (selectedLeads.length !== 1) return;
    setInitialTab('summary');
    setSelectedLead(selectedLeads[0]);
  };

  return (
    <LeadsShell
      title={config.title}
      subtitle={config.subtitle}
      count={filtered.length}
      onRefresh={async () => {
        // Force a fresh network fetch of the leads list plus the nav counts,
        // bypassing staleness so a just-arrived lead shows without a full page
        // reload. refetchQueries forces the fetch; invalidate keeps other lead
        // views (Reports, Finances, campaign metrics) in sync too.
        await Promise.all([
          qc.refetchQueries({ queryKey: ['leads-all-non-archived'], type: 'active' }),
                  ]);
        invalidateLeadCaches(qc);
      }}
      onExport={exportCSV}
      columnConfig={columnConfig}
      availableColumns={availableColumns}
      onColumnChange={setColumnConfig}
      telemetry={telemetry}
    >
      <div className="shrink-0">

      <LeadsFilterBar
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
        buyerFilter={buyerFilter}
        setBuyerFilter={setBuyerFilter}
        buyerOptions={buyerOptions}
        sourceFilter={sourceFilter}
        verticalFilter={verticalFilter}
        setVerticalFilter={setVerticalFilter}
        verticalOptions={verticalOptions}
        setSourceFilter={setSourceFilter}
        sourceOptions={sourceOptions}
      />

      {/* Lead counts, directly under the filters that drive them.

          This used to be a footer under the table showing only Total and Sold,
          and it counted the whole period regardless of the status, supplier,
          buyer or source filters above, so changing a filter moved the rows and
          left the numbers alone. It is fed `filtered`, the exact set on screen. */}
      <LeadCountsStrip counts={counts} className="mt-3" />

      <BulkActionBar
        selectedCount={selectedIds.size}
        onResubmit={handleBulkResubmit}
        onDelete={() => setBulkDeleteOpen(true)}
        onQueue={handleBulkQueue}
        onEdit={handleBulkEdit}
        onClear={clearSelection}
        resubmitting={resubmitting}
        progress={resubmitProgress}
      />

      {allPageSelected && !allFilteredSelected && filtered.length > paged.length && (
        <div className="mt-2 flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-[13px] text-foreground flex-wrap">
          <span>All {paged.length} leads on this page are selected.</span>
          <button
            onClick={selectAllFiltered}
            className="font-semibold text-primary hover:underline"
          >
            Select all {filtered.length} leads matching filters
          </button>
        </div>
      )}
      {allFilteredSelected && filtered.length > paged.length && (
        <div className="mt-2 flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-[13px] text-foreground flex-wrap">
          <span>All {filtered.length} leads matching filters are selected.</span>
          <button onClick={clearSelection} className="font-semibold text-primary hover:underline">
            Clear selection
          </button>
        </div>
      )}
      </div>

      {/* Mobile card list: below lg only */}
      <div className="lg:hidden flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-card">
        {isLoading && (
          <div className="px-4 py-8 text-center text-muted-foreground">Loading...</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground">No leads found</div>
        )}
        {paged.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onOpen={openLeadDetail} />
        ))}
      </div>

      <Panel className="hidden lg:block flex-1 min-h-0 overflow-auto" i={1}>
          <table className="min-w-full w-max text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted sticky top-0 z-10">
                <th className="px-4 py-3 w-[40px]">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all on this page"
                  />
                </th>
                {columns.map((col) => {
                  const def = getColumnDef(col.key, customFields);
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
                <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted-foreground">No leads found</td></tr>
              )}
              {paged.map((lead, idx) => (
                <motion.tr
                  key={lead.id}
                  variants={riseIn}
                  initial="hidden"
                  animate="show"
                  custom={Math.min(idx, 20)}
                  className="hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => openLeadDetail(lead)}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(lead.id)}
                      onCheckedChange={() => toggleSelectRow(lead.id)}
                      aria-label={`Select lead ${lead.id}`}
                    />
                  </td>
                  {columns.map((col) => {
                    const def = getColumnDef(col.key, customFields);
                    const widthStyle = col.width ? { width: `${col.width}px`, minWidth: `${col.width}px` } : undefined;
                    if (!def) return <td key={col.key} className="px-4 py-3" style={widthStyle}>-</td>;
                    if (col.key === 'vertical') {
                      const v = def.accessor(lead);
                      return (
                        <td key={col.key} className="px-4 py-3" style={widthStyle}>
                          {v && v !== '-' ? <Tag tone="good">{v}</Tag> : <span className="text-muted-foreground">-</span>}
                        </td>
                      );
                    }
                    if (col.key === 'finalStatus') {
                      return (
                        <td key={col.key} className="px-4 py-3" style={widthStyle}>
                          <ErrorStatusPill
                            lead={lead}
                            errorLogEntry={errorLogByLeadId[lead.id]}
                            onOpenDetail={openLeadDetail}
                          />
                        </td>
                      );
                    }
                    if (col.key === 'leadType') {
                      return (
                        <td key={col.key} className="px-4 py-3" style={widthStyle}>
                          <LeadTypeTag value={def.accessor(lead)} />
                        </td>
                      );
                    }
                    if (col.key === 'leadStatus') {
                      const ls = def.accessor(lead);
                      const value = ls && ls !== '-' ? String(ls) : '';
                      return (
                        <td key={col.key} className="px-4 py-3" style={widthStyle}>
                          {value && value !== 'Qualified' ? <StatusPill status={value} /> : <span className="text-muted-foreground">-</span>}
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className={`px-4 py-3 ${def.className || ''}`} style={widthStyle}>
                        {def.accessor(lead)}
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
              {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n} / page</option>)}
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
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="h-8 px-3 rounded-md border border-border bg-card text-foreground text-[12px] disabled:opacity-40 disabled:pointer-events-none hover:bg-accent transition-colors"
            >
              Prev
            </button>
            <span className="text-[12px] text-muted-foreground tabular-nums">Page {safePage} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="h-8 px-3 rounded-md border border-border bg-card text-foreground text-[12px] disabled:opacity-40 disabled:pointer-events-none hover:bg-accent transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-6 py-4 shadow-xl">
            <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-[13px] text-foreground">Deleting leads...</span>
          </div>
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">
              {deleting ? 'Deleting...' : `Delete ${selectedIds.size} Lead${selectedIds.size !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LeadDetailModal
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        initialTab={initialTab}
      />
    </LeadsShell>
  );
}