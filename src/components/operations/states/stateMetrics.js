// Metric definitions and colour logic for the Active States map. Kept separate
// from the model so the tile grid and legend share one source of truth.

export const METRICS = [
  { key: 'tier', label: 'Coverage tier' },
  { key: 'highest_cpl', label: 'Highest CPL' },
  { key: 'lowest_cpl', label: 'Lowest CPL' },
];

export const CLIENT_TYPES = ['Law Firm', 'Aggregator', 'Reseller', 'Network', 'Test'];

// Tier -> token colour. Positive token for Law Firm, teal for Aggregator,
// warning token for Reseller and Network, muted grey for inactive.
const TIER_FILL = {
  'Law Firm': 'hsl(152 65% 54% / 0.9)',
  Aggregator: 'hsl(var(--chart-1))',
  Reseller: 'hsl(38 80% 57% / 0.9)',
  Network: 'hsl(38 80% 57% / 0.9)',
};

const INACTIVE_FILL = 'hsl(var(--muted-foreground) / 0.18)';

export const TIER_LEGEND = [
  { label: 'Law Firm', fill: TIER_FILL['Law Firm'] },
  { label: 'Aggregator', fill: TIER_FILL.Aggregator },
  { label: 'Reseller and Network', fill: TIER_FILL.Reseller },
  { label: 'Inactive', fill: INACTIVE_FILL },
];

export function money(n) {
  if (n == null) return null;
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// The label shown beneath the state code for the selected metric.
export function metricValueLabel(metric, status) {
  if (!status || !status.active) return null;
  if (metric === 'tier') return null; // tier is conveyed by colour only
  const v = metric === 'highest_cpl' ? status.highest_cpl : status.lowest_cpl;
  return money(v);
}

// Fill colour for a state under the selected metric. Inactive states are always
// muted grey regardless of metric.
export function metricFill(metric, status, cplBounds) {
  if (!status || !status.active) return INACTIVE_FILL;
  if (metric === 'tier') {
    return TIER_FILL[status.effective_client_type] || 'hsl(var(--chart-1))';
  }
  const v = metric === 'highest_cpl' ? Number(status.highest_cpl) : Number(status.lowest_cpl);
  const { min, max } = cplBounds;
  if (!Number.isFinite(v) || max <= min) return 'hsl(var(--chart-1))';
  const t = (v - min) / (max - min); // 0..1
  // Continuous scale from cool (low) to accent (high).
  const alpha = 0.3 + t * 0.65;
  return `hsl(var(--primary) / ${alpha.toFixed(3)})`;
}

// Min/max across active states for the given metric, used to scale the CPL maps.
export function cplBoundsFor(metric, statusMap) {
  const vals = [];
  for (const s of Object.values(statusMap)) {
    if (!s?.active) continue;
    const v = metric === 'lowest_cpl' ? Number(s.lowest_cpl) : Number(s.highest_cpl);
    if (Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

// Coverage summary counts for the line above the map.
export function coverageSummary(statusMap, allStates) {
  const summary = { covered: 0, 'Law Firm': 0, Aggregator: 0, Reseller: 0, Network: 0, inactive: 0 };
  for (const code of allStates) {
    const s = statusMap[code];
    if (s?.active) {
      summary.covered += 1;
      const t = s.effective_client_type;
      if (t && summary[t] != null) summary[t] += 1;
    } else {
      summary.inactive += 1;
    }
  }
  return summary;
}