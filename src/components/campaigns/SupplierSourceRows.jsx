import React from 'react';
import { parseRules } from '@/components/operations/suppliers/tierRules';

const MODEL_TONE = {
  none: 'tag-neutral',
  revenue_pct: 'bg-status-queued status-queued',
  profit_pct: 'bg-status-duplicate status-duplicate',
  flat_cpl: 'bg-status-sold status-sold',
  tiered: 'bg-primary/15 text-primary',
};

// Human readable effective price summary for one source.
// 'rev_share' is not a value the schema can hold, so testing for it sent every
// Revenue % and Profit % source to the "No CPL" label.
function priceSummary(src) {
  if (src.pricing_model === 'revenue_pct') return `${src.revenue_pct == null ? 0 : src.revenue_pct}% of revenue`;
  if (src.pricing_model === 'profit_pct') return `${src.profit_pct == null ? 0 : src.profit_pct}% of profit`;
  if (src.pricing_model === 'flat_cpl') return `$${Number(src.flat_cpl == null ? 0 : src.flat_cpl).toFixed(2)} per lead`;
  if (src.pricing_model === 'tiered') { const n = parseRules(src.tier_rules).length; return `${n} rule${n === 1 ? '' : 's'}`; }
  return 'No CPL';
}

// Expanded detail strip under a supplier row: one line per source, plus a note
// when the supplier has no sources.
export default function SupplierSourceRows({ sources, supplier }) {
  if (!sources || sources.length === 0) {
    return (
      <div className="px-6 py-3 text-[12px] text-muted-foreground">
        No sources. Leads attribute to the supplier directly using the supplier level payout
        {supplier?.payout_type && supplier.payout_type !== 'None' ? ` (${supplier.payout_type})` : ' (None)'}.
      </div>
    );
  }
  return (
    <div className="px-6 py-2 space-y-1.5">
      {sources.map((src) => (
        <div key={src.id} className="flex items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-2">
          <span className="font-mono text-[12px] text-foreground min-w-[140px] truncate">
            {src.source_code || <span className="text-muted-foreground">no ssid</span>}
          </span>
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MODEL_TONE[src.pricing_model] || 'tag-neutral'}`}>
            {src.pricing_model}
          </span>
          {src.brand && <span className="text-[11px] text-muted-foreground">brand: <span className="text-foreground">{src.brand}</span></span>}
          <span className="text-[11px] text-muted-foreground font-mono tabular-nums ml-auto">{priceSummary(src)}</span>
          {src.active === false && <span className="tag-neutral rounded px-1.5 py-0.5 text-[10px]">Paused</span>}
        </div>
      ))}
    </div>
  );
}