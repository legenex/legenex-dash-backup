import React, { useState, useEffect } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// Destructive confirm for deleting a terminated supplier. Requires typing the
// supplier name exactly to proceed.
export default function SupplierDeleteDialog({ open, onOpenChange, supplier, onConfirm }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTyped(''); setBusy(false); }
  }, [open]);

  if (!supplier) return null;

  const name = supplier.name || '';
  const matches = typed.trim() === name.trim() && name.trim() !== '';

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
          <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes "{name}". This action cannot be undone. Type the supplier name to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label className="text-[12px]">Supplier name</Label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={name}
            className="bg-background"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); commit(); }}
            disabled={!matches || busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete Supplier
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}