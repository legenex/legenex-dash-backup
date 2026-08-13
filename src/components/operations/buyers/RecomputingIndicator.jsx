import React from 'react';
import { Loader2 } from 'lucide-react';

// Subtle inline indicator shown while a coverage recompute is in flight.
// Renders nothing when idle, so it never occupies layout or blocks the UI.
export default function RecomputingIndicator({ active, className = '' }) {
  if (!active) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] text-muted-foreground ${className}`}>
      <Loader2 className="w-3 h-3 animate-spin" />
      Recomputing coverage
    </span>
  );
}