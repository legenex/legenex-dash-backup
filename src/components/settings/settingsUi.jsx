import React from 'react';
import { motion } from 'framer-motion';

// ============================ MOTION ============================
// Shared rise-in variants for staggered panel content and table rows.
export const riseIn = {
  hidden: { opacity: 0, y: 14 },
  show: (n = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * n, duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  }),
};

// Wrapper that applies the rise-in stagger container to its children.
export function Rise({ children, i = 0, className = '', hover = false }) {
  return (
    <motion.div
      variants={riseIn}
      initial="hidden"
      animate="show"
      custom={i}
      whileHover={hover ? { y: -2 } : undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================ PANEL ============================
// The standard Settings panel surface: card background, border, rounded, soft shadow.
export function Panel({ children, className = '', i = 0, hover = false }) {
  return (
    <Rise i={i} hover={hover} className={`rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)] ${className}`}>
      {children}
    </Rise>
  );
}

// ============================ STAT CHIP ============================
// Uppercase micro-label, big tabular value, tone dot. Used in telemetry / summaries.
const TONE = {
  good: { dot: 'bg-[hsl(152_65%_54%)]', value: 'status-sold' },
  risk: { dot: 'bg-primary', value: 'text-primary' },
  warn: { dot: 'bg-[hsl(38_80%_57%)]', value: 'status-unsold' },
  default: { dot: 'bg-muted-foreground/50', value: 'text-foreground' },
};

export function StatChip({ label, value, tone, sub, i = 0 }) {
  const t = TONE[tone] || TONE.default;
  return (
    <Rise i={i} hover className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)]">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70 truncate">{label}</span>
      </div>
      <div className={`text-[17px] sm:text-[19px] lg:text-[22px] font-bold font-mono tabular-nums mt-1.5 leading-none truncate ${t.value}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted-foreground/70 mt-1 truncate">{sub}</div>}
    </Rise>
  );
}

// ============================ TOGGLE ============================
// w-9 h-5 track (primary when on, else border), white knob translateX when on.
export function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-primary' : 'bg-border'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

// ============================ INPUT ============================
// Label + a bordered field (h-10) showing value or placeholder. Optional mono + hint.
export function Input({ label, value, onChange, placeholder = '', mono = false, hint, type = 'text', disabled = false, className = '' }) {
  return (
    <div className={className}>
      {label && <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</div>}
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 ${
          mono ? 'font-mono text-[12px]' : ''
        }`}
      />
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

// ============================ TAG ============================
// Small pill with token tints. tone: 'primary' | 'good' | 'warn' | 'muted' (default).
const TAG_TONE = {
  primary: 'bg-primary/10 text-primary',
  good: 'bg-status-sold status-sold',
  warn: 'bg-status-unsold status-unsold',
  muted: 'tag-neutral',
};

export function Tag({ children, tone = 'muted', className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${TAG_TONE[tone] || TAG_TONE.muted} ${className}`}>
      {children}
    </span>
  );
}

// Small pulsing green dot for the Gateway / LIVE indicators.
export function PulseDot({ className = '' }) {
  return (
    <span className={`relative flex h-1.5 w-1.5 ${className}`}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(152_65%_54%)] opacity-70 animate-ping" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(152_65%_54%)]" />
    </span>
  );
}