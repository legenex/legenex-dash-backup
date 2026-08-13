import React from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import StatusPill from '@/components/shared/StatusPill';
import { runBillingPreview, money, integer } from './billingApi';

// Variance cell. revenue_variance = contracted_gross minus captured_revenue.
// A negative variance means contracted gross is below what LeadByte recorded,
// so the buyer was billed less than LeadByte captured. We label direction
// plainly and colour the two directions differently.
function VarianceCell({ variance }) {
  const v = variance?.revenue_variance;
  if (v == null || !Number.isFinite(Number(v))) {
    return <span className="text-[12px] text-muted-foreground">No value</span>;
  }
  const num = Number(v);
  if (num === 0) {
    return <span className="text-[12px] font-mono text-muted-foreground">0.00</span>;
  }
  const billedLess = num < 0;
  const cls = billedLess ? 'status-error' : 'status-sold';
  return (
    <span className={`text-[12px] font-mono ${cls}`}>
      {money(Math.abs(num))}
      <span className="ml-1 text-[10px] font-sans">
        {billedLess ? 'billed under capture' : 'billed over capture'}
      </span>
    </span>
  );
}

export function honestyTotals(previews) {
  return previews.reduce((acc, p) => {
    if (!p) return acc;
    acc.unpriced += p.unpriced_leads || 0;
    acc.unattributed += p.unattributed_leads || 0;
    acc.multiBuyer += p.multi_buyer_suspected || 0;
    return acc;
  }, { unpriced: 0, unattributed: 0, multiBuyer: 0 });
}

function HonestyStrip({ totals }) {
  const { unpriced, unattributed, multiBuyer } = totals;
  if (unpriced === 0 && unattributed === 0 && multiBuyer === 0) return null;
  return (
    <div className="rounded-lg border border-[hsl(38_80%_57%)]/40 bg-[hsl(38_80%_57%)]/10 p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-[12px] font-semibold status-unsold">
        <AlertTriangle className="w-4 h-4" /> These totals are not the whole picture
      </div>
      {unpriced > 0 && (
        <p className="text-[11.5px] text-foreground/90">
          <span className="font-mono font-semibold">{integer(unpriced)}</span> unpriced leads have no BuyerStateCpl row or matching BuyerCplRule and were excluded from the total.
        </p>
      )}
      {unattributed > 0 && (
        <p className="text-[11.5px] text-foreground/90">
          <span className="font-mono font-semibold">{integer(unattributed)}</span> unattributed sold leads carry no buyer_id.
        </p>
      )}
      {multiBuyer > 0 && (
        <p className="text-[11.5px] text-foreground/90">
          <span className="font-mono font-semibold">{integer(multiBuyer)}</span> multi buyer suspected leads carry more captured revenue than the contracted unit price for their attributed buyer.
        </p>
      )}
    </div>
  );
}

export default function DailyQueuePanel({
  buyers, periodStart, periodEnd, onGenerate, onGenerateAll, onPreviews, generatingAll,
}) {
  const results = useQueries({
    queries: buyers.map((b) => ({
      queryKey: ['daily-preview', b.id, periodStart, periodEnd],
      queryFn: () => runBillingPreview({
        scope: 'buyer', buyerId: b.id, periodStart, periodEnd, commit: false,
      }),
      staleTime: 30_000,
    })),
  });

  const previewByBuyer = React.useMemo(() => {
    const map = {};
    buyers.forEach((b, i) => { map[b.id] = results[i]?.data; });
    return map;
  }, [buyers, results]);

  const previews = React.useMemo(
    () => buyers.map((b) => previewByBuyer[b.id]).filter(Boolean),
    [buyers, previewByBuyer],
  );

  // Report previews up so the parent can total net and count draft candidates.
  React.useEffect(() => { onPreviews?.(previewByBuyer); }, [previewByBuyer, onPreviews]);

  const totals = React.useMemo(() => honestyTotals(previews), [previews]);

  if (buyers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="text-[14px] font-medium text-foreground">No buyers are on daily invoicing</div>
        <p className="text-[12px] text-muted-foreground mt-1.5 max-w-md mx-auto">
          This panel lists buyers whose billing type is invoiced daily, so it fills in as soon as a buyer is set to bill each day.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onGenerateAll} disabled={generatingAll}>
          {generatingAll ? 'Generating all drafts...' : 'Generate all drafts'}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[10.5px] uppercase tracking-wider text-muted-foreground/70">
                <th className="px-4 py-2.5 font-semibold">Buyer</th>
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Client type</th>
                <th className="px-4 py-2.5 font-semibold text-right">Total leads</th>
                <th className="px-4 py-2.5 font-semibold text-right">Returns</th>
                <th className="px-4 py-2.5 font-semibold text-right">Billable</th>
                <th className="px-4 py-2.5 font-semibold text-right">Gross</th>
                <th className="px-4 py-2.5 font-semibold text-right">IPL fees</th>
                <th className="px-4 py-2.5 font-semibold text-right">Net</th>
                <th className="px-4 py-2.5 font-semibold">Variance</th>
                <th className="px-4 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {buyers.map((b) => {
                const p = previewByBuyer[b.id];
                const t = p?.totals;
                const loading = p == null;
                return (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 text-[13px] text-foreground">{b.company_name || 'Buyer'}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-muted-foreground">{b.buyer_code || 'No value'}</td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{b.client_type || 'Unclassified'}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-right text-foreground">{loading ? '...' : integer(t?.total_leads)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-right text-foreground">{loading ? '...' : integer(t?.returns)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-right text-foreground">{loading ? '...' : integer(t?.billable_leads)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-right text-foreground">{loading ? '...' : money(t?.gross)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-right text-foreground">{loading ? '...' : money(t?.ipl_fees)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-right font-semibold text-foreground">{loading ? '...' : money(t?.net)}</td>
                    <td className="px-4 py-2.5">{loading ? <span className="text-[12px] text-muted-foreground">...</span> : <VarianceCell variance={p?.revenue_variance} />}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="default" disabled={loading || generatingAll} onClick={() => onGenerate(b, p)}>
                        Generate invoice
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <HonestyStrip totals={totals} />
    </div>
  );
}