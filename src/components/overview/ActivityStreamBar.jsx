import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';

const DOT = {
  green: 'bg-[#3DD68C]',
  amber: 'bg-[#FACC14]',
  blue: 'bg-[#3182BD]',
  red: 'bg-destructive',
};

// Live activity stream: cycles through recent events as fading inline chips.
// `events` = [{ id, tone, text }]. Presentational + timed cycling only.
// `inline` renders it as a compact strip for the page header rather than a
// full-width band of its own. On Overview it used to sit on its own line above
// the title, which cost a whole row of vertical space and duplicated the LIVE
// pill sitting right beneath it.
export default function ActivityStreamBar({ events = [], right = null, inline = false }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (events.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % events.length), 3200);
    return () => clearInterval(t);
  }, [events.length]);

  const current = events[idx];

  return (
    <div className={inline ? 'flex items-center gap-3 min-w-0' : 'flex items-center justify-between gap-3 mb-4'}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DD68C] opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3DD68C]" />
          </span>
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Live activity stream connected</span>
        </div>
        <div className="h-4 w-px bg-border shrink-0 hidden sm:block" />
        <div className="relative h-6 flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current.id + '-' + idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex items-center gap-2 min-w-0"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[current.tone] || DOT.blue}`} />
                <span className="text-[12px] text-foreground/80 truncate">{current.text}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}