import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import BuyerStatusPill from './BuyerStatusPill';
import BuyerRowActions from './BuyerRowActions';
import { getBuyerColumnDef } from './buyerColumns';

// Renders the buyer list as a sortable table driven by the persisted column
// config. The Actions column is always appended and is not part of the config.
export default function BuyerTable({
  buyers, config, ctx, sortKey, sortDir, onSort,
  onTransition, onPause, onTerminate, onDelete, onRowClick,
  selectedIds, onToggleSelect, onToggleSelectAll,
}) {
  const cols = config.columns
    .map((c) => getBuyerColumnDef(c.key))
    .filter(Boolean);

  const allSelected = buyers.length > 0 && buyers.every((b) => selectedIds.has(b.id));
  const someSelected = buyers.some((b) => selectedIds.has(b.id));

  return (
    <div className="bg-card border border-border rounded-[10px] overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(v) => onToggleSelectAll(!!v)}
                aria-label="Select all buyers"
              />
            </th>
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
            <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {buyers.map((b) => (
            <tr
              key={b.id}
              onClick={() => onRowClick && onRowClick(b)}
              className={`hover:bg-accent/40 transition-colors cursor-pointer ${selectedIds.has(b.id) ? 'bg-primary/5' : ''}`}
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(b.id)}
                  onCheckedChange={() => onToggleSelect(b.id)}
                  aria-label={`Select ${b.company_name || 'buyer'}`}
                />
              </td>
              {cols.map((col) => (
                <td key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                  {col.special === 'status'
                    ? <BuyerStatusPill status={b.status} />
                    : col.accessor(b, ctx)}
                </td>
              ))}
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <BuyerRowActions
                  buyer={b}
                  onTransition={onTransition}
                  onPause={onPause}
                  onTerminate={onTerminate}
                  onDelete={onDelete}
                  onEdit={onRowClick}
                />
              </td>
            </tr>
          ))}
          {buyers.length === 0 && (
            <tr>
              <td colSpan={cols.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                No buyers match this filter
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}