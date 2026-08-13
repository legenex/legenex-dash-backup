import React from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { STEP_LABELS } from './onboardingModel';

// Steps whose completion means a real external record already exists.
const EXTERNAL_STEPS = [
  { key: 'create_buyer', label: 'Buyer record' },
  { key: 'xero_contact', label: 'Xero contact' },
  { key: 'stripe_customer', label: 'Stripe customer' },
  { key: 'deposit_invoice', label: 'Stripe deposit invoice' },
  { key: 'xero_invoice', label: 'Xero sales invoice' },
  { key: 'payment_link', label: 'Rebrandly payment link' },
  { key: 'leadbyte_buyer', label: 'LeadByte buyer' },
  { key: 'crm_contact', label: 'GHL contact' },
];

// List of external records that already exist, from the steps that hold an id.
export function existingExternalRecords(steps) {
  return EXTERNAL_STEPS
    .map((e) => {
      const step = steps.find((s) => s.key === e.key);
      if (step && step.status === 'complete' && step.external_id) {
        return { label: e.label, id: step.external_id };
      }
      return null;
    })
    .filter(Boolean);
}

// Confirm dialog shown before triggering onboardBuyer. Makes clear this is not a
// dry run and creates real records and sends a real email.
export function RunOnboardingDialog({ open, onOpenChange, actionLabel, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{actionLabel}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[13px]">
              <p>
                This is not a dry run. Running onboarding creates real records in Stripe, Xero,
                LeadByte, Rebrandly and GHL, and sends a real onboarding email to the buyer contact.
              </p>
              <p className="text-muted-foreground">
                Steps that already hold an external id are not repeated, so nothing is created twice.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Confirm dialog for cancelling an onboarding. States plainly that cancelling
// does not delete the buyer or reverse anything already created externally, and
// lists which external records already exist.
export function CancelOnboardingDialog({ open, onOpenChange, steps, onConfirm }) {
  const existing = existingExternalRecords(steps || []);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this onboarding?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-[13px]">
              <p>
                Cancelling marks this onboarding as cancelled. It does not delete the buyer and does
                not reverse anything already created externally.
              </p>
              {existing.length > 0 ? (
                <div>
                  <p className="text-muted-foreground mb-1.5">
                    These external records already exist and will remain in place:
                  </p>
                  <ul className="space-y-1">
                    {existing.map((e) => (
                      <li key={e.label} className="flex items-baseline gap-2">
                        <span className="text-foreground">{e.label}</span>
                        <span className="font-mono text-[11px] text-muted-foreground break-all">{e.id}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-muted-foreground">No external records have been created yet.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep onboarding</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Cancel onboarding</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}