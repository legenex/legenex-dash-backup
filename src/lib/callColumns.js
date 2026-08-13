import { formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';
import {
  callEventInstant, callStatusOf, fmtCallMoney, fmtDuration, fmtFlag,
} from '@/lib/callFields';

// Column catalogue for the Calls tables.
//
// Deliberately the same shape as src/lib/columnConfig.js (key / header /
// accessor / className / special) so CallsTable can reuse the exact header,
// resize and persistence behaviour the Leads table already has. The column SET
// differs because a call is not a lead: no email, no verification, no delivery
// error, but duration, disposition, supplier ID and supplier sub ID instead.
export const CALL_SYSTEM_COLUMNS = [
  {
    key: 'created', header: 'Timestamp',
    accessor: (c) => {
      const inst = callEventInstant(c);
      if (!inst) return '-';
      return formatInTimeZone(inst, APP_TZ, 'MMM dd HH:mm');
    },
    className: 'font-mono text-[11px] text-muted-foreground whitespace-nowrap',
  },
  { key: 'fullName', header: 'Full Name', accessor: (c) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || '-' },
  { key: 'mobile', header: 'Number', accessor: (c) => c.mobile_raw || c.mobile || '-', className: 'font-mono text-[12px]' },
  { key: 'callerId', header: 'Caller ID', accessor: (c) => c.caller_id || '-', className: 'font-mono text-[12px] text-muted-foreground' },
  { key: 'vertical', header: 'Vertical', accessor: (c) => c.vertical || '-', special: 'vertical' },
  { key: 'verticalDetail', header: 'Law Type', accessor: (c) => c.vertical_detail || '-' },
  { key: 'callStatus', header: 'Status', accessor: (c) => callStatusOf(c), special: 'callStatus' },
  { key: 'inquiryStatus', header: 'Inquiry Status', accessor: (c) => c.inquiry_status || '-', className: 'text-[12px] text-muted-foreground' },
  { key: 'duration', header: 'Duration', accessor: (c) => fmtDuration(c.duration_seconds), className: 'font-mono text-[12px] text-muted-foreground whitespace-nowrap' },
  { key: 'qualified', header: 'Qualified', accessor: (c) => (c.qualified ? 'Yes' : 'No'), special: 'qualified' },
  { key: 'revenue', header: 'Revenue', accessor: (c) => fmtCallMoney(c.revenue), className: 'font-mono text-[12px] status-sold' },
  { key: 'state', header: 'State', accessor: (c) => c.state || '-' },
  { key: 'consumerState', header: 'Consumer State', accessor: (c) => c.consumer_state || '-' },
  { key: 'city', header: 'City', accessor: (c) => c.city || '-' },
  { key: 'zip', header: 'Zip', accessor: (c) => c.zip || '-', className: 'font-mono text-[12px] text-muted-foreground' },
  { key: 'supplier', header: 'Supplier', accessor: (c) => c.supplier_name || '-' },
  { key: 'sid', header: 'Supplier ID', accessor: (c) => c.sid || '-', className: 'font-mono text-[12px]' },
  { key: 'ssid', header: 'Supplier SubID', accessor: (c) => c.ssid || '-', className: 'font-mono text-[12px]' },
  { key: 'buyer', header: 'Buyer', accessor: (c) => c.buyer_code || c.buyer_name || '-' },
  { key: 'campaign', header: 'Campaign', accessor: (c) => c.campaign_name || '-' },
  { key: 'disposition', header: 'Disposition', accessor: (c) => c.disposition || '-', className: 'text-[12px] text-muted-foreground' },
  { key: 'dispositions', header: 'All Dispositions', accessor: (c) => c.dispositions || '-', className: 'text-[11px] text-muted-foreground' },
  { key: 'uniqueInquiry', header: 'Unique Inquiry', accessor: (c) => fmtFlag(c.unique_inquiry) },
  { key: 'webLead', header: 'Web Lead', accessor: (c) => fmtFlag(c.web_lead) },
  { key: 'attribution', header: 'Attribution', accessor: (c) => c.attribution_status || '-', className: 'text-[12px] text-muted-foreground' },
  { key: 'mediaSource', header: 'Media Source', accessor: (c) => c.media_source || '-', className: 'text-[12px] text-muted-foreground' },
  { key: 'source', header: 'Source', accessor: (c) => c.source_name || '-', className: 'text-[12px] text-muted-foreground' },
  { key: 'callId', header: 'Call ID', accessor: (c) => (c.call_id != null && c.call_id !== '' ? String(c.call_id) : '-'), className: 'font-mono text-[11px] text-muted-foreground' },
];

// What an operator sees before they customise the layout. Mirrors the Leads
// default (time, who, what, outcome, money, where, supplier, buyer) and adds
// the call-specific ones Nick asked to lean on: duration, SID and SubID.
export const DEFAULT_CALL_COLUMN_KEYS = [
  'created', 'fullName', 'mobile', 'vertical', 'callStatus', 'duration',
  'qualified', 'revenue', 'state', 'supplier', 'sid', 'ssid', 'buyer', 'disposition',
];

const STORAGE_KEY = 'legenex_call_column_config_v1';

export function loadCallColumnConfig(view) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (all[view] && Array.isArray(all[view].columns)) return all[view];
  } catch { /* private mode */ }
  return { columns: DEFAULT_CALL_COLUMN_KEYS.map((k) => ({ key: k, width: null })) };
}

