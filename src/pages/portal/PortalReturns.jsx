import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const STATUS_CLASS = {
  requested: 'status-queued bg-status-queued',
  approved: 'status-sold bg-status-sold',
  rejected: 'status-rejected bg-status-rejected',
};

export default function PortalReturns() {
  const { data } = useOutletContext();
  const returns = data?.returns || [];
  const leadsById = Object.fromEntries((data?.leads || []).map(l => [l.id, l]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Returns</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Your return requests and their status.</p>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-x-auto">
        <table className="w-full text-[13px] min-w-[720px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Lead', 'Reason', 'Status', 'Requested', 'Resolved', 'Resolver Notes'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {returns.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No return requests yet.</td></tr>
            )}
            {returns.map(r => {
              const lead = leadsById[r.lead_id];
              return (
                <tr key={r.id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '-' : '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[260px]">{r.reason || '-'}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className={`text-[10px] capitalize ${STATUS_CLASS[r.status] || ''}`}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{r.requested_date ? format(new Date(r.requested_date), 'MMM dd, yyyy') : '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{r.resolved_date ? format(new Date(r.resolved_date), 'MMM dd, yyyy') : '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[220px]">{r.resolver_notes || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}