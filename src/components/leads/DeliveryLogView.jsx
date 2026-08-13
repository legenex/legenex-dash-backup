import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import JsonViewer from '@/components/shared/JsonViewer';

function isEmpty(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '' || s.toLowerCase() === 'null';
}

function parseList(v) {
  try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}

// A single expandable delivery/webhook item showing its request and response.
function DeliveryItem({ name, trigger, ok, httpStatus, error, payload, response }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !isEmpty(payload) || !isEmpty(response);
  return (
    <div className="border border-border rounded-lg bg-background/40 overflow-hidden">
      <button
        type="button"
        onClick={() => hasDetail && setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${hasDetail ? 'hover:bg-accent/40' : 'cursor-default'}`}
      >
        {hasDetail ? (
          open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : <span className="w-3.5 shrink-0" />}
        <span className="text-[12px] text-foreground font-medium truncate">{name}</span>
        {trigger && <span className="text-[10px] text-muted-foreground">({trigger})</span>}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <Badge className={ok ? 'bg-status-sold status-sold text-[9px]' : 'bg-status-error status-error text-[9px]'}>
            {ok ? 'Sent' : 'Failed'}
          </Badge>
          {httpStatus != null && (
            <span className="text-[10px] text-muted-foreground font-mono">HTTP {httpStatus}</span>
          )}
        </span>
      </button>
      {!ok && error && <div className="px-3 pb-2 text-[10px] status-error">{error}</div>}
      {open && hasDetail && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
          {!isEmpty(payload) && <JsonViewer data={payload} title="Request" />}
          {!isEmpty(response) && <JsonViewer data={response} title="Response" />}
        </div>
      )}
    </div>
  );
}

// Renders the full delivery log for a lead: the LeadByte forward (its request +
// response), plus every delivery destination / webhook fired, each as an
// expandable item that reveals the actual request and response bodies.
export default function DeliveryLogView({ lead }) {
  const deliveries = parseList(lead.delivery_log);
  const hasLeadByte = !isEmpty(lead.leadbyte_request) || !isEmpty(lead.leadbyte_response);

  if (!hasLeadByte && deliveries.length === 0) {
    return <div className="text-[12px] text-muted-foreground py-2">No deliveries fired for this lead.</div>;
  }

  const lbOk = (() => {
    try {
      const r = JSON.parse(lead.leadbyte_response || '{}');
      return r.status === 'Success' || String(lead.leadbyte_record_status || '').toLowerCase() === 'approved';
    } catch { return false; }
  })();

  return (
    <div className="space-y-2">
      {hasLeadByte && (
        <DeliveryItem
          name="LeadByte"
          trigger="standard"
          ok={lbOk}
          httpStatus={null}
          payload={lead.leadbyte_request}
          response={lead.leadbyte_response}
        />
      )}
      {deliveries.map((d, i) => (
        <DeliveryItem
          key={i}
          name={d.connector || 'Delivery'}
          trigger={d.trigger}
          ok={!!d.success}
          httpStatus={d.http_status}
          error={d.error}
          payload={d.payload}
          response={d.response}
        />
      ))}
    </div>
  );
}