import React, { useState, useEffect } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

// Confirm dialog for Pause and Terminate. States plainly that this supplier
// will stop being included in state change notifications while paused, before
// the operator commits.
//
// Props:
//   open, onOpenChange
//   action: 'pause' | 'terminate'
//   supplier: the Supplier record
//   onConfirm: () => Promise<void>
export default function SupplierActionDialog({ open, onOpenChange, action, supplier, onConfirm }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  if (!supplier) return null;

  const name = supplier.name || 'this supplier';
  const title = action === 'pause' ? 'Pause supplier?' : 'Terminate supplier?';
  const line = action === 'pause'
    ? `While paused, ${name} will stop being included in state change notifications. If a state closes, this supplier will not be told.`
    : `Terminating ${name} stops it being included in state change notifications. If a state closes, this supplier will not be told.`;

  const commit = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <AlertDialogContent className="bg-popover border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{line}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); commit(); }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {action === 'pause' ? 'Pause Supplier' : 'Terminate Supplier'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}