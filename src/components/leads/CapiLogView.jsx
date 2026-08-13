import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';

function parseLog(v) {
  try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Renders a lead's capi_log as per-event cards: event, connector, value sent,
// HTTP status, events_received, fbtrace_id, and the full Facebook response.
export default function CapiLogView({ capiLog }) {
  const entries = parseLog(capiLog);
  if (!entries.length) {
    return <div className="text-[12px] text-muted-foreground py-6 text-center">No CAPI events logged</div>;
  }
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">CAPI Event Log</div>
      {entries.map((e, i) => <CapiEntry key={i} e={e} />)}
    </div>
  );
}

function CapiEntry({ e }) {
  const [open, setOpen] = useState(false);
  const ok = e.success !== false && e.http_status != null && e.http_status < 300 && (e.events_received == null || e.events_received >= 1);
  const er = e.events_received;
  return (
    <div className="border border-border rounded-lg bg-background/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full p-2.5 text-left flex-wrap"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0" />}
        <Badge className="bg-primary/10 text-primary text-[9px]">{e.event_name || '-'}</Badge>
        <span className="text-[11px] text-muted-foreground">{e.connector || ''}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{e.pixel || ''}</span>
        <span className="ml-auto flex items-center gap-2">
          {e.value != null && e.value !== '' && (
            <span className="text-[10px] text-muted-foreground">value: <span className="text-primary font-mono">{String(e.value)}</span></span>
          )}
          {e.http_status != null && (
            <Badge className={e.http_status < 300 ? 'bg-status-sold status-sold text-[9px]' : 'bg-status-error status-error text-[9px]'}>{e.http_status}</Badge>
          )}
          {er != null && (
            <Badge className={er > 0 ? 'bg-status-sold status-sold text-[9px]' : 'bg-status-error status-error text-[9px]'}>events: {er}</Badge>
          )}
          {!ok && <span className="text-[10px] status-error">failed</span>}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {e.error && (
            <div className="bg-status-error rounded-md p-2 text-[11px] status-error">{e.error}</div>
          )}
          {e.fbtrace_id && (
            <div className="text-[10px] text-muted-foreground">fbtrace_id: <span className="font-mono text-foreground">{e.fbtrace_id}</span></div>
          )}
          {e.payload && (
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Outgoing Payload (sent to Facebook)</div>
              <pre className="bg-background border border-border rounded-md p-2 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(e.payload, null, 2)}</pre>
            </div>
          )}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Facebook Response</div>
            <pre className="bg-background border border-border rounded-md p-2 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
{e.fb_response ? JSON.stringify(e.fb_response, null, 2) : (e.fbtrace_id ? JSON.stringify({ events_received: e.events_received ?? null, messages: [], fbtrace_id: e.fbtrace_id }, null, 2) : '-')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}