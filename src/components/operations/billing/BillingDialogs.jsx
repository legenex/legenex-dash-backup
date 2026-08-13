import React from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { money, integer } from './billingApi';

const PROVIDER_LABEL = { xero_link: 'Xero invoice link', stripe_card: 'Stripe card' };

// Top up dialog. States the buyer, the amount that would be invoiced, and the
// payment provider on record, then closes with a toast. Writes nothing, never
// touches Stripe or Xero, never creates an Invoice.
export function TopUpDialog({ open, onOpenChange, buyer, preview, onConfirm }) {
  const amount = preview
    ? preview.reduce((s, p) => s + (p?.totals?.net || 0), 0)
    : null;
  const provider = buyer ? (PROVIDER_LABEL[buyer.payment_provider] || buyer.payment_provider || 'Not on record') : '';
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Top up {buyer?.company_name}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buyer</span>
                <span className="text-foreground">{buyer?.company_name} ({buyer?.buyer_code || 'no code'})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount that would be invoiced</span>
                <span className="font-mono text-foreground">{money(amount) != null ? money(amount) : 'No value'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment provider on record</span>
                <span className="text-foreground">{provider}</span>
              </div>
              <p className="text-muted-foreground pt-1">
                Nothing is charged and no invoice is created here. Invoice issuing arrives in a later build.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Acknowledge</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Generate invoice dialog. Shows computed net and line item count, and states
// plainly that confirming writes a draft BillingRun and its line items but does
// not create an Invoice, charge the buyer, or contact Stripe or Xero.
export function GenerateInvoiceDialog({ open, onOpenChange, buyer, preview, onConfirm, working }) {
  const net = preview?.totals?.net;
  const lineCount = preview?.line_items?.length ?? null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate draft for {buyer?.company_name}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Computed net</span>
                <span className="font-mono text-foreground">{money(net) != null ? money(net) : 'No value'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Line items</span>
                <span className="font-mono text-foreground">{integer(lineCount) != null ? integer(lineCount) : 'No value'}</span>
              </div>
              <p className="text-muted-foreground pt-1">
                Confirming writes a draft billing run and its line items. It does not create an invoice, does not charge the buyer, and does not contact Stripe or Xero.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={working}>
            {working ? 'Generating...' : 'Generate draft'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}