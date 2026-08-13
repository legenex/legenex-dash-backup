import React from 'react';
import { Badge } from '@/components/ui/badge';

function parseList(v) {
  try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Parses the inbound payload to surface the supplier attribution tokens
// (sid / ssid / supplier key) so the operator can see who/what qualified.
function getSupplierTokens(lead) {
  let raw = {};
  try { raw = JSON.parse(lead.raw_payload || '{}'); } catch {}
  const sid = raw.sid || raw.supplier_sid || '';
  const ssid = raw.ssid || '';
  const supplierKey = raw._supplier_key || raw['X-API-KEY'] || '';
  return { sid, ssid, supplierKey };
}

function StatusLine({ label, sublabel, ok, httpStatus, error }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0 flex-wrap">
      <span className="text-[12px] text-foreground font-medium">{label}</span>
      {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      <span className="ml-auto flex items-center gap-1.5">
        <Badge className={ok ? 'bg-status-sold status-sold text-[9px]' : 'bg-status-error status-error text-[9px]'}>
          {ok ? 'Sent' : 'Failed'}
        </Badge>
        {httpStatus != null && (
          <span className="text-[10px] text-muted-foreground font-mono">HTTP {httpStatus}</span>
        )}
      </span>
      {!ok && error && <div className="w-full text-[10px] status-error">{error}</div>}
    </div>
  );
}

// Renders a compact list of delivery + CAPI event statuses for a lead,
// including the supplier attribution tokens (supplier, sid, ssid, key).
export default function DeliveryStatusList({ lead }) {
  const deliveries = parseList(lead.delivery_log);
  const capi = parseList(lead.capi_log);
  const { sid, ssid, supplierKey } = getSupplierTokens(lead);

  if (!deliveries.length && !capi.length) {
    return <div className="text-[12px] text-muted-foreground py-2">No deliveries fired for this lead.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span><span className="text-muted-foreground">Supplier: </span><span className="text-foreground font-medium">{lead.supplier_name || '-'}</span></span>
        {sid && <span><span className="text-muted-foreground">SID: </span><span className="text-foreground font-mono">{sid}</span></span>}
        {ssid && <span><span className="text-muted-foreground">SSID: </span><span className="text-foreground font-mono">{ssid}</span></span>}
        {supplierKey && <span><span className="text-muted-foreground">Key: </span><span className="text-foreground font-mono">{supplierKey}</span></span>}
      </div>

      {deliveries.length > 0 && (
        <div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Deliveries</div>
          <div className="border border-border rounded-lg px-3 bg-background/40">
            {deliveries.map((d, i) => (
              <StatusLine
                key={i}
                label={d.connector || '-'}
                sublabel={d.trigger ? `(${d.trigger})` : ''}
                ok={!!d.success}
                httpStatus={d.http_status}
                error={d.error}
              />
            ))}
          </div>
        </div>
      )}

      {capi.length > 0 && (
        <div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Conversion Events</div>
          <div className="border border-border rounded-lg px-3 bg-background/40">
            {capi.map((e, i) => (
              <StatusLine
                key={i}
                label={e.connector || '-'}
                sublabel={e.event_name ? `(${e.event_name})` : ''}
                ok={e.success !== false && e.http_status != null && e.http_status < 300 && (e.events_received == null || e.events_received >= 1)}
                httpStatus={e.http_status}
                error={e.error}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}