export function saveCallColumnConfig(view, config) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[view] = config;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}

// Resolve a column def by key, including operator-mapped custom_fields columns
// (prefixed `ccf_`, read out of the CallRecord.custom_fields JSON bag).
export function getCallColumnDef(key) {
  const sys = CALL_SYSTEM_COLUMNS.find((c) => c.key === key);
  if (sys) return sys;
  if (key && key.startsWith('ccf_')) {
    const fieldName = key.slice(4);
    return {
      key,
      header: fieldName,
      accessor: (c) => {
        let bag = {};
        try { bag = JSON.parse(c.custom_fields || '{}'); } catch { bag = {}; }
        const v = bag[fieldName];
        return v != null && v !== '' ? String(v) : '-';
      },
      className: 'text-[12px]',
    };
  }
  return null;
}

// Every column the operator can add. Custom keys are discovered from the rows
// on screen, because the call sheet decides what extra columns exist.
export function buildAvailableCallColumns(calls) {
  const customKeys = new Set();
  for (const c of calls || []) {
    let bag = {};
    try { bag = JSON.parse(c.custom_fields || '{}'); } catch { bag = {}; }
    for (const k of Object.keys(bag)) customKeys.add(k);
  }
  const custom = Array.from(customKeys).sort()
    .map((k) => ({ key: `ccf_${k}`, header: k, isCustom: true }));
  return [...CALL_SYSTEM_COLUMNS.map((c) => ({ key: c.key, header: c.header })), ...custom];
}

// Filterable fields offered in the Add Filter row.
export const CALL_FILTER_FIELDS = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'mobile', label: 'Number' },
  { value: 'caller_id', label: 'Caller ID' },
  { value: 'call_id', label: 'Call ID' },
  { value: 'call_status', label: 'Status' },
  { value: 'inquiry_status', label: 'Inquiry Status' },
  { value: 'duration_seconds', label: 'Duration (seconds)' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'vertical_detail', label: 'Law Type' },
  { value: 'state', label: 'State' },
  { value: 'consumer_state', label: 'Consumer State' },
  { value: 'city', label: 'City' },
  { value: 'zip', label: 'Zip' },
  { value: 'supplier_name', label: 'Supplier' },
  { value: 'sid', label: 'Supplier ID' },
  { value: 'ssid', label: 'Supplier SubID' },
  { value: 'buyer_code', label: 'Buyer' },
  { value: 'campaign_name', label: 'Campaign' },
  { value: 'disposition', label: 'Disposition' },
  { value: 'dispositions', label: 'All Dispositions' },
  { value: 'media_source', label: 'Media Source' },
  { value: 'source_name', label: 'Source' },
  { value: 'attribution_status', label: 'Attribution' },
];
