import React from 'react';

// Tiny inline SVG sparkline. data = array of numbers.
export default function Sparkline({ data = [], color = 'hsl(var(--primary))', height = 28 }) {
  const pts = data.length ? data : [0, 0];
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const range = max - min || 1;
  const w = 100;
  const step = pts.length > 1 ? w / (pts.length - 1) : w;
  const path = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}