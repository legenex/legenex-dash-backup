import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

function parseLog(v) {
  try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Global delivery log across all leads. Flattens each lead's delivery_log into rows.
export default function DeliveryLogsTab() {
  const [search, setSearch] = useState('');
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['delivery-logs'],
    queryFn: async () => {
      const all = await base44.entities.Lead.list('-updated_date', 200);
      return all.filter(l => parseLog(l.delivery_log).length > 0);
    },
  });

  const rows = leads.flatMap(l =>
    parseLog(l.delivery_log).map((e, i) => ({
      key: `${l.id}-${i}`,
      leadId: l.lead_id ?? l.id,
      supplier: l.supplier_name || '',
      connector: e.connector || '',
      trigger: e.trigger || '',
      http_status: e.http_status,
      success: e.success,
      error: e.error || '',
      timestamp: e.timestamp || l.created_date,
    }))
  ).filter(r => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <Input placeholder="Search delivery logs…" value={search} onChange={e => setSearch(e.target.value)} className="bg-background max-w-sm" />
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['Lead', 'Supplier', 'Delivery', 'Trigger', 'HTTP', 'Status', 'Error', 'Time'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No deliveries logged yet</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.key} className="hover:bg-accent/30">
                <td className="px-3 py-2 font-mono text-primary whitespace-nowrap">{r.leadId}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.supplier}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.connector}</td>
                <td className="px-3 py-2 whitespace-nowrap"><Badge className="bg-primary/10 text-primary text-[9px]">{r.trigger}</Badge></td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.http_status != null
                    ? <Badge className={r.http_status < 300 ? 'bg-status-sold status-sold text-[9px]' : 'bg-status-error status-error text-[9px]'}>{r.http_status}</Badge>
                    : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={r.success ? 'status-sold' : 'status-error'}>{r.success ? 'Delivered' : 'Failed'}</span>
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap max-w-[220px] truncate">{r.error || '-'}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.timestamp ? format(new Date(r.timestamp), 'MMM d HH:mm') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}