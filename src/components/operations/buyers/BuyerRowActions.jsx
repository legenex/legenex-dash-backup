import React from 'react';
import { Rocket, Play, Undo2, Pause, Ban, Trash2, Pencil } from 'lucide-react';
import RowActionsMenu from '@/components/campaigns/RowActionsMenu';

// Per status row actions, presented as a shared 3-dot overflow menu. Instant
// transitions (Launch, Activate, Cancel) call onTransition directly. Pause,
// Terminate and Delete are routed through their confirm dialogs by the parent
// via onPause / onTerminate / onDelete. Status logic is unchanged; only the
// presentation moved from inline buttons to the dropdown.
export default function BuyerRowActions({ buyer, onTransition, onPause, onTerminate, onDelete, onEdit }) {
  const status = String(buyer.status || 'draft').toLowerCase();
  const actions = [];

  if (onEdit) {
    actions.push({ label: 'Edit', icon: Pencil, onClick: () => onEdit(buyer) });
  }

  const first = onEdit ? { separatorBefore: true } : {};
  if (status === 'draft') {
    actions.push({ label: 'Launch', icon: Rocket, onClick: () => onTransition(buyer, 'launching'), ...first });
  } else if (status === 'launching') {
    actions.push({ label: 'Activate', icon: Play, onClick: () => onTransition(buyer, 'active'), ...first });
    actions.push({ label: 'Cancel', icon: Undo2, onClick: () => onTransition(buyer, 'draft') });
  } else if (status === 'active') {
    actions.push({ label: 'Pause', icon: Pause, onClick: () => onPause(buyer), ...first });
    actions.push({ label: 'Terminate', icon: Ban, onClick: () => onTerminate(buyer), danger: true, separatorBefore: true });
  } else if (status === 'paused') {
    actions.push({ label: 'Activate', icon: Play, onClick: () => onTransition(buyer, 'active'), ...first });
    actions.push({ label: 'Terminate', icon: Ban, onClick: () => onTerminate(buyer), danger: true, separatorBefore: true });
  } else if (status === 'terminated') {
    actions.push({ label: 'Activate', icon: Play, onClick: () => onTransition(buyer, 'active'), ...first });
    actions.push({ label: 'Delete', icon: Trash2, onClick: () => onDelete(buyer), danger: true, separatorBefore: true });
  }

  return <RowActionsMenu actions={actions} />;
}