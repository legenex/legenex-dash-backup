import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Loader2, XCircle, MinusCircle, RotateCcw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { STEP_LABELS, firstFailedStep } from './onboardingModel';

// A status icon per step state.
function StepIcon({ status }) {
  if (status === 'complete') return <CheckCircle2 className="w-4 h-4 status-sold" />;
  if (status === 'running') return <Loader2 className="w-4 h-4 status-unsold animate-spin" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-primary" />;
  if (status === 'skipped') return <MinusCircle className="w-4 h-4 text-muted-foreground" />;
  return <Circle className="w-4 h-4 text-muted-foreground/50" />;
}

// Render the external side effect for a step, so an operator can verify in the
// remote system that what the rail claims actually exists.
function SideEffect({ step, buyer }) {
  const id = step.external_id;
  if (step.key === 'create_buyer' && buyer) {
    return (
      <Link to={`/buyers/${buyer.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
        <ExternalLink className="w-3 h-3" /> View buyer record
      </Link>
    );
  }
  if (step.key === 'stripe_customer' && id) {
    return <span className="font-mono text-[11px] text-muted-foreground break-all">Customer {id}</span>;
  }
  if (step.key === 'deposit_invoice' && id) {
    const link = buyer?.payment_link_url;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[11px] text-muted-foreground break-all">Invoice {id}</span>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline break-all">
            <ExternalLink className="w-3 h-3" /> Rebrandly link
          </a>
        )}
      </div>
    );
  }
  if (step.key === 'leadbyte_buyer' && id) {
    return <span className="font-mono text-[11px] text-muted-foreground break-all">bid {id}</span>;
  }
  if (id) {
    return <span className="font-mono text-[11px] text-muted-foreground break-all">{id}</span>;
  }
  return null;
}

export default function StepRail({ steps, buyer, running, onRetryStep }) {
  const failed = firstFailedStep(steps);

  return (
    <div className="space-y-1">
      {steps.map((step, idx) => {
        const isFirstFailed = failed && failed.key === step.key;
        const label = STEP_LABELS[step.key] || step.key;
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.key} className="flex gap-3">
            {/* Rail spine */}
            <div className="flex flex-col items-center">
              <div className="mt-0.5"><StepIcon status={step.status} /></div>
              {!isLast && <div className="w-px flex-1 bg-border my-1" />}
            </div>

            <div className="flex-1 pb-3 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[13px] font-medium ${step.status === 'skipped' ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {label}
                </span>
                {step.attempts > 0 && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {step.attempts} {step.attempts === 1 ? 'attempt' : 'attempts'}
                  </span>
                )}
              </div>

              {/* Skip reason in muted text */}
              {step.status === 'skipped' && step.error && (
                <div className="text-[11px] text-muted-foreground mt-1">Skipped because {step.error}</div>
              )}

              {/* Failure error text */}
              {step.status === 'failed' && step.error && (
                <div className="text-[11px] text-primary mt-1 break-words">{step.error}</div>
              )}

              {/* External side effect legibility */}
              {(step.status === 'complete' || step.status === 'skipped') && (
                <div className="mt-1"><SideEffect step={step} buyer={buyer} /></div>
              )}

              {/* Retry controls on a failed step */}
              {step.status === 'failed' && (
                <div className="mt-2 space-y-1.5">
                  <Button size="sm" variant="outline" disabled={running} onClick={() => onRetryStep(step.key)} className="gap-1.5 h-7 text-[12px]">
                    <RotateCcw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} /> Retry this step
                  </Button>
                  {isFirstFailed && (
                    <div>
                      <Button size="sm" variant="default" disabled={running} onClick={() => onRetryStep(step.key)} className="gap-1.5 h-7 text-[12px]">
                        <RotateCcw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} /> Retry from here
                      </Button>
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    Retry resumes from this step. Steps already complete that hold an external id are not repeated,
                    so no duplicate Stripe customer, Xero contact or LeadByte buyer is created.
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}