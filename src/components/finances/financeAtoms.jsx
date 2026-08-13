import React from 'react';
import { motion } from 'framer-motion';

// Shared Performance OS atoms for the Finances section. Theme tokens only, no hardcoded hex.

export const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

export const Panel = ({ children, className = '' }) => (
  <div className={`rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)] ${className}`}>
    {children}
  </div>
);

export const PanelHeader = ({ title, children }) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
    <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
    {children}
  </div>
);

// Small KPI chip. tone: 'good' -> status-sold, 'risk' -> primary, default -> foreground.
export const StatChip = ({ label, value, tone, i = 0 }) => {
  const valueClass = tone === 'good' ? 'status-sold' : tone === 'risk' ? 'text-primary' : 'text-foreground';
  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      custom={i}
      whileHover={{ y: -2 }}
      className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)]"
    >
      <div className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70 truncate">{label}</div>
      <div className={`text-[16px] sm:text-[18px] lg:text-[20px] font-bold font-mono tabular-nums mt-1.5 truncate ${valueClass}`}>{value}</div>
    </motion.div>
  );
};

// Table header row: cols is an array; alignRight lists column indexes that are numeric.
export const THead = ({ cols, alignRight = [], center = [] }) => (
  <tr className="border-b border-border/60 bg-background/40 text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70">
    {cols.map((c, i) => (
      <th key={c + i} className={`px-4 py-2.5 ${alignRight.includes(i) ? 'text-right' : center.includes(i) ? 'text-center' : 'text-left'}`}>{c}</th>
    ))}
  </tr>
);