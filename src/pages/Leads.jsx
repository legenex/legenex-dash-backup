import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import ErrorStatusPill from '@/components/leads/ErrorStatusPill';
import BulkActionBar from '@/components/leads/BulkActionBar';
import LeadDetailModal from '@/components/leads/LeadDetailModal';
import ExportColumnsDialog from '@/components/leads/ExportColumnsDialog';
import { buildLeadsCsv } from '@/lib/leadExportColumns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Download, Search, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { processLead } from '@/functions/processLead';

export default function Leads() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [initialTab, setInitialTab] = useState('summary');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [resubmitting, setResubmitting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [viewMode, setViewMode] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      // Page through all matching leads. A single call is capped at 500, so
      // loop until a page returns fewer than 500 rows.
      const all = [];
      let page = 0;
      const pageSize = 500;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await base44.entities.Lead.filter({ archived: false }, '-created_date', pageSize, page * pageSize);
        all.push(...batch);
        if (batch.length < pageSize) break;
        page += 1;
      }
      return all;
    },
  });

  // Fetch error log entries to enrich error pills
  const { data: errorLogs = [] } = useQuery({
    queryKey: ['error-logs-recent'],
    queryFn: () => base44.entities.ErrorLog.list('-created_date', 200),
  });

  // Index the most recent error log per lead for fast lookup
  const errorLogByLeadId = useMemo(() => {
    const map = {};
    for (const e of errorLogs) {
      if (e.lead_id && !map[e.lead_id]) map[e.lead_id] = e;
    }
    return map;
  }, [errorLogs]);

  const suppliers = [...new Set(leads.map(l => l.supplier_name).filter(Boolean))];
  const brands = [...new Set(leads.map(l => l.brand || l.brand_code).filter(Boolean))];

  const filtered = leads.filter(l => {
    if (viewMode === 'queue' && l.final_status !== 'Queued' && l.final_status !== 'Duplicate') return false;
    if (statusFilter !== 'all' && l.final_status !== statusFilter) return false;
    if (supplierFilter !== 'all' && l.supplier_name !== supplierFilter) return false;
    if (brandFilter !== 'all' && (l.brand || l.brand_code) !== brandFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (l.first_name || '').toLowerCase().includes(q)
        || (l.last_name || '').toLowerCase().includes(q)
        || (l.mobile || '').includes(q)
        || (l.email || '').toLowerCase().includes(q)
        || (l.supplier_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Pagination over the filtered set. Selection and bulk actions still span the full filtered set.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [search, statusFilter, supplierFilter, brandFilter, viewMode, pageSize]);

  // Keep selection within the current filtered view
  const filteredIds = useMemo(() => new Set(filtered.map(l => l.id)), [filtered]);
  const visibleSelectedIds = useMemo(
    () => new Set([...selectedIds].filter(id => filteredIds.has(id))),
    [selectedIds, filteredIds]
  );
  const selectedCount = visibleSelectedIds.size;
  const allVisibleSelected = filtered.length > 0 && visibleSelectedIds.size === filtered.length;
  const someVisibleSelected = visibleSelectedIds.size > 0 && !allVisibleSelected;

  const toggleAll = (checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        filtered.forEach(l => next.add(l.id));
      } else {
        filtered.forEach(l => next.delete(l.id));
      }
      return next;
    });
  };

  const toggleOne = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const exportCSV = (selectedKeys) => {
    const csv = buildLeadsCsv(filtered, selectedKeys);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'leads.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Re-submit: re-run pipeline for each selected lead using its stored raw payload,
  // then refresh. Mirrors the single-lead Resend flow.
  const handleBulkResubmit = async () => {
    const targets = filtered.filter(l => visibleSelectedIds.has(l.id));
    if (targets.length === 0) return;
    setResubmitting(true);
    setProgress({ done: 0, total: targets.length });
    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const lead = targets[i];
      try {
        const payload = JSON.parse(lead.raw_payload || '{}');
        const keys = await base44.entities.ApiKey.filter({ id: lead.supplier_key_id });
        const key = keys[0]?.key;
        if (!key) { failCount++; setProgress({ done: i + 1, total: targets.length }); continue; }
        await processLead({ ...payload, _supplier_key: key });
        okCount++;
      } catch {
        failCount++;
      }
      setProgress({ done: i + 1, total: targets.length });
    }
    setResubmitting(false);
    setProgress(null);
    qc.invalidateQueries({ queryKey: ['leads'] });
    if (failCount === 0) {
      toast.success(`Re-submitted ${okCount} lead${okCount === 1 ? '' : 's'}`);
    } else {
      toast.error(`Re-submitted ${okCount} ok, ${failCount} failed`);
    }
    clearSelection();
  };

  // Archive (default delete behavior) selected leads
  const handleBulkArchive = async () => {
    const ids = [...visibleSelectedIds];
    setArchiveConfirmOpen(false);
    for (const id of ids) {
      try { await base44.entities.Lead.update(id, { archived: true }); } catch {}
    }
    toast.success(`Archived ${ids.length} lead${ids.length === 1 ? '' : 's'}`);
    qc.invalidateQueries({ queryKey: ['leads'] });
    clearSelection();
  };

  const openLeadDetail = (lead, stage) => {
    const tab = stage === 'hlr' ? 'hlr' : stage === 'leadbyte' ? 'delivery' : 'summary';
    setInitialTab(tab);
    setSelectedLead(lead);
  };

  return (
    <div>
      <PageHeader title="Leads" subtitle={viewMode === 'queue' ? 'Queued and duplicate leads for manual handling' : 'All processed leads with full trace data'}>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button onClick={() => setViewMode('all')}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${viewMode === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              All Leads
            </button>
            <button onClick={() => setViewMode('queue')}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'queue' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Inbox className="w-3.5 h-3.5" />
              Queue
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, mobile, email, supplier..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <SearchableSelect
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-[140px] bg-card border-border"
          options={[
            { value: 'all', label: 'All Status' },
            { value: 'Sold', label: 'Sold' },
            { value: 'Unsold', label: 'Unsold' },
            { value: 'Queued', label: 'Queued' },
            { value: 'Duplicate', label: 'Duplicate' },
            { value: 'Error', label: 'Error' },
            { value: 'Processing', label: 'Processing' },
          ]}
        />
        <SearchableSelect
          value={supplierFilter}
          onValueChange={setSupplierFilter}
          className="w-[150px] bg-card border-border"
          options={[
            { value: 'all', label: 'All Suppliers' },
            ...suppliers.map(s => ({ value: s, label: s })),
          ]}
        />
        {brands.length > 0 && (
          <SearchableSelect
            value={brandFilter}
            onValueChange={setBrandFilter}
            className="w-[140px] bg-card border-border"
            options={[
              { value: 'all', label: 'All Brands' },
              ...brands.map(b => ({ value: b, label: b })),
            ]}
          />
        )}
        <div className="text-[12px] text-muted-foreground">{filtered.length} leads</div>
      </div>

      {/* Bulk action toolbar */}
      <BulkActionBar
        selectedCount={selectedCount}
        onResubmit={handleBulkResubmit}
        onDelete={() => setArchiveConfirmOpen(true)}
        onClear={clearSelection}
        resubmitting={resubmitting}
        progress={progress}
      />

      {/* Table */}
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 sticky top-0">
                <th className="w-[40px] px-4 py-3">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all leads"
                  />
                </th>
                {['Created', 'Supplier', 'Name', 'Mobile', 'HLR Status', 'LB Status', 'Final Status', 'Time'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No leads found</td></tr>
              )}
              {paged.map(lead => {
                const isSelected = visibleSelectedIds.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={`hover:bg-accent/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={v => toggleOne(lead.id, v)}
                        aria-label={`Select lead ${lead.id}`}
                      />
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap cursor-pointer"
                      onClick={() => { setInitialTab('summary'); setSelectedLead(lead); }}
                    >
                      {lead.created_date ? format(new Date(lead.created_date), 'MMM dd HH:mm') : ''}
                    </td>
                    <td className="px-4 py-3 text-secondary-foreground cursor-pointer" onClick={() => { setInitialTab('summary'); setSelectedLead(lead); }}>{lead.supplier_name}</td>
                    <td className="px-4 py-3 text-foreground cursor-pointer" onClick={() => { setInitialTab('summary'); setSelectedLead(lead); }}>{lead.first_name} {lead.last_name}</td>
                    <td className="px-4 py-3 font-mono text-[12px] cursor-pointer" onClick={() => { setInitialTab('summary'); setSelectedLead(lead); }}>{lead.mobile}</td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => { setInitialTab('summary'); setSelectedLead(lead); }}>{lead.hlr_status || '-'}</td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => { setInitialTab('delivery'); setSelectedLead(lead); }}>{lead.leadbyte_record_status || '-'}</td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => { setInitialTab('summary'); setSelectedLead(lead); }}>
                      <ErrorStatusPill
                        lead={lead}
                        errorLogEntry={errorLogByLeadId[lead.id]}
                        onOpenDetail={openLeadDetail}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] cursor-pointer" onClick={() => { setInitialTab('summary'); setSelectedLead(lead); }}>{lead.process_time_ms ? `${lead.process_time_ms}ms` : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination (client-side over the filtered set) */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="text-[12px] text-muted-foreground">
            Showing {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <SearchableSelect
              value={String(pageSize)}
              onValueChange={(v) => setPageSize(Number(v))}
              className="w-[120px] bg-card border-border"
              options={[{ value: '20', label: '20 / page' }, { value: '25', label: '25 / page' }, { value: '50', label: '50 / page' }, { value: '100', label: '100 / page' }, { value: '200', label: '200 / page' }]}
            />
            <Button variant="outline" size="sm" className="gap-1" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <span className="text-[12px] text-muted-foreground tabular-nums">Page {safePage} of {totalPages}</span>
            <Button variant="outline" size="sm" className="gap-1" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <LeadDetailModal
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        initialTab={initialTab}
      />

      <ExportColumnsDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        count={filtered.length}
        onExport={exportCSV}
      />

      {/* Bulk archive confirmation */}
      <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <DialogContent className="bg-popover border-border max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Archive {selectedCount} lead{selectedCount === 1 ? '' : 's'}?</DialogTitle>
            <DialogDescription>
              Selected leads will be archived and hidden from the list. This can be undone later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}