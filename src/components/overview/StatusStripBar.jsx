import React from 'react';
import { motion } from 'framer-motion';
import CountUpText from '@/components/overview/CountUpText';

// Bottom status strip. `items` = [{ label, value, tone, dot, dotClass, count, render }].
// If `count` + `render` are provided, the value counts up from 0; otherwise `value` is shown as-is.
const TONE = {
  good: 'status-sold',
  warn: 'status-unsold',
  bad: 'status-error',
  neutral: 'text-foreground',
};

export default function StatusStripBar({ items = [] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="px-4 py-3 flex items-center flex-wrap gap-x-6 gap-y-3"
    >
      {items.map((it, i) => (
        <div key={it.label} className="flex items-center gap-2">
          {it.dot && <span className={`w-2 h-2 rounded-full ${it.dotClass || 'bg-[#3DD68C]'}`} />}
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{it.label}</span>
          <span className={`text-[12px] font-mono font-medium ${TONE[it.tone] || TONE.neutral}`}>
            {it.render ? <CountUpText value={it.count} render={it.render} /> : it.value}
          </span>
          {i < items.length - 1 && <span className="hidden lg:inline h-4 w-px bg-border ml-4" />}
        </div>
      ))}
    </motion.div>
  );
}