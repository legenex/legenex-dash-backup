import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import ErrorStatusPill from '@/components/leads/ErrorStatusPill';
import LeadDetailModal from '@/components/leads/LeadDetailModal';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Search } from 'lucide-react';
import { format } from 'date-fns';

const REJECTED_STATUSES = ['Unsold', 'Duplicate', 'Error'];

export default function LeadsRejections() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [initialTab, setInitialTab] = useState('summary');

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads-rejections'],
    queryFn: () => base44.entities.Lead.filter({ archived: false }, '-created_date', 500),
  });

  const { data: errorLogs = [] } = useQuery({
    queryKey: ['error-logs-recent'],
    queryFn: () => base44.entities.ErrorLog.list('-created_date', 200),
  });

  const errorLogByLeadId = useMemo(() => {
    const map = {};
    for (const e of errorLogs) {
      if (e.lead_id && !map[e.lead_id]) map[e.lead_id] = e;
    }
    return map;
  }, [errorLogs]);

  const suppliers = [...new Set(leads.map(l => l.supplier_name).filter(Boolean))];

  const filtered = leads.filter(l => {
    if (!REJECTED_STATUSES.includes(l.final_status)) return false;
    if (statusFilter !== 'all' && l.final_status !== statusFilter) return false;
    if (supplierFilter !== 'all' && l.supplier_name !== supplierFilter) return false;
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

  const openLeadDetail = (lead, stage) => {
    const tab = stage === 'hlr' ? 'hlr' : stage === 'leadbyte' ? 'delivery' : 'summary';
    setInitialTab(tab);
    setSelectedLead(lead);
  };

  return (
    <div>
      <PageHeader title="Rejections" subtitle="Rejected leads - Unsold, Duplicate, and Error dispositions" />

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
            { value: 'all', label: 'All Rejections' },
            { value: 'Unsold', label: 'Unsold' },
            { value: 'Duplicate', label: 'Duplicate' },
            { value: 'Error', label: 'Error' },
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
        <div className="text-[12px] text-muted-foreground">{filtered.length} leads</div>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 sticky top-0">
                <th className="w-[40px] px-4 py-3" />
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
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No rejected leads</td></tr>
              )}
              {filtered.map(lead => (
                <tr
                  key={lead.id}
                  className="hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => { setInitialTab('summary'); setSelectedLead(lead); }}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()} />
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {lead.created_date ? format(new Date(lead.created_date), 'MMM dd HH:mm') : ''}
                  </td>
                  <td className="px-4 py-3 text-secondary-foreground">{lead.supplier_name}</td>
                  <td className="px-4 py-3 text-foreground">{lead.first_name} {lead.last_name}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{lead.mobile}</td>
                  <td className="px-4 py-3">{lead.hlr_status || '-'}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <span onClick={() => { setInitialTab('delivery'); setSelectedLead(lead); }}>{lead.leadbyte_record_status || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <ErrorStatusPill
                      lead={lead}
                      errorLogEntry={errorLogByLeadId[lead.id]}
                      onOpenDetail={openLeadDetail}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">{lead.process_time_ms ? `${lead.process_time_ms}ms` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <LeadDetailModal
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        initialTab={initialTab}
      />
    </div>
  );
}