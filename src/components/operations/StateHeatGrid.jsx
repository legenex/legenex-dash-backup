import React, { useState } from 'react';

// A fixed SVG tile cartogram of the 50 US states in the familiar two row
// (grid) layout. Colour is by coverage tier, never by margin. Data comes from
// the operationsData state_grid payload; anything not present renders as the
// muted inactive tone.

// [code, col, row] on a 11 col x 8 row grid. Classic tilegram positions.
const LAYOUT = [
  ['AK', 0, 0], ['ME', 10, 0],
  ['VT', 9, 1], ['NH', 10, 1],
  ['WA', 0, 1], ['ID', 1, 1], ['MT', 2, 1], ['ND', 3, 1], ['MN', 4, 1], ['IL', 5, 1], ['WI', 5, 0], ['MI', 6, 1], ['NY', 8, 1], ['MA', 9, 2], ['RI', 10, 2],
  ['OR', 0, 2], ['NV', 1, 2], ['WY', 2, 2], ['SD', 3, 2], ['IA', 4, 2], ['IN', 6, 2], ['OH', 7, 2], ['PA', 8, 2], ['NJ', 9, 3], ['CT', 10, 3],
  ['CA', 0, 3], ['UT', 1, 3], ['CO', 2, 3], ['NE', 3, 3], ['MO', 4, 3], ['KY', 5, 3], ['WV', 6, 3], ['VA', 7, 3], ['MD', 8, 3], ['DE', 9, 4],
  ['AZ', 1, 4], ['NM', 2, 4], ['KS', 3, 4], ['AR', 4, 4], ['TN', 5, 4], ['NC', 6, 4], ['SC', 7, 4], ['DC', 8, 4],
  ['OK', 3, 5], ['LA', 4, 5], ['MS', 5, 5], ['AL', 6, 5], ['GA', 7, 5],
  ['HI', 0, 6], ['TX', 3, 6], ['FL', 8, 6],
];

const COLS = 11;
const ROWS = 7;
const CELL = 40;
const GAP = 4;

// Tier -> token class. Positive for Law Firm, teal for Aggregator, warning for
// Reseller/Network, muted grey for inactive.
function tierFill(active, tier) {
  if (!active) return 'hsl(var(--muted-foreground) / 0.18)';
  switch (tier) {
    case 'Law Firm': return 'hsl(152 65% 54% / 0.85)';
    case 'Aggregator': return 'hsl(var(--chart-1))';
    case 'Reseller':
    case 'Network': return 'hsl(38 80% 57% / 0.9)';
    default: return 'hsl(var(--chart-1))';
  }
}

const LEGEND = [
  { label: 'Law Firm', fill: 'hsl(152 65% 54% / 0.85)' },
  { label: 'Aggregator', fill: 'hsl(var(--chart-1))' },
  { label: 'Reseller / Network', fill: 'hsl(38 80% 57% / 0.9)' },
  { label: 'Inactive', fill: 'hsl(var(--muted-foreground) / 0.18)' },
];

function money(n) {
  if (n == null) return null;
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function StateHeatGrid({ grid = [], activeCount = 0, onSelect }) {
  const [hover, setHover] = useState(null);
  const byState = {};
  for (const g of grid) byState[g.state] = g;

  const width = COLS * (CELL + GAP);
  const height = ROWS * (CELL + GAP);

  return (
    <div className="rounded-[10px] border border-border bg-card p-5">
      {/* Legend + active count */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-3 h-3 rounded-[3px]" style={{ background: l.fill }} />
              {l.label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          <span className="font-mono tabular-nums font-semibold text-foreground">{activeCount}</span> active states
        </span>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[520px] mx-auto" style={{ height: 'auto' }}>
          {LAYOUT.map(([code, col, row]) => {
            const g = byState[code];
            const active = !!g?.active;
            const fill = tierFill(active, g?.effective_client_type);
            const x = col * (CELL + GAP);
            const y = row * (CELL + GAP);
            const cpl = g && g.highest_cpl != null ? g.highest_cpl : null;
            return (
              <g
                key={code}
                transform={`translate(${x},${y})`}
                className="cursor-pointer"
                onMouseEnter={() => setHover({ code, g })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(code)}
              >
                <rect
                  width={CELL}
                  height={CELL}
                  rx={5}
                  fill={fill}
                  stroke="hsl(var(--border))"
                  strokeWidth={hover?.code === code ? 2 : 1}
                  className="transition-all"
                />
                <text x={CELL / 2} y={CELL / 2 - 2} textAnchor="middle" className="fill-foreground" style={{ fontSize: 11, fontWeight: 700 }}>
                  {code}
                </text>
                {cpl != null && (
                  <text x={CELL / 2} y={CELL / 2 + 11} textAnchor="middle" className="fill-foreground/80" style={{ fontSize: 8.5, fontFamily: 'var(--font-mono)' }}>
                    {money(cpl)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hover?.g && (
          <div className="absolute top-0 right-0 rounded-lg border border-border bg-popover px-3 py-2 text-[11px] shadow-lg pointer-events-none">
            <div className="font-semibold text-foreground text-[12px] mb-1">{hover.code}</div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <span>Highest CPL</span>
              <span className="font-mono tabular-nums text-foreground">{money(hover.g.highest_cpl) ?? 'n/a'}</span>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <span>Lowest CPL</span>
              <span className="font-mono tabular-nums text-foreground">{money(hover.g.lowest_cpl) ?? 'n/a'}</span>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <span>Active buyers</span>
              <span className="font-mono tabular-nums text-foreground">{hover.g.active_buyer_count ?? 0}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}