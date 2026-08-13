import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck, Trophy, Ban, AlertTriangle, ArrowRight, Layers, DollarSign,
} from 'lucide-react';

// Renders a route-simulation result. Shared by both the Live config tab (backend
// distributionSimulate) and the What-if JSON tab (client-side simulateRoute), which
// both return the same decision/explanation shape. Purely presentational: it never
// sends, reserves, or bills anything.

const fmtPrice = (p) =>
  p == null || Number.isNaN(Number(p)) ? '' : `$${Number(p).toFixed(2)}`;

function Field({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/70">{label}</div>
      <div className={`text-[13px] text-foreground mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>
        {value == null || value === '' ? <span className="text-muted-foreground">--</span> : value}
      </div>
    </div>
  );
}

export default function SimulatorResult({ result }) {
  if (!result) return null;

  const decision = result.decision || {};
  const explanation = Array.isArray(result.explanation) ? result.explanation : [];
  const configErrors = Array.isArray(result.configErrors)
    ? result.configErrors
    : (result.configErrors ? [result.configErrors] : []);
  const hasWinner = decision.winnerMemberId != null;

  return (
    <div className="space-y-4">
      {/* Simulation-only banner */}
      <div
        role="status"
        className="flex items-start gap-2.5 rounded-[10px] border border-primary/40 bg-primary/[0.12] px-4 py-3"
      >
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <div className="text-[13px] text-foreground">
          <span className="font-semibold">Simulation only</span> - nothing was sent, reserved, or billed.
        </div>
      </div>

      {/* Config meta */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {result.configVersion != null && (
          <span className="inline-flex items-center gap-1.5 text-[11px]">
            <Layers className="w-3.5 h-3.5 text-muted-foreground/70" />
            <span className="uppercase tracking-wide text-muted-foreground/60">Config version</span>
            <span className="font-mono tabular-nums font-semibold text-foreground">{String(result.configVersion)}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-[11px]">
          <span className="uppercase tracking-wide text-muted-foreground/60">Side effects</span>
          <span className="font-mono font-semibold status-sold">{result.sideEffects || 'none'}</span>
        </span>
      </div>

      {/* Config errors */}
      {configErrors.length > 0 && (
        <div className="rounded-[10px] border border-status-error bg-status-error p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="w-4 h-4 status-error" />
            <div className="text-[12px] font-semibold uppercase tracking-wider status-error">Config errors</div>
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {configErrors.map((err, i) => (
              <li key={i} className="text-[13px] status-error">
                {typeof err === 'string' ? err : (err?.message || JSON.stringify(err))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Decision */}
      {hasWinner ? (
        <div className="rounded-[10px] border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 status-sold" />
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Decision</div>
            <Badge className="ml-auto bg-status-sold status-sold border-0 text-[10px]">Winner</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <Field label="Winning member" value={decision.winnerMemberId} mono />
            <Field label="Buyer" value={decision.buyerId} mono />
            <Field label="Group" value={decision.groupId} mono />
            <Field label="Method" value={decision.method} />
            <Field
              label="Price"
              value={
                decision.price == null ? null : (
                  <span className="inline-flex items-center gap-1 status-sold font-semibold">
                    <DollarSign className="w-3.5 h-3.5" />{fmtPrice(decision.price).replace('$', '')}
                  </span>
                )
              }
            />
          </div>
          {Array.isArray(decision.fallthroughPath) && decision.fallthroughPath.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/70 mb-2">Fall-through path</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {decision.fallthroughPath.map((step, i) => (
                  <React.Fragment key={i}>
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                      {typeof step === 'string' ? step : JSON.stringify(step)}
                    </span>
                    {i < decision.fallthroughPath.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-card p-8 text-center">
          <Ban className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <div className="text-[13px] font-medium text-foreground">No eligible member</div>
          <div className="text-[12px] text-muted-foreground mt-1">
            {decision.reason
              ? <>Reason: <span className="font-mono">{String(decision.reason)}</span></>
              : 'This lead would not have routed to any buyer under the evaluated config.'}
          </div>
        </div>
      )}

      {/* Per-group candidate tables */}
      {explanation.length > 0 && (
        <div className="space-y-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Candidate breakdown</div>
          {explanation.map((grp, gi) => (
            <div key={grp.groupId ?? gi} className="rounded-[10px] border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
                <span className="text-[13px] font-semibold text-foreground font-mono">{grp.groupId ?? `Group ${gi + 1}`}</span>
                {grp.method && (
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{grp.method}</Badge>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Member</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(grp.candidates || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-[13px] text-muted-foreground">No candidates in this group.</td>
                      </tr>
                    ) : (
                      grp.candidates.map((c, ci) => (
                        <tr key={c.memberId ?? ci} className="hover:bg-accent/40 transition-colors">
                          <td className="px-4 py-2.5 text-[13px] font-mono text-foreground">{c.memberId ?? '--'}</td>
                          <td className="px-4 py-2.5">
                            {c.eligible ? (
                              <Badge className="bg-status-sold status-sold border-0 text-[10px]">Eligible</Badge>
                            ) : (
                              <Badge className="bg-status-error status-error border-0 text-[10px]">Excluded</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                            {c.reasonText || c.reason || '--'}
                          </td>
                          <td className="px-4 py-2.5 text-[13px] text-right font-mono tabular-nums text-foreground">
                            {c.price == null ? '--' : fmtPrice(c.price)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
