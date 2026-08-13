import React from 'react';
import { Play, Pause, Copy, Trash2, Pencil } from 'lucide-react';
import RowActionsMenu from '@/components/campaigns/RowActionsMenu';

// Per-row supplier actions in a shared 3-dot overflow menu. Edit, Enable/Disable
// (an instant status transition), Clone and Delete are always available. Status
// transitions call onTransition directly; Delete is routed through its confirm
// dialog by the parent.
export default function SupplierRowActions({ supplier, onTransition, onDelete, onEdit, onClone }) {
  const status = String(supplier.status || 'new').toLowerCase();
  const isActive = status === 'active';
  const actions = [];

  if (onEdit) {
    actions.push({ label: 'Edit', icon: Pencil, onClick: () => onEdit(supplier) });
  }

  actions.push(
    isActive
      ? { label: 'Disable', icon: Pause, onClick: () => onTransition(supplier, 'paused'), separatorBefore: !!onEdit }
      : { label: 'Enable', icon: Play, onClick: () => onTransition(supplier, 'active'), separatorBefore: !!onEdit },
  );

  if (onClone) {
    actions.push({ label: 'Clone', icon: Copy, onClick: () => onClone(supplier) });
  }

  actions.push({ label: 'Delete', icon: Trash2, onClick: () => onDelete(supplier), danger: true, separatorBefore: true });

  return <RowActionsMenu actions={actions} />;
}