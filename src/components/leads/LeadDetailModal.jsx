import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import StatusPill from '@/components/shared/StatusPill';
import JsonViewer from '@/components/shared/JsonViewer';
import CapiLogView from '@/components/leads/CapiLogView';
import DeliveryStatusList from '@/components/leads/DeliveryStatusList';
import DeliveryLogView from '@/components/leads/DeliveryLogView';
import LeadEditForm from '@/components/leads/LeadEditForm';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, RotateCcw, Trash2, Archive, Pencil, Settings2, ChevronUp, ChevronDown } from 'lucide-react';
import { formatLeadTime } from '@/lib/leadTime';
import { formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';
import { leadEventInstant } from '@/lib/reportMetrics';
import { processLead } from '@/functions/processLead';
import { invalidateLeadCaches } from '@/lib/leadCaches';

// ---- Lead Details field registry ---------------------------------------------
// The Summary tab renders these in a 2-column grid. Default order is Nick's
// canonical layout; the operator can re-arrange it from inside the popup and
// the order persists per browser. Unknown keys from future additions append at
// the end in registry order.
const DETAIL_ORDER_KEY = 'legenex_lead_detail_order_v1';

const ci = (mapped, key) => {
  const lower = String(key).toLowerCase();
  for (const [k, v] of Object.entries(mapped)) {
    if (k.toLowerCase() === lower && v != null && String(v).trim() !== '') return v;
  }
  return null;
};

const DETAIL_FIELDS = [
  { key: 'timestamp', label: 'Timestamp', value: (lead) => {
    const inst = leadEventInstant(lead);
    if (!inst || Number.isNaN(inst.getTime())) return null;
    return formatInTimeZone(inst, APP_TZ, 'MMM d, yyyy HH:mm');
  } },
  { key: 'last_updated', label: 'Last Updated', value: (lead, m) => {
    const raw = lead.leadbyte_outcome_at || ci(m, 'last_outcome_at') || lead.updated_date;
    if (!raw) return null;
    const s = String(raw);
    const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`);
    if (Number.isNaN(d.getTime())) return null;
    return formatInTimeZone(d, APP_TZ, 'MMM d, yyyy HH:mm');
  } },
  { key: 'lead_status', label: 'Lead Status', value: (lead, m) => lead.final_status || ci(m, 'lead_status') },
  { key: 'name', label: 'Name', value: (lead) => `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || null },
  { key: 'email', label: 'Email', value: (lead) => lead.email },
  { key: 'mobile', label: 'Mobile', value: (lead) => lead.mobile },
  { key: 'zip', label: 'Zip', value: (lead, m) => ci(m, 'zip') || ci(m, 'geoip_zip') },
  { key: 'state', label: 'State', value: (lead, m) => ci(m, 'accident_state') || ci(m, 'geoip_state') || ci(m, 'state') },
  { key: 'vertical', label: 'Vertical', value: (lead, m) => lead.lead_vertical || ci(m, 'vertical') },
  { key: 'ip_address', label: 'Ip Address', value: (lead, m) => ci(m, 'ip_address') },
  { key: 'lead_type', label: 'Lead Type', value: (lead, m) => ci(m, 'lead_type') },
  // Column first, then the bag. The bag holds what the supplier last reported and
  // goes stale on a resale, which showed Lead Status Sold under a Returned pill.
  { key: 'revenue', label: 'Revenue', value: (lead) => `$${Number(lead.revenue || 0).toFixed(2)}` },
  { key: 'buyer', label: 'Buyer', value: (lead, m) => lead.buyer_name || ci(m, 'buyer_name') || ci(m, 'buyer') },
  { key: 'buyer_id', label: 'Buyer ID', value: (lead, m) => lead.buyer_id || ci(m, 'buyer_id') },
  { key: 'buyer_feedback', label: 'Buyer Feedback', value: (lead, m) => lead.buyer_feedback || ci(m, 'buyer_feedback') },
  { key: 'returned', label: 'Returned', value: (lead, m) => (lead.buyer_returned === true ? 'Yes' : ci(m, 'returned') || 'No') },
  { key: 'returned_reason', label: 'Returned Reason', value: (lead, m) => lead.buyer_return_reason || ci(m, 'returned_reason') || ci(m, 'return_reason') },
  { key: 'supplier', label: 'Supplier', value: (lead) => lead.supplier_name },
  { key: 'supplier_subid', label: 'Supplier SubID', value: (lead, m) => ci(m, 'ssid') },
  { key: 'supplier_source', label: 'Supplier Source', value: (lead, m) => ci(m, 'Supplier Source') || ci(m, 'source') || ci(m, 'utm_source') },
  { key: 'supplier_brand', label: 'Supplier Brand', value: (lead, m) => ci(m, 'supplier_brand') },
  { key: 'optin_url', label: 'Optin URL', value: (lead, m) => ci(m, 'optin_url') },
  { key: 'trustedform_url', label: 'TrustedForm URL', value: (lead, m, extra) => ci(m, 'trustedform_url') || extra.reportedTrustedFormUrl },
];

// Mapped keys already surfaced in Lead Details above (case-insensitive). These
// must never reappear under Lead Data, which shows only the leftover raw
// fields. Includes the base identity keys (rendered from top-level columns)
// and every mapped key any Lead Details field reads.
const CONSUMED_MAPPED_KEYS = new Set([
  // identity shown at the top from top-level lead columns
  'first_name', 'last_name', 'name', 'email', 'mobile',
  // everything a DETAIL_FIELDS entry pulls from mapped_fields
  'timestamp', 'vertical', 'zip', 'geoip_zip', 'accident_state', 'geoip_state',
  'state', 'ip_address', 'lead_type', 'lead_status', 'buyer', 'buyer_name',
  'buyer_id', 'buyer_feedback', 'returned', 'returned_reason', 'return_reason',
  'returnreason', 'last_outcome_at', 'last_outcome_status', 'ssid',
  'supplier source', 'source', 'utm_source', 'supplier_brand', 'optin_url',
  'trustedform_url', 'revenue',
]);

const loadDetailOrder = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(DETAIL_ORDER_KEY) || 'null');
    if (!Array.isArray(raw)) return DETAIL_FIELDS.map(f => f.key);
    const known = new Set(DETAIL_FIELDS.map(f => f.key));
    const ordered = raw.filter(k => known.has(k));
    DETAIL_FIELDS.forEach(f => { if (!ordered.includes(f.key)) ordered.push(f.key); });
    return ordered;
  } catch { return DETAIL_FIELDS.map(f => f.key); }
};

