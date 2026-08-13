import { format } from 'date-fns';
import { activeStateCount, cplRange } from './buyerListModel';

// Column definitions for the Buyer Management table. Each column carries a
// sortValue (used by the table's sort) and a special marker for cells that
// render bespoke content (status pill, actions). Data-derived columns receive
// the fetched cplRows via the ctx argument.

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export const BUYER_COLUMNS = [
  {
    key: 'company_name', header: 'Buyer', sortable: true,
    sortValue: (b) => (b.company_name || '').toLowerCase(),
    accessor: (b) => b.company_name || '-',
    className: 'font-medium text-foreground',
  },
  {
    key: 'buyer_code', header: 'Code', sortable: true,
    sortValue: (b) => b.buyer_code || '',
    accessor: (b) => b.buyer_code || '-',
    className: 'font-mono text-[11px] text-muted-foreground',
  },
  {
    key: 'client_type', header: 'Buyer Type', sortable: true,
    sortValue: (b) => b.client_type || 'zzz',
    // Unclassified is not a neutral state here: a buyer with no type came from a
    // lead payload and cannot be routed or billed until it is finished, so the
    // cell says so rather than leaving a quiet dash.
    accessor: (b) => (b.client_type ? b.client_type : 'Unclassified, needs setup'),
    className: 'text-[12px]',
  },
  {
    key: 'status', header: 'Status', sortable: true, special: 'status',
    sortValue: (b) => b.status || 'draft',
  },
  {
    key: 'vertical', header: 'Vertical', sortable: true,
    sortValue: (b) => b.vertical || '',
    accessor: (b) => b.vertical || '-',
    className: 'font-mono text-[11px]',
  },
  {
    key: 'active_states', header: 'Active States', sortable: true,
    sortValue: (b, ctx) => activeStateCount(b.id, ctx.cplRows),
    accessor: (b, ctx) => String(activeStateCount(b.id, ctx.cplRows)),
    className: 'font-mono text-[12px] tabular-nums',
  },
  {
    key: 'cpl_range', header: 'CPL Range', sortable: true,
    sortValue: (b, ctx) => {
      const r = cplRange(b.id, ctx.cplRows);
      return r ? r.lo : -1;
    },
    accessor: (b, ctx) => {
      const r = cplRange(b.id, ctx.cplRows);
      if (!r) return '';
      return r.lo === r.hi ? money(r.lo) : `${money(r.lo)} - ${money(r.hi)}`;
    },
    className: 'font-mono text-[12px] tabular-nums',
  },
  {
    key: 'ipl_fee_pct', header: 'IPL Fee', sortable: true,
    sortValue: (b) => Number(b.ipl_fee_pct ?? 1),
    accessor: (b) => `${(Number(b.ipl_fee_pct ?? 1) * 100).toFixed(1)}%`,
    className: 'font-mono text-[12px] tabular-nums',
  },
  {
    key: 'billing_type', header: 'Billing', sortable: true,
    sortValue: (b) => b.billing_type || '',
    accessor: (b) => b.billing_type || '-',
    className: 'text-[12px]',
  },
  {
    key: 'verify_required', header: 'Verify', sortable: true,
    sortValue: (b) => (b.verify_required ? 1 : 0),
    accessor: (b) => (b.verify_required ? 'Required' : 'No'),
    className: 'text-[12px]',
  },
  {
    key: 'last_changed', header: 'Last Changed', sortable: true,
    sortValue: (b) => b.updated_date || '',
    accessor: (b) => (b.updated_date ? format(new Date(b.updated_date), 'MMM dd HH:mm') : '-'),
    className: 'font-mono text-[11px] text-muted-foreground whitespace-nowrap',
  },
];

export const DEFAULT_BUYER_COLUMN_KEYS = [
  'company_name', 'buyer_code', 'client_type', 'status', 'vertical',
  'active_states', 'cpl_range', 'ipl_fee_pct', 'billing_type', 'verify_required', 'last_changed',
];

const STORAGE_KEY = 'legenex_buyer_columns_v1';

export function loadBuyerColumnConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.columns)) return saved;
  } catch {}
  return { columns: DEFAULT_BUYER_COLUMN_KEYS.map((k) => ({ key: k, width: null })) };
}

export function saveBuyerColumnConfig(config) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
}

export function getBuyerColumnDef(key) {
  return BUYER_COLUMNS.find((c) => c.key === key) || null;
}

export const BUYER_AVAILABLE_COLUMNS = BUYER_COLUMNS.map((c) => ({ key: c.key, header: c.header }));