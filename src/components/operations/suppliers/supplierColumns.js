import { format } from 'date-fns';
import { sourceCount, channelHealth } from './supplierListModel';

// Column definitions for the Supplier Management table. Each column carries a
// sortValue (used by the table's sort) and a special marker for cells that
// render bespoke content (status pill, sources popover, channels dot, actions).
// Data-derived columns receive the fetched sources via the ctx argument.

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

const HEALTH_SORT = { none: 0, muted: 1, idle: 2, ok: 3 };

export const SUPPLIER_COLUMNS = [
  {
    key: 'name', header: 'Supplier', sortable: true,
    sortValue: (s) => (s.name || '').toLowerCase(),
    accessor: (s) => s.name || '-',
    className: 'font-medium text-foreground',
  },
  {
    key: 'status', header: 'Status', sortable: true, special: 'status',
    sortValue: (s) => s.status || 'new',
  },
  {
    key: 'supplier_type', header: 'Type', sortable: true,
    sortValue: (s) => s.supplier_type || '',
    accessor: (s) => s.supplier_type || '-',
    className: 'text-[12px]',
  },
  {
    key: 'payout_type', header: 'Payout Type', sortable: true,
    sortValue: (s) => s.payout_type || '',
    accessor: (s) => s.payout_type || 'None',
    className: 'text-[12px]',
  },
  {
    key: 'payout_value', header: 'Payout Value', sortable: true,
    sortValue: (s) => Number(s.payout_value ?? -1),
    accessor: (s) => {
      if (s.payout_value == null || s.payout_value === '') return '-';
      const pct = s.payout_type === 'Profit %' || s.payout_type === 'Revenue %';
      return pct ? `${Number(s.payout_value)}%` : money(s.payout_value);
    },
    className: 'font-mono text-[12px] tabular-nums',
  },
  {
    key: 'sources', header: 'Sources', sortable: true, special: 'sources',
    sortValue: (s, ctx) => sourceCount(s.id, ctx.sources),
    className: 'font-mono text-[12px] tabular-nums',
  },
  {
    key: 'channels', header: 'Channels', sortable: true, special: 'channels',
    sortValue: (s) => HEALTH_SORT[channelHealth(s)] ?? 9,
  },
  {
    key: 'last_changed', header: 'Last Changed', sortable: true,
    sortValue: (s) => s.updated_date || '',
    accessor: (s) => (s.updated_date ? format(new Date(s.updated_date), 'MMM dd HH:mm') : '-'),
    className: 'font-mono text-[11px] text-muted-foreground whitespace-nowrap',
  },
];

export const DEFAULT_SUPPLIER_COLUMN_KEYS = [
  'name', 'status', 'supplier_type', 'payout_type', 'payout_value',
  'sources', 'channels', 'last_changed',
];

const STORAGE_KEY = 'legenex_supplier_columns_v1';

export function loadSupplierColumnConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.columns)) return saved;
  } catch {}
  return { columns: DEFAULT_SUPPLIER_COLUMN_KEYS.map((k) => ({ key: k, width: null })) };
}

export function saveSupplierColumnConfig(config) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
}

export function getSupplierColumnDef(key) {
  return SUPPLIER_COLUMNS.find((c) => c.key === key) || null;
}

export const SUPPLIER_AVAILABLE_COLUMNS = SUPPLIER_COLUMNS.map((c) => ({ key: c.key, header: c.header }));