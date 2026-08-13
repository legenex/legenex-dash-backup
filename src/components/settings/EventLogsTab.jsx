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

// Global CAPI event log across all leads. Flattens each lead's capi_log into rows.
export default function EventLogsTab() {
  const [search, setSearch] = useState('');
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['capi-event-logs'],
    queryFn: async () => {
      const all = await base44.entities.Lead.list('-updated_date', 200);
      return all.filter(l => parseLog(l.capi_log).length > 0);
    },
  });

  const rows = leads.flatMap(l =>
    parseLog(l.capi_log).map((e, i) => ({
      key: `${l.id}-${i}`,
      leadId: l.lead_id ?? l.id,
      supplier: l.supplier_name || '',
      connector: e.connector || '',
      event_name: e.event_name || '',
      pixel: e.pixel || '',
      value: e.value ?? '',
      http_status: e.http_status,
      events_received: e.events_received,
      fbtrace_id: e.fbtrace_id || '',
      created: l.created_date,
    }))
  ).filter(r => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <Input placeholder="Search event logs…" value={search} onChange={e => setSearch(e.target.value)} className="bg-background max-w-sm" />
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['Lead', 'Supplier', 'Connector', 'Event', 'Pixel', 'Value', 'HTTP', 'Events', 'fbtrace_id', 'Date'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">No CAPI events logged yet</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.key} className="hover:bg-accent/30">
                <td className="px-3 py-2 font-mono text-primary whitespace-nowrap">{r.leadId}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.supplier}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.connector}</td>
                <td className="px-3 py-2 whitespace-nowrap"><Badge className="bg-primary/10 text-primary text-[9px]">{r.event_name}</Badge></td>
                <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{r.pixel}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-foreground whitespace-nowrap">{r.value || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.http_status != null
                    ? <Badge className={r.http_status < 300 ? 'bg-status-sold status-sold text-[9px]' : 'bg-status-error status-error text-[9px]'}>{r.http_status}</Badge>
                    : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.events_received != null
                    ? <Badge className={r.events_received > 0 ? 'bg-status-sold status-sold text-[9px]' : 'bg-status-error status-error text-[9px]'}>{r.events_received}</Badge>
                    : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{r.fbtrace_id || '-'}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.created ? format(new Date(r.created), 'MMM d HH:mm') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}