import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { money, statusBucket } from '@/lib/supplierPortalMetrics';
import { downloadCsv } from '@/lib/csv';

const BUCKET_LABEL = {
  accepted: 'Accepted',
  duplicate: 'Duplicate',
  dq: 'DQ',
  rejected: 'Rejected',
  error: 'Error',
  other: 'Other',
};

const BUCKET_CLASS = {
  accepted: 'status-sold bg-status-sold',
  duplicate: 'status-duplicate bg-status-duplicate',
  dq: 'status-disqualified bg-status-disqualified',
  rejected: 'status-rejected bg-status-rejected',
  error: 'status-error bg-status-error',
  other: 'tag-neutral',
};

export default function SupplierPortalLeads() {
  const { data } = useOutletContext();
  const leads = data?.leads || [];
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => leads.filter(l => {
    const bucket = statusBucket(l.final_status);
    if (statusFilter !== 'all' && bucket !== statusFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase().includes(s)
      || String(l.mobile || '').includes(s)
      || String(l.email || '').toLowerCase().includes(s)
      || String(l.lead_id || '').includes(s);
  }), [leads, q, statusFilter]);

  const handleExport = () => {
    downloadCsv('my-leads', [
      { label: 'Lead ID', value: l => l.lead_id },
      { label: 'First Name', value: l => l.first_name },
      { label: 'Last Name', value: l => l.last_name },
      { label: 'Mobile', value: l => l.mobile },
      { label: 'Email', value: l => l.email },
      { label: 'Status', value: l => BUCKET_LABEL[statusBucket(l.final_status)] },
      { label: 'Revenue', value: l => Number(l.revenue || 0).toFixed(2) },
      { label: 'Sent', value: l => l.created_date ? format(new Date(l.created_date), 'yyyy-MM-dd HH:mm') : '' },
    ], filtered);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">My Leads</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Everything you sent us and what happened to it, spot delivery gaps at a glance.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, email, ID…" className="w-56 bg-background text-[13px]" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px] text-[13px] bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="duplicate">Duplicate</SelectItem>
              <SelectItem value="dq">DQ</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-x-auto">
        <table className="w-full text-[13px] min-w-[760px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Lead ID', 'Name', 'Contact', 'Status', 'Revenue', 'Sent'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No leads match.</td></tr>
            )}
            {filtered.map(l => {
              const bucket = statusBucket(l.final_status);
              return (
                <tr key={l.id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-[12px]">{l.lead_id || '-'}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{[l.first_name, l.last_name].filter(Boolean).join(' ') || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{l.mobile || '-'}</div>
                    <div className="text-[11px]">{l.email || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`text-[10px] ${BUCKET_CLASS[bucket]}`}>{BUCKET_LABEL[bucket]}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]">{money(l.revenue)}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{l.created_date ? format(new Date(l.created_date), 'MMM dd, yyyy') : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}