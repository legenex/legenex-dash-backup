import { format } from 'date-fns';
import { money } from './stateMetrics';

// Column definitions for the Active States table. Each row is a resolved
// StateStatus view (or a buyer-scoped synthetic status) keyed by state code.
// Uncovered states carry active=false and are sorted last by default.

export const STATE_COLUMNS = [
  {
    key: 'state', header: 'State', sortable: true,
    sortValue: (r) => r.state,
    accessor: (r) => r.state,
    className: 'font-mono text-[12px] font-semibold text-foreground',
  },
  {
    key: 'active', header: 'Covered', sortable: true,
    sortValue: (r) => (r.active ? 1 : 0),
    accessor: (r) => (r.active ? 'Yes' : 'No'),
    className: 'text-[12px]',
  },
  {
    key: 'effective_client_type', header: 'Effective Tier', sortable: true,
    sortValue: (r) => r.effective_client_type || 'zzz',
    accessor: (r) => r.effective_client_type || 'None',
    className: 'text-[12px]',
  },
  {
    key: 'active_buyer_count', header: 'Active Buyers', sortable: true,
    sortValue: (r) => Number(r.active_buyer_count || 0),
    accessor: (r) => String(r.active_buyer_count || 0),
    className: 'font-mono text-[12px] tabular-nums',
  },
  {
    key: 'highest_cpl', header: 'Highest CPL', sortable: true,
    sortValue: (r) => (r.active ? Number(r.highest_cpl || 0) : -1),
    accessor: (r) => (r.active ? (money(r.highest_cpl) ?? '-') : '-'),
    className: 'font-mono text-[12px] tabular-nums',
  },
  {
    key: 'lowest_cpl', header: 'Lowest CPL', sortable: true,
    sortValue: (r) => (r.active ? Number(r.lowest_cpl || 0) : -1),
    accessor: (r) => (r.active ? (money(r.lowest_cpl) ?? '-') : '-'),
    className: 'font-mono text-[12px] tabular-nums',
  },
  {
    key: 'last_changed_at', header: 'Last Changed', sortable: true,
    sortValue: (r) => r.last_changed_at || '',
    accessor: (r) => (r.last_changed_at ? format(new Date(r.last_changed_at), 'MMM dd HH:mm') : '-'),
    className: 'font-mono text-[11px] text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'last_change_direction', header: 'Direction', sortable: true,
    sortValue: (r) => r.last_change_direction || 'zzz',
    accessor: (r) => r.last_change_direction || '-',
    className: 'text-[12px] capitalize',
  },
];

export const DEFAULT_STATE_COLUMN_KEYS = STATE_COLUMNS.map((c) => c.key);

const STORAGE_KEY = 'legenex_active_states_columns_v1';

export function loadStateColumnConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.columns)) return saved;
  } catch {}
  return { columns: DEFAULT_STATE_COLUMN_KEYS.map((k) => ({ key: k, width: null })) };
}

export function saveStateColumnConfig(config) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
}

export function getStateColumnDef(key) {
  return STATE_COLUMNS.find((c) => c.key === key) || null;
}

export const STATE_AVAILABLE_COLUMNS = STATE_COLUMNS.map((c) => ({ key: c.key, header: c.header }));