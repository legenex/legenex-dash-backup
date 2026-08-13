import React from 'react';
import { useQueries } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import StatusPill from '@/components/shared/StatusPill';
import { runBillingPreview, toReginaDateString, money, integer } from './billingApi';

// Compute the trailing 7 day rate and projected exhaustion for one buyer from
// seven single-day generateBillingRun previews (commit false, writes nothing).
// Returns rate and the count of days that carried any billable leads so the
// caller can enforce the "not enough history" rule.
function trailingDays() {
  const days = [];
  // Trailing 7 days ending yesterday, so today's partial day never skews a rate.
  for (let i = 7; i >= 1; i -= 1) {
    const d = subDays(new Date(), i);
    days.push(toReginaDateString(d));
  }
  return days;
}

function ExhaustionCell({ preview, leadsRemaining }) {
  // preview: array of seven daily result objects (or undefined while loading).
  if (!preview) {
    return <span className="text-[12px] text-muted-foreground">Computing...</span>;
  }
  const daysWithLeads = preview.filter((p) => (p?.totals?.billable_leads || 0) > 0).length;
  const totalBillable = preview.reduce((s, p) => s + (p?.totals?.billable_leads || 0), 0);

  // The rate is only trustworthy with at least three active days. Below that we
  // refuse to render a date and never substitute a zero or a dash.
  if (daysWithLeads < 3) {
    return <span className="text-[12px] text-muted-foreground">Not enough delivery history to project</span>;
  }
  const ratePerDay = totalBillable / 7;
  if (ratePerDay <= 0 || leadsRemaining == null || !Number.isFinite(Number(leadsRemaining))) {
    return <span className="text-[12px] text-muted-foreground">Not enough delivery history to project</span>;
  }
  const daysLeft = Number(leadsRemaining) / ratePerDay;
  const date = subDays(new Date(), -Math.ceil(daysLeft));
  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <span className="text-[12px] font-mono text-foreground">
      {label} <span className="text-muted-foreground">({Math.ceil(daysLeft)}d)</span>
    </span>
  );
}

// Returns the projected days-left for a buyer, or null when it cannot be
// computed honestly. Shared by the row accent and the low-balance tile count.
export function projectedDaysLeft(preview, leadsRemaining) {
  if (!preview) return null;
  const daysWithLeads = preview.filter((p) => (p?.totals?.billable_leads || 0) > 0).length;
  if (daysWithLeads < 3) return null;
  const totalBillable = preview.reduce((s, p) => s + (p?.totals?.billable_leads || 0), 0);
  const ratePerDay = totalBillable / 7;
  if (ratePerDay <= 0 || leadsRemaining == null || !Number.isFinite(Number(leadsRemaining))) return null;
  return Number(leadsRemaining) / ratePerDay;
}

function RateCell({ preview }) {
  if (!preview) return <span className="text-[12px] text-muted-foreground">...</span>;
  const totalBillable = preview.reduce((s, p) => s + (p?.totals?.billable_leads || 0), 0);
  const perDay = totalBillable / 7;
  const totalGross = preview.reduce((s, p) => s + (p?.totals?.gross || 0), 0);
  const grossPerDay = totalGross / 7;
  return (
    <span className="text-[12px] font-mono text-foreground">
      {perDay.toFixed(1)} <span className="text-muted-foreground">leads/day</span>
      {grossPerDay > 0 && <span className="text-muted-foreground"> · {money(grossPerDay)}/day</span>}
    </span>
  );
}

export default function PrepayWatchPanel({ buyers, onTopUp, onPreviews }) {
  const days = React.useMemo(() => trailingDays(), []);

  // One query per buyer, each fetching seven daily previews. useQueries keeps
  // them cached and parallel-safe without a manual effect loop.
  const results = useQueries({
    queries: buyers.map((b) => ({
      queryKey: ['prepay-trailing', b.id, days[0], days[days.length - 1]],
      queryFn: async () => {
        const out = [];
        for (const day of days) {
          // Sequential per buyer keeps backend load sane; days are cheap.
          // eslint-disable-next-line no-await-in-loop
          const r = await runBillingPreview({
            scope: 'buyer', buyerId: b.id, periodStart: day, periodEnd: day, commit: false,
          });
          out.push(r);
        }
        return out;
      },
      staleTime: 60_000,
    })),
  });

  const previewByBuyer = React.useMemo(() => {
    const map = {};
    buyers.forEach((b, i) => { map[b.id] = results[i]?.data; });
    return map;
  }, [buyers, results]);

  // Report projected-days-left up so the parent can count low balances for the tile.
  React.useEffect(() => {
    const summary = {};
    buyers.forEach((b) => {
      summary[b.id] = projectedDaysLeft(previewByBuyer[b.id], b.prepay_leads_remaining);
    });
    onPreviews?.(summary);
  }, [buyers, previewByBuyer, onPreviews]);

  if (buyers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="text-[14px] font-medium text-foreground">No buyers are on prepay</div>
        <p className="text-[12px] text-muted-foreground mt-1.5 max-w-md mx-auto">
          This panel watches buyers whose billing type is prepay, so it fills in as soon as a buyer is set to pay upfront.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-[10.5px] uppercase tracking-wider text-muted-foreground/70">
              <th className="px-4 py-2.5 font-semibold">Buyer</th>
              <th className="px-4 py-2.5 font-semibold">Code</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Prepay balance</th>
              <th className="px-4 py-2.5 font-semibold text-right">Leads remaining</th>
              <th className="px-4 py-2.5 font-semibold">Trailing 7 day rate</th>
              <th className="px-4 py-2.5 font-semibold">Projected exhaustion</th>
              <th className="px-4 py-2.5 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => {
              const preview = previewByBuyer[b.id];
              const daysLeft = projectedDaysLeft(preview, b.prepay_leads_remaining);
              const critical = daysLeft != null && daysLeft <= 3;
              return (
                <tr
                  key={b.id}
                  className={`border-b border-border/60 last:border-0 ${critical ? 'bg-primary/10' : ''}`}
                >
                  <td className="px-4 py-2.5 text-[13px] text-foreground">{b.company_name || 'Buyer'}</td>
                  <td className="px-4 py-2.5 text-[12px] font-mono text-muted-foreground">{b.buyer_code || 'No value'}</td>
                  <td className="px-4 py-2.5"><StatusPill status={b.status} /></td>
                  <td className="px-4 py-2.5 text-[12px] font-mono text-right text-foreground">
                    {money(b.prepay_balance) != null ? money(b.prepay_balance) : 'No value'}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] font-mono text-right text-foreground">
                    {integer(b.prepay_leads_remaining) != null ? integer(b.prepay_leads_remaining) : 'No value'}
                  </td>
                  <td className="px-4 py-2.5"><RateCell preview={preview} /></td>
                  <td className="px-4 py-2.5"><ExhaustionCell preview={preview} leadsRemaining={b.prepay_leads_remaining} /></td>
                  <td className="px-4 py-2.5 text-right">
                    {critical ? (
                      <Button size="sm" variant="default" onClick={() => onTopUp(b, preview)}>Top up</Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60">No action</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}