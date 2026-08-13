import React from 'react';
import { motion } from 'framer-motion';

// Shared Performance OS table atoms for the Campaigns tab components.
// Theme-token based so both light and dark themes render correctly.

export const rise = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: 0.03 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] } }),
};

// Numeric column headers that should render right-aligned + mono in body cells.
const NUMERIC_HEADS = new Set([
  'Leads', 'Campaigns', 'Accepted', 'Accepted %', 'Duplicate', 'DQ', 'Cost', 'Revenue',
  'Profit', 'CPL', 'Suppliers', 'FB / IG', 'Balance', 'Min Balance', 'Actions',
]);

export const Panel = ({ children, className = '' }) => (
  <div className={`relative rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)] ${className}`}>
    {children}
  </div>
);

export const Tag = ({ children, tone = 'slate', mono }) => {
  const map = {
    slate: 'tag-neutral border-border',
    red: 'bg-primary/10 text-primary border-primary/35',
    green: 'bg-status-sold status-sold border-[hsl(152_65%_54%/0.35)]',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium tracking-wide border ${mono ? 'font-mono' : ''} ${map}`}>
      {children}
    </span>
  );
};

// Header row + panel wrapper. `head` items matching NUMERIC_HEADS render right-aligned.
export const TableShell = ({ head, template, minWidth, children }) => (
  <Panel className={minWidth ? 'overflow-x-auto' : 'overflow-hidden'}>
    <div style={{ minWidth }}>
      <div
        className="grid gap-2 px-4 py-2.5 border-b border-border/60 bg-background/40 text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70"
        style={{ gridTemplateColumns: template }}
      >
        {head.map((h) => (
          <span key={h} className={NUMERIC_HEADS.has(h) ? 'text-right' : ''}>{h}</span>
        ))}
      </div>
      {children}
    </div>
  </Panel>
);

// One animated body row on the same grid template as the header.
export const Row = ({ template, children, i = 0, onClick, className = '' }) => (
  <motion.div
    variants={rise}
    initial="hidden"
    animate="show"
    custom={i}
    onClick={onClick}
    className={`grid gap-2 px-4 py-3 border-b border-border/60 items-center hover:bg-accent/40 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
    style={{ gridTemplateColumns: template }}
  >
    {children}
  </motion.div>
);

// Honest empty state row spanning the full grid.
export const EmptyRow = ({ children }) => (
  <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">{children}</div>
);