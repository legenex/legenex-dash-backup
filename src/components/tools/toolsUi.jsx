import React from 'react';
import { motion } from 'framer-motion';

// Shared atoms for the Tools section rebuild. Theme tokens only, both themes.

const TONE = {
  good: { dot: 'bg-[hsl(152_65%_54%)]', value: 'status-sold' },
  risk: { dot: 'bg-primary', value: 'text-primary' },
  warn: { dot: 'bg-[hsl(38_80%_57%)]', value: 'status-unsold' },
  default: { dot: 'bg-muted-foreground/50', value: 'text-foreground' },
};

// StatChip: uppercase micro-label, big tabular value, tone dot.
export function StatChip({ label, value, tone, sub, i = 0 }) {
  const t = TONE[tone] || TONE.default;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70 truncate">{label}</span>
      </div>
      <div className={`text-[17px] sm:text-[19px] lg:text-[22px] font-bold font-mono tabular-nums mt-1.5 leading-none truncate ${t.value}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted-foreground/70 mt-1 truncate">{sub}</div>}
    </motion.div>
  );
}

// Toggle: w-9 h-5 track (status-sold when on, border-border when off), white knob.
export function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-[hsl(152_65%_54%)]' : 'bg-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// Tag pill with token tints.
const TAG_TONE = {
  neutral: 'tag-neutral',
  primary: 'bg-primary/10 text-primary',
  green: 'bg-status-sold status-sold',
  amber: 'bg-status-unsold status-unsold',
};

export function Tag({ children, tone = 'neutral', className = '' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${TAG_TONE[tone] || TAG_TONE.neutral} ${className}`}>
      {children}
    </span>
  );
}