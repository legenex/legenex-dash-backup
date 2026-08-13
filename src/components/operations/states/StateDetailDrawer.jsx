import React from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import BuyerStatusPill from '@/components/operations/buyers/BuyerStatusPill';
import { money } from './stateMetrics';
import { buyersInState, resolveWinner } from './activeStatesModel';

// Right side drawer for a single state, using the same Sheet shell as the buyer
// and supplier drawers. Lists every buyer with a BuyerStateCpl row in this
// state and makes clear which ones are excluded from tier resolution and why.
export default function StateDetailDrawer({ open, onOpenChange, state, vertical, cplRows, buyers, status }) {
  if (!state) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 bg-background" />
      </Sheet>
    );
  }

  const rows = buyersInState(state, vertical, cplRows, buyers);
  const winner = resolveWinner(state, vertical, cplRows, buyers, status);
  const active = !!status?.active;

  const iplFor = (buyer, cpl) => Number(cpl || 0) * Number(buyer?.ipl_fee_pct ?? 1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0 bg-background">
        <div className="border-b border-border px-6 pt-6 pb-5">
          <div className="flex items-start gap-3 pr-8">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold text-foreground">
                <span className="font-mono">{state}</span>
                <span className="text-muted-foreground/70 font-normal"> / {vertical}</span>
              </h2>
              <div className="flex items-center gap-2 mt-1 text-[12px]">
                {active ? (
                  <>
                    <span className="text-foreground">{status.effective_client_type || 'Covered'}</span>
                    <span className="text-muted-foreground/40">|</span>
                    <span className="font-mono text-muted-foreground">{money(status.lowest_cpl)} to {money(status.highest_cpl)}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not covered</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[12px]">
            {active && winner ? (
              <span className="text-muted-foreground">
                Resolved tier <span className="font-semibold text-foreground">{status.effective_client_type}</span>, won by{' '}
                <span className="font-semibold text-foreground">{winner.buyer.company_name}</span>
                {winner.buyer.buyer_code ? <span className="font-mono text-muted-foreground"> ({winner.buyer.buyer_code})</span> : null}
                {' '}at <span className="font-mono text-foreground">{money(winner.row.cpl)}</span>.
              </span>
            ) : (
              <span className="text-muted-foreground">No active, qualifying buyer covers this state, so no tier is resolved.</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Buyers in this state
          </div>

          {rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No buyer has a price row for this state.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {rows.map(({ row, buyer, counts }) => {
                const excludedReason = counts
                  ? null
                  : !row.active
                    ? 'State row inactive'
                    : `Buyer status is ${buyer.status || 'not active'}`;
                return (
                  <div
                    key={row.id}
                    className={`rounded-[10px] border px-4 py-3 ${counts ? 'border-border bg-card' : 'border-border/60 bg-muted/30'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-medium truncate ${counts ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {buyer.company_name || 'Buyer'}
                          </span>
                          {winner && winner.row.id === row.id && (
                            <span className="rounded-full bg-status-sold status-sold px-2 py-0.5 text-[10px] font-semibold">Winner</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                          <span className="font-mono">{buyer.buyer_code || 'No code'}</span>
                          <span className="text-muted-foreground/40">|</span>
                          <span>{buyer.client_type || 'Unclassified'}</span>
                        </div>
                      </div>
                      <BuyerStatusPill status={buyer.status} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CPL</div>
                        <div className="font-mono tabular-nums text-[13px] text-foreground">{money(row.cpl)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">IPL</div>
                        <div className="font-mono tabular-nums text-[13px] text-foreground">{money(iplFor(buyer, row.cpl))}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">State Row</div>
                        <div className={`text-[13px] font-medium ${row.active ? 'status-sold' : 'text-muted-foreground'}`}>
                          {row.active ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                    </div>

                    {excludedReason && (
                      <p className="mt-2.5 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
                        Excluded from tier resolution: {excludedReason}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}