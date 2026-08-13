// Column catalog for the All Leads CSV export.
// Each column: { key, label, default, get(lead) => value }.
// mapped_fields values are resolved through the shared leadField helper so the
// export matches exactly what the dashboard and lead detail modal show.

import { formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';
import { leadField, leadEventInstant, leadCost } from '@/lib/reportMetrics';

const f = (lead, key) => {
  const v = leadField(lead, key);
  return v == null ? '' : v;
};

// The lead's real EVENT time in APP_TZ, formatted like the dashboard. Never the
// raw Base44 created_date.
const eventTime = (lead) => {
  const d = leadEventInstant(lead);
  if (!d || isNaN(d.getTime())) return '';
  return formatInTimeZone(d, APP_TZ, 'yyyy-MM-dd HH:mm:ss');
};

export const LEAD_EXPORT_COLUMNS = [
  { key: 'timestamp', label: 'Timestamp', default: true, get: eventTime },
  { key: 'imported', label: 'Imported', get: (l) => l.created_date || '' },
  { key: 'id', label: 'ID', get: (l) => l.id || '' },
  { key: 'supplier', label: 'Supplier', default: true, get: (l) => l.supplier_name || '' },
  { key: 'full_name', label: 'Full Name', default: true, get: (l) => `${l.first_name || ''} ${l.last_name || ''}`.trim() },
  { key: 'mobile', label: 'Mobile', default: true, get: (l) => l.mobile || '' },
  { key: 'email', label: 'Email', default: true, get: (l) => l.email || '' },
  { key: 'vertical', label: 'Vertical', default: true, get: (l) => f(l, 'vertical') },
  { key: 'status', label: 'Status', default: true, get: (l) => l.final_status || '' },
  { key: 'revenue', label: 'Revenue', default: true, get: (l) => l.revenue ?? '' },
  { key: 'cost', label: 'Cost', get: (l) => { const c = leadCost(l); return c ? c : ''; } },
  { key: 'cpl', label: 'CPL', get: (l) => f(l, 'cpl') },
  { key: 'profit', label: 'Profit', get: (l) => f(l, 'profit') },
  { key: 'net_profit', label: 'Net Profit', get: (l) => f(l, 'net_profit') },
  { key: 'supplier_source', label: 'Supplier Source', get: (l) => f(l, 'Supplier Source') },
  { key: 'supplier_brand', label: 'Supplier Brand', get: (l) => f(l, 'supplier_brand') },
  { key: 'ssid', label: 'SSID', get: (l) => f(l, 'ssid') },
  // Prefer the buyer's NAME from the mapped_fields bag over the code. The
  // top-level column is null, so this used to export "LFWC5" rather than the
  // company it stands for.
  { key: 'buyer', label: 'Buyer', default: true, get: (l) => l.buyer_name || f(l, 'buyer') || f(l, 'buyer_id') },
  { key: 'buyer_feedback', label: 'Buyer Feedback', get: (l) => l.buyer_feedback || '' },
  { key: 'phone_verified', label: 'Verification', default: true, get: (l) => f(l, 'phone_verified') },
  { key: 'hlr_status', label: 'HLR Status', get: (l) => l.hlr_status || '' },
  { key: 'hlr_score', label: 'HLR Score', get: (l) => l.hlr_score ?? f(l, 'hlr_score') },
  { key: 'leadbyte_record_status', label: 'LeadByte Status', get: (l) => l.leadbyte_record_status || '' },
  { key: 'leadbyte_lead_id', label: 'LeadByte Lead ID', get: (l) => l.leadbyte_lead_id ?? '' },
  { key: 'response_code', label: 'Response Code', get: (l) => l.response_code ?? f(l, 'response_code') },
  { key: 'response_message', label: 'Response Message', get: (l) => l.response_message ?? f(l, 'response_message') },
  { key: 'queue_reason', label: 'Queue Reason', get: (l) => l.queue_reason || '' },
  { key: 'trustedform_valid', label: 'TrustedForm Valid', get: (l) => (l.trustedform_valid == null ? '' : l.trustedform_valid) },
  { key: 'trustedform_url', label: 'TrustedForm URL', get: (l) => f(l, 'trustedform_url') },
  { key: 'jornaya_token', label: 'Jornaya Token', get: (l) => f(l, 'jornaya_token') },
  { key: 'optin_url', label: 'Optin URL', get: (l) => f(l, 'optin_url') },
  { key: 'ip_address', label: 'IP Address', get: (l) => f(l, 'ip_address') },
  { key: 'geoip_country', label: 'GeoIP Country', get: (l) => f(l, 'geoip_country') },
  { key: 'geoip_state', label: 'GeoIP State', get: (l) => f(l, 'geoip_state') },
  { key: 'geoip_city', label: 'GeoIP City', get: (l) => f(l, 'geoip_city') },
  { key: 'geoip_zip', label: 'GeoIP Zip', get: (l) => f(l, 'geoip_zip') },
  { key: 'zip', label: 'Zip', get: (l) => f(l, 'zip') },
  { key: 'utm_source', label: 'UTM Source', get: (l) => f(l, 'utm_source') },
  { key: 'utm_campaign', label: 'UTM Campaign', get: (l) => f(l, 'utm_campaign') },
  { key: 'utm_medium', label: 'UTM Medium', get: (l) => f(l, 'utm_medium') },
  { key: 'utm_content', label: 'UTM Content', get: (l) => f(l, 'utm_content') },
  { key: 'utm_terms', label: 'UTM Terms', get: (l) => f(l, 'utm_terms') },
  { key: 'ad_label', label: 'Ad Label', get: (l) => f(l, 'ad_label') },
  { key: 'accident_state', label: 'Accident State', default: true, get: (l) => f(l, 'accident_state') },
  { key: 'accident_type', label: 'Accident Type', get: (l) => f(l, 'accident_type') },
  { key: 'incident_date', label: 'Incident Date', get: (l) => f(l, 'incident_date') },
  { key: 'accident_details', label: 'Accident Details', get: (l) => f(l, 'accident_details') },
  { key: 'injured', label: 'Injured', get: (l) => f(l, 'injured') },
  { key: 'injury_type', label: 'Injury Type', get: (l) => f(l, 'injury_type') },
  { key: 'treatment', label: 'Treatment', get: (l) => f(l, 'treatment') },
  { key: 'treatment_type', label: 'Treatment Type', get: (l) => f(l, 'treatment_type') },
  { key: 'treatment_time', label: 'Treatment Time', get: (l) => f(l, 'treatment_time') },
  { key: 'fault', label: 'Fault', get: (l) => f(l, 'fault') },
  { key: 'attorney', label: 'Attorney', get: (l) => f(l, 'attorney') },
  { key: 'insurance', label: 'Insurance', get: (l) => f(l, 'insurance') },
  { key: 'police_report', label: 'Police Report', get: (l) => f(l, 'police_report') },
];

export const DEFAULT_EXPORT_KEYS = LEAD_EXPORT_COLUMNS.filter(c => c.default).map(c => c.key);

// Escape a single CSV cell: wrap in quotes if it contains a comma, quote, or
// newline, and double any inner quotes.
function csvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Build a CSV string for the given leads using the selected column keys,
// preserving catalog order.
export function buildLeadsCsv(leads, selectedKeys) {
  const cols = LEAD_EXPORT_COLUMNS.filter(c => selectedKeys.includes(c.key));
  const header = cols.map(c => csvCell(c.label)).join(',');
  const rows = leads.map(l => cols.map(c => csvCell(c.get(l))).join(','));
  return [header, ...rows].join('\n');
}