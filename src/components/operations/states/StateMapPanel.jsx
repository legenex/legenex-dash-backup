import React from 'react';
import StateTileMap from './StateTileMap';
import { TIER_LEGEND } from './stateMetrics';

// A muted summary chip.
function SummaryChip({ label, value }) {
  return (
    <span className="text-[11px] text-muted-foreground">
      <span className="font-mono tabular-nums font-semibold text-foreground">{value}</span> {label}
    </span>
  );
}

export default function StateMapPanel({ statusMap, metric, cplBounds, selected, onSelect, summary, buyerScoped }) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-5">
      {/* Legend (tier only) + summary line */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {metric === 'tier' ? (
            TIER_LEGEND.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="w-3 h-3 rounded-[3px]" style={{ background: l.fill }} />
                {l.label}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
              Low
              <span className="h-3 w-24 rounded-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.95))' }} />
              High
              <span className="inline-flex items-center gap-1.5 ml-2">
                <span className="w-3 h-3 rounded-[3px]" style={{ background: 'hsl(var(--muted-foreground) / 0.18)' }} />
                Inactive
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4">
        <SummaryChip label="covered" value={summary.covered} />
        <SummaryChip label="Law Firm" value={summary['Law Firm']} />
        <SummaryChip label="Aggregator" value={summary.Aggregator} />
        <SummaryChip label="Reseller" value={summary.Reseller} />
        <SummaryChip label="Network" value={summary.Network} />
        <SummaryChip label="inactive" value={summary.inactive} />
      </div>

      {buyerScoped && (
        <p className="text-[11px] text-muted-foreground mb-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          Showing this buyer's own coverage, not the resolved state tier. Colours reflect the buyer's client type and its CPL in each state.
        </p>
      )}

      <StateTileMap
        statusMap={statusMap}
        metric={metric}
        cplBounds={cplBounds}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}