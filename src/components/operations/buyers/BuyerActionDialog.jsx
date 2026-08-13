import React, { useState, useEffect } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { joinStates } from './buyerListModel';

// Confirm dialog for Pause and Terminate. Requires a free text reason and
// states the blast radius (the states this buyer currently keeps open on its
// own) before the operator commits.
//
// Props:
//   open, onOpenChange
//   action: 'pause' | 'terminate'
//   buyer: the Buyer record
//   closesStates: array of state codes this buyer closes when paused
//   onConfirm: (reason) => Promise<void>
export default function BuyerActionDialog({ open, onOpenChange, action, buyer, closesStates = [], onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setReason(''); setBusy(false); }
  }, [open]);

  if (!buyer) return null;

  const verb = action === 'pause' ? 'Pausing' : 'Terminating';
  const title = action === 'pause' ? 'Pause buyer?' : 'Terminate buyer?';
  const name = buyer.company_name || 'this buyer';

  const blastLine = closesStates.length > 0
    ? `${verb} ${name} closes ${joinStates(closesStates)}. Suppliers will be notified.`
    : `${verb} ${name} closes no states. No coverage changes for other buyers.`;

  const commit = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
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
          <AlertDialogDescription>{blastLine}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label className="text-[12px]">Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this buyer being changed?"
            className="bg-background min-h-[80px] text-[13px]"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); commit(); }}
            disabled={!reason.trim() || busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {action === 'pause' ? 'Pause Buyer' : 'Terminate Buyer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}