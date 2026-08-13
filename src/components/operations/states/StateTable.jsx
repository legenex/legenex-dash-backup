import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { getStateColumnDef } from './stateColumns';

// Sortable Active States table driven by the persisted column config. Rows are
// resolved StateStatus views keyed by state code.
export default function StateTable({ rows, config, sortKey, sortDir, onSort, selected, onRowClick }) {
  const cols = config.columns.map((c) => getStateColumnDef(c.key)).filter(Boolean);

  return (
    <div className="bg-card border border-border rounded-[10px] overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {cols.map((col) => {
              const isSorted = sortKey === col.key;
              return (
                <th key={col.key} className="text-left px-4 py-3">
                  <button
                    type="button"
                    onClick={() => col.sortable && onSort(col.key)}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider ${
                      col.sortable ? 'hover:text-foreground cursor-pointer' : 'cursor-default'
                    } ${isSorted ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {col.header}
                    {isSorted && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr
              key={r.state}
              onClick={() => onRowClick && onRowClick(r)}
              className={`transition-colors cursor-pointer ${selected === r.state ? 'bg-primary/10' : 'hover:bg-accent/40'} ${!r.active ? 'opacity-60' : ''}`}
            >
              {cols.map((col) => (
                <td key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                  {col.accessor(r)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-4 py-8 text-center text-muted-foreground">
                No states match this filter
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}