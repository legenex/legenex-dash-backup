import React from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

// Sticky action bar shown when one or more buyers are selected. Offers a bulk
// delete guarded by a simple Yes/No confirmation (no name typing).
export default function BuyerBulkDeleteBar({ count, onClear, onConfirmDelete, confirming, deleting }) {
  const [open, setOpen] = React.useState(false);

  if (count === 0) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-medium">{count} selected</span>
          <button onClick={onClear} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
        <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setOpen(true)} disabled={deleting}>
          <Trash2 className="w-4 h-4" /> Delete {count}
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count} {count === 1 ? 'buyer' : 'buyers'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected {count === 1 ? 'buyer' : 'buyers'}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>No, cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => { e.preventDefault(); await onConfirmDelete(); setOpen(false); }}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}