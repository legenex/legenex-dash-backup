import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader2, Play, RotateCcw, ArrowRight, AlertTriangle, MapPin } from 'lucide-react';
import OnboardingStatusPill from './OnboardingStatusPill';
import SubmissionSummary from './SubmissionSummary';
import StepRail from './StepRail';
import { RunOnboardingDialog, CancelOnboardingDialog } from './OnboardingDialogs';
import { parseSteps, parsePayload, firstFailedStep } from './onboardingModel';

// Compute the primary action for the current status.
function primaryAction(record, steps) {
  const status = record.status;
  if (status === 'complete') return { key: 'view', label: 'View buyer' };
  if (status === 'submitted') return { key: 'start', label: 'Start onboarding' };
  const allDone = steps.every((s) => s.status === 'complete' || s.status === 'skipped');
  if ((status === 'blocked' || status === 'in_progress') && !allDone) {
    return { key: 'resume', label: 'Resume' };
  }
  return null;
}

export default function OnboardingDrawer({ open, onOpenChange, record, buyer, running, onRun, onCancel }) {
  const [runOpen, setRunOpen] = useState(false);
  const [runAction, setRunAction] = useState(null); // { label, fromStep }
  const [cancelOpen, setCancelOpen] = useState(false);

  const steps = useMemo(() => (record ? parseSteps(record) : []), [record]);
  const payload = useMemo(() => (record ? parsePayload(record) : {}), [record]);

  if (!record) return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full sm:max-w-xl p-0 bg-background" /></Sheet>;

  const action = primaryAction(record, steps);
  const code = record.buyer_code || buyer?.buyer_code || '';
  const failed = firstFailedStep(steps);

  // Complete but the linked buyer is still draft: onboarding finished, not launched.
  const completeButDraft = record.status === 'complete' && buyer && buyer.status === 'draft';
  // Buyer created with no coverage: coverage is set on the Buyers page.
  const buyerNoCoverage = !!buyer && !!buyer.buyer_code;

  const askRun = (label, fromStep) => {
    setRunAction({ label, fromStep });
    setRunOpen(true);
  };

  const confirmRun = () => {
    setRunOpen(false);
    if (runAction) onRun(record, runAction.fromStep);
  };

  const onPrimary = () => {
    if (!action) return;
    if (action.key === 'view') return; // handled by Link
    if (action.key === 'start') return askRun('Start onboarding', null);
    if (action.key === 'resume') return askRun('Resume', record.current_step || (failed ? failed.key : null));
  };

  const IconFor = action?.key === 'start' ? Play : action?.key === 'resume' ? RotateCcw : ArrowRight;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0 bg-background">
        {/* Header */}
        <div className="border-b border-border px-6 pt-6 pb-5">
          <div className="flex items-start gap-3 pr-8">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold text-foreground truncate">{record.company_name || 'Buyer'}</h2>
              <div className="flex items-center gap-2 mt-1">
                {code
                  ? <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
                  : <span className="text-[12px] text-muted-foreground">No buyer yet</span>}
              </div>
            </div>
            <div className="ml-auto shrink-0"><OnboardingStatusPill status={record.status} /></div>
          </div>

          {action && (
            <div className="mt-4">
              {action.key === 'view' && buyer ? (
                <Button asChild className="gap-1.5">
                  <Link to={`/buyers/${buyer.id}`}><ArrowRight className="w-4 h-4" /> View buyer</Link>
                </Button>
              ) : (
                <Button onClick={onPrimary} disabled={running} className="gap-1.5">
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconFor className="w-4 h-4" />}
                  {running ? 'Running...' : action.label}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {/* Warnings */}
          {completeButDraft && (
            <div className="rounded-[10px] border border-[hsl(38_80%_57%)]/40 bg-status-unsold px-3.5 py-3 text-[12.5px]">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 status-unsold mt-0.5 shrink-0" />
                <div>
                  Onboarding finished, but this buyer has not been launched. A completed onboarding does
                  not put a buyer live.{' '}
                  <Link to="/operations/buyers" className="text-primary hover:underline font-medium">Go to Buyers</Link> to launch it.
                </div>
              </div>
            </div>
          )}

          {buyerNoCoverage && (
            <div className="rounded-[10px] border border-border bg-muted/50 px-3.5 py-3 text-[12.5px] text-muted-foreground">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  State coverage for this buyer is set on the Buyers page, not here. A buyer with no
                  coverage receives no leads.{' '}
                  <Link to="/operations/buyers" className="text-primary hover:underline font-medium">Set coverage</Link>.
                </div>
              </div>
            </div>
          )}

          {/* 1. Submission summary */}
          <section>
            <div className="text-[13px] font-semibold text-foreground mb-3">Submission summary</div>
            <SubmissionSummary payload={payload} />
          </section>

          {/* 2. Step rail */}
          <section>
            <div className="text-[13px] font-semibold text-foreground mb-3">Onboarding steps</div>
            <StepRail
              steps={steps}
              buyer={buyer}
              running={running}
              onRetryStep={(stepKey) => askRun('Retry from this step', stepKey)}
            />
          </section>

          {/* 3. Danger zone */}
          {record.status !== 'cancelled' && (
            <section>
              <div className="text-[13px] font-semibold text-primary mb-2">Danger zone</div>
              <div className="rounded-[10px] border border-primary/30 px-3.5 py-3">
                <div className="text-[12.5px] text-muted-foreground mb-2.5">
                  Cancel this onboarding. This does not delete the buyer or reverse anything already
                  created in Stripe, Xero or LeadByte.
                </div>
                <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)} className="text-primary border-primary/40 hover:bg-primary/10">
                  Cancel onboarding
                </Button>
              </div>
            </section>
          )}
        </div>

        <RunOnboardingDialog
          open={runOpen}
          onOpenChange={setRunOpen}
          actionLabel={runAction?.label || 'Run onboarding'}
          onConfirm={confirmRun}
        />
        <CancelOnboardingDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          steps={steps}
          onConfirm={() => { setCancelOpen(false); onCancel(record); }}
        />
      </SheetContent>
    </Sheet>
  );
}