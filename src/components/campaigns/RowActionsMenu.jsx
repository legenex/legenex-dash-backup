import React from 'react';
import { MoreVertical, Pencil, Files, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// Shared 3-dot row actions menu used across every table with row actions
// (Campaigns, Operations Buyers/Suppliers, Deliveries, and any row with
// steps/options). One component so the pattern stays congruent everywhere.
//
// Two ways to use it:
//   1. Convenience props (kept for existing callers):
//        onEdit / onClone / onDelete
//   2. A full `actions` array for arbitrary, status-aware menus:
//        [{ label, icon, onClick, danger, separatorBefore, disabled }]
//      When `actions` is provided it fully defines the menu and the convenience
//      props are ignored.
export default function RowActionsMenu({ actions, onEdit, onClone, onDelete, align = 'end' }) {
  let items = actions;
  if (!items) {
    items = [];
    if (onEdit) items.push({ label: 'Edit', icon: Pencil, onClick: onEdit });
    if (onClone) items.push({ label: 'Clone', icon: Files, onClick: onClone });
    if (onDelete) items.push({ label: 'Delete', icon: Trash2, onClick: onDelete, danger: true, separatorBefore: !!(onEdit || onClone) });
  }

  if (!items || items.length === 0) return null;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Actions"
            aria-label="Row actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-40">
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <React.Fragment key={it.label || i}>
                {it.separatorBefore && i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); it.onClick?.(e); }}
                  disabled={it.disabled}
                  className={`text-[12px] cursor-pointer gap-2 ${it.danger ? 'text-destructive focus:text-destructive' : ''}`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />} {it.label}
                </DropdownMenuItem>
              </React.Fragment>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