export default function LeadDetailModal({ lead, open, onClose, initialTab = 'summary' }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [resending, setResending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [arranging, setArranging] = useState(false);
  const [detailOrder, setDetailOrder] = useState(loadDetailOrder);

  // Sync active tab when a new lead or initial tab is requested
  useEffect(() => {
    if (open) { setActiveTab(initialTab); setArranging(false); }
  }, [open, initialTab]);

  if (!lead) return null;

  let lbResp = {};
  try { lbResp = JSON.parse(lead.leadbyte_response || '{}'); } catch {}

  // Imported custom fields live in mapped_fields as a JSON string.
  let mappedFields = {};
  try { mappedFields = JSON.parse(lead.mapped_fields || '{}') || {}; } catch {}

  // The reported TrustedForm cert URL is stored only inside the outcome
  // payload. Parse it defensively for read-only display.
  let outcomePayload = {};
  try { outcomePayload = JSON.parse(lead.leadbyte_outcome_payload || '{}') || {}; } catch {}
  const reportedTrustedFormUrl = outcomePayload.contact_trustedform_url;
  const toTitleCase = (k) => String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const fmtCurrency = (v) => (typeof v === 'number' ? `$${v.toFixed(2)}` : v);

  const fieldByKey = Object.fromEntries(DETAIL_FIELDS.map(f => [f.key, f]));
  const orderedDetails = detailOrder.map(k => fieldByKey[k]).filter(Boolean);

  const persistOrder = (next) => {
    setDetailOrder(next);
    try { localStorage.setItem(DETAIL_ORDER_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };
  const moveField = (key, dir) => {
    const idx = detailOrder.indexOf(key);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= detailOrder.length) return;
    const next = [...detailOrder];
    [next[idx], next[to]] = [next[to], next[idx]];
    persistOrder(next);
  };
  const resetOrder = () => {
    try { localStorage.removeItem(DETAIL_ORDER_KEY); } catch { /* private mode */ }
    setDetailOrder(DETAIL_FIELDS.map(f => f.key));
  };

  // Remaining mapped fields for the Lead Data section.
  const leadDataEntries = Object.entries(mappedFields)
    .filter(([k, v]) => v != null && String(v).trim() !== '' && !CONSUMED_MAPPED_KEYS.has(String(k).toLowerCase()));

  // Outcome values without a home in Lead Details, appended to Lead Data.
  const outcomeReceived = lead.leadbyte_outcome_at
    ? formatLeadTime(lead.leadbyte_outcome_at, 'MMM d, yyyy HH:mm')
    : null;
  const extraEntries = [
    ['Supplier Payout', fmtCurrency(lead.supplier_payout)],
    ['Tier', lead.lead_tier],
    ['Lead Score', lead.lead_score],
    ['Conversion', lead.buyer_conversion],
    ['Outcome Received', outcomeReceived],
    ['TrustedForm Valid', lead.trustedform_valid === true ? 'Yes' : lead.trustedform_valid === false ? 'No' : null],
    ['Queue Reason', lead.queue_reason],
  ].filter(([, v]) => v != null && String(v).trim() !== '');

  // System Response header fields, in the exact required order.
  const systemResponseEntries = [
    ['Response Code', lbResp.code !== undefined ? lbResp.code : '-'],
    ['Response Message', lbResp.message || '-'],
    ['Response Errors', Array.isArray(lbResp.errors) && lbResp.errors.length ? lbResp.errors.join('; ') : (lbResp.errors || '-')],
    ['Process Time', lead.process_time_ms ? `${lead.process_time_ms}ms` : '-'],
    ['HLR Status', lead.hlr_status || '-'],
    ['HLR Score', lead.hlr_summary_score ?? '-'],
  ];

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(lead.raw_payload || '{}');
    toast.success('Payload copied');
  };

  const handleCopyResponse = () => {
    navigator.clipboard.writeText(lead.leadbyte_response || '{}');
    toast.success('Response copied');
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const payload = JSON.parse(lead.raw_payload || '{}');
      // Find the API key for this lead
      const keys = await base44.entities.ApiKey.filter({ id: lead.supplier_key_id });
      const key = keys[0]?.key;
      if (!key) { toast.error('Supplier key not found'); return; }
      const resp = await processLead({ ...payload, _supplier_key: key });
      toast.success(`Resend result: ${resp.data?.Response || 'Unknown'}`);
      invalidateLeadCaches(qc);
    } catch (err) {
      toast.error('Resend failed');
    } finally {
      setResending(false);
    }
  };

  const handleArchive = async () => {
    await base44.entities.Lead.update(lead.id, { archived: true });
    toast.success('Lead archived');
    invalidateLeadCaches(qc);
    onClose();
  };

  const handleHardDelete = async () => {
    if (deleteConfirm !== 'DELETE') return;
    await base44.entities.Lead.delete(lead.id);
    toast.success('Lead permanently deleted');
    invalidateLeadCaches(qc);
    onClose();
  };

  const startEdit = () => setEditing(true);

  const FieldCell = ({ label, value, breakAll = true }) => (
    <div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-[13px] text-foreground font-medium mt-0.5 font-mono ${breakAll ? 'break-all' : ''}`}>{value == null || String(value).trim() === '' ? '-' : String(value)}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* Fixed-size shell: the modal never grows or shrinks between tabs; each
          tab scrolls inside the content region instead. */}
      <DialogContent className="max-w-[760px] w-[calc(100vw-2rem)] h-[85vh] bg-popover border-border flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="font-mono text-[14px] text-foreground">{lead.id}</DialogTitle>
            <StatusPill status={lead.final_status} size="lg" />
            <span className="ml-auto text-[13px]">
              <span className="text-muted-foreground">Revenue: </span>
              <span className="font-mono font-semibold status-sold">${Number(lead.revenue || 0).toFixed(2)}</span>
            </span>
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">
            {lead.supplier_name} - {lead.created_date ? formatLeadTime(lead.created_date, 'MMM d, yyyy HH:mm') : ''}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4 flex-1 min-h-0 flex flex-col">
          <TabsList className="bg-muted shrink-0 self-start">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="raw">System Response</TabsTrigger>
            <TabsTrigger value="hlr">HLR Trace</TabsTrigger>
            <TabsTrigger value="capi">CAPI Log</TabsTrigger>
            <TabsTrigger value="delivery">Delivery Log</TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden mt-4 pr-1">
            <TabsContent value="summary" className="space-y-4 mt-0">
              {editing ? (
                <LeadEditForm
                  lead={lead}
                  onSaved={() => { setEditing(false); onClose(); }}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Lead Details</div>
                      <div className="flex items-center gap-2">
                        {arranging && (
                          <button onClick={resetOrder} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Reset order</button>
                        )}
                        <button
                          onClick={() => setArranging(a => !a)}
                          className={`inline-flex items-center gap-1 text-[11px] rounded-md px-2 py-1 transition-colors ${arranging ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                          title="Re-arrange the Lead Details fields"
                        >
                          <Settings2 className="w-3 h-3" /> {arranging ? 'Done' : 'Arrange'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {orderedDetails.map((f) => (
                        <div key={f.key} className={arranging ? 'flex items-start gap-1.5 rounded-md border border-border bg-card p-2' : ''}>
                          {arranging && (
                            <div className="flex flex-col shrink-0">
                              <button onClick={() => moveField(f.key, -1)} className="text-muted-foreground hover:text-foreground" aria-label={`Move ${f.label} up`}><ChevronUp className="w-3.5 h-3.5" /></button>
                              <button onClick={() => moveField(f.key, 1)} className="text-muted-foreground hover:text-foreground" aria-label={`Move ${f.label} down`}><ChevronDown className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                          <FieldCell label={f.label} value={f.value(lead, mappedFields, { reportedTrustedFormUrl })} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {(leadDataEntries.length > 0 || extraEntries.length > 0) && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3">Lead Data</div>
                      <div className="grid grid-cols-2 gap-3">
                        {leadDataEntries.map(([key, val]) => (
                          <FieldCell key={key} label={toTitleCase(key)} value={val} />
                        ))}
                        {extraEntries.map(([label, val]) => (
                          <FieldCell key={label} label={label} value={val} />
                        ))}
                      </div>
                      {reportedTrustedFormUrl != null && String(reportedTrustedFormUrl).trim() !== '' && (
                        <div className="text-[12px] text-muted-foreground mt-2">TrustedForm URL reported by LeadByte. Not a captured certificate.</div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-border">
                    <DeliveryStatusList lead={lead} />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="raw" className="mt-0 space-y-4">
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3">System Response</div>
                <div className="grid grid-cols-2 gap-3">
                  {systemResponseEntries.map(([label, val]) => (
                    <FieldCell key={label} label={label} value={val} />
                  ))}
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <JsonViewer data={lead.raw_payload} title="Inbound Payload" />
              </div>
            </TabsContent>

            <TabsContent value="hlr" className="mt-0 space-y-4">
              <JsonViewer data={lead.hlr_request} title="HLR Request" />
              <JsonViewer data={lead.hlr_response} title="HLR Response" />
              {lead.hlr_error && (
                <div className="bg-status-error rounded-lg p-3 text-[12px] status-error">{lead.hlr_error}</div>
              )}
            </TabsContent>

            <TabsContent value="capi" className="mt-0">
              <CapiLogView capiLog={lead.capi_log} />
            </TabsContent>

            <TabsContent value="delivery" className="mt-0">
              <DeliveryLogView lead={lead} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-2 mt-4 pt-4 border-t border-border flex-wrap">
          <Button variant="ghost" size="sm" onClick={startEdit} className="gap-1.5 text-primary">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={handleResend} disabled={resending} className="gap-1.5 text-primary">
            <RotateCcw className="w-3.5 h-3.5" /> {resending ? 'Resending...' : 'Resend'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyPayload} className="gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy Payload
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyResponse} className="gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy Response
          </Button>
          <Button variant="ghost" size="sm" onClick={handleArchive} className="gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Archive
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive ml-auto">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-popover border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete this lead?</AlertDialogTitle>
                <AlertDialogDescription>Type DELETE to confirm. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="Type DELETE" className="bg-background" />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleHardDelete} disabled={deleteConfirm !== 'DELETE'} className="bg-destructive text-destructive-foreground">
                  Delete Forever
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}
