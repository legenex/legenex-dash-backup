import React, { useState } from 'react';
import { metricFill, metricValueLabel, money } from './stateMetrics';

// Fixed SVG tile cartogram of the 50 states plus DC in the familiar two row
// layout, matching the tile grid on the Operations Dashboard. Colours by the
// selected metric; each tile shows the state code and the metric value beneath.
// [code, col, row] on an 11 col grid. Same positions as StateHeatGrid.
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

export default function StateTileMap({ statusMap, metric, cplBounds, selected, onSelect }) {
  const [hover, setHover] = useState(null);
  const width = COLS * (CELL + GAP);
  const height = ROWS * (CELL + GAP);

  return (
    <div className="relative w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[560px] mx-auto" style={{ height: 'auto' }}>
        {LAYOUT.map(([code, col, row]) => {
          const s = statusMap[code];
          const fill = metricFill(metric, s, cplBounds);
          const x = col * (CELL + GAP);
          const y = row * (CELL + GAP);
          const valueLabel = metricValueLabel(metric, s);
          const isSelected = selected === code;
          const isHover = hover?.code === code;
          return (
            <g
              key={code}
              transform={`translate(${x},${y})`}
              className="cursor-pointer"
              onMouseEnter={() => setHover({ code, s })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(code)}
            >
              <rect
                width={CELL}
                height={CELL}
                rx={5}
                fill={fill}
                stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                strokeWidth={isSelected ? 2.5 : isHover ? 2 : 1}
                className="transition-all"
              />
              <text x={CELL / 2} y={valueLabel ? CELL / 2 - 2 : CELL / 2 + 3} textAnchor="middle" className="fill-foreground" style={{ fontSize: 11, fontWeight: 700 }}>
                {code}
              </text>
              {valueLabel && (
                <text x={CELL / 2} y={CELL / 2 + 11} textAnchor="middle" className="fill-foreground/80" style={{ fontSize: 8.5, fontFamily: 'var(--font-mono)' }}>
                  {valueLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover && (
        <div className="absolute top-0 right-0 rounded-lg border border-border bg-popover px-3 py-2 text-[11px] shadow-lg pointer-events-none min-w-[180px]">
          <div className="font-semibold text-foreground text-[12px] mb-1.5">{hover.code}</div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Effective tier</span>
            <span className="text-foreground">{hover.s?.active ? (hover.s.effective_client_type || 'None') : 'Inactive'}</span>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Highest CPL</span>
            <span className="font-mono tabular-nums text-foreground">{hover.s?.active ? (money(hover.s.highest_cpl) ?? 'n/a') : 'n/a'}</span>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Lowest CPL</span>
            <span className="font-mono tabular-nums text-foreground">{hover.s?.active ? (money(hover.s.lowest_cpl) ?? 'n/a') : 'n/a'}</span>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Active buyers</span>
            <span className="font-mono tabular-nums text-foreground">{hover.s?.active_buyer_count ?? 0}</span>
          </div>
        </div>
      )}
    </div>
  );
}