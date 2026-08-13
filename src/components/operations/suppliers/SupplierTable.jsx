import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import SupplierStatusPill from './SupplierStatusPill';
import SupplierRowActions from './SupplierRowActions';
import SupplierSourcesCell from './SupplierSourcesCell';
import SupplierChannelsCell from './SupplierChannelsCell';
import { getSupplierColumnDef } from './supplierColumns';

// Renders the supplier list as a sortable table driven by the persisted column
// config. The Actions column is always appended and is not part of the config.
export default function SupplierTable({
  suppliers, sources, config, ctx, sortKey, sortDir, onSort,
  onTransition, onDelete, onClone, onRowClick, onFixChannel,
  selectedIds, onToggleSelect, onToggleSelectAll,
}) {
  const cols = config.columns
    .map((c) => getSupplierColumnDef(c.key))
    .filter(Boolean);

  const allSelected = suppliers.length > 0 && suppliers.every((s) => selectedIds.has(s.id));
  const someSelected = suppliers.some((s) => selectedIds.has(s.id));

  const renderCell = (col, s) => {
    if (col.special === 'status') return <SupplierStatusPill status={s.status} />;
    if (col.special === 'sources') return <SupplierSourcesCell supplier={s} sources={sources} />;
    if (col.special === 'channels') return <SupplierChannelsCell supplier={s} onFix={onFixChannel} />;
    return col.accessor(s, ctx);
  };

  return (
    <div className="bg-card border border-border rounded-[10px] overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(v) => onToggleSelectAll(!!v)}
                aria-label="Select all suppliers"
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
          {suppliers.map((s) => (
            <tr
              key={s.id}
              onClick={() => onRowClick && onRowClick(s)}
              className={`hover:bg-accent/40 transition-colors cursor-pointer ${selectedIds.has(s.id) ? 'bg-primary/5' : ''}`}
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(s.id)}
                  onCheckedChange={() => onToggleSelect(s.id)}
                  aria-label={`Select ${s.name || 'supplier'}`}
                />
              </td>
              {cols.map((col) => (
                <td key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                  {renderCell(col, s)}
                </td>
              ))}
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <SupplierRowActions
                  supplier={s}
                  onTransition={onTransition}
                  onDelete={onDelete}
                  onEdit={onRowClick}
                  onClone={onClone}
                />
              </td>
            </tr>
          ))}
          {suppliers.length === 0 && (
            <tr>
              <td colSpan={cols.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                No suppliers match this filter
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}