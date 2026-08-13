import React from 'react';
import useCountUp from '@/hooks/useCountUp';
import AnimatedPanel from '@/components/overview/AnimatedPanel';

// Small stat card. Pass either a preformatted `value` string, or a numeric
// `count` + `render(n)` for an animated count-up. Optional status dot + note.
export default function StatCard({ label, value, count, render, subtitle, note, dotTone = 'neutral', icon: Icon }) {
  const animated = useCountUp(count ?? 0);
  const display = render ? render(animated) : value;
  const dotColor = dotTone === 'good' ? '#3DD68C' : dotTone === 'warn' ? '#FACC14' : dotTone === 'bad' ? '#E5484D' : '#8B95A8';
  return (
    <AnimatedPanel duration={6.5}>
      <div className="p-3 lg:p-4 hover:border-primary/30 transition-colors duration-200 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
          <div className="text-[10px] lg:text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate min-w-0">{label}</div>
          {Icon && <Icon className="w-4 h-4 text-primary ml-auto shrink-0" />}
        </div>
        {/* Currency values here can run to eight characters, which overflowed a
            fixed 22px on a two-column phone layout. */}
        <div className="text-[17px] sm:text-[19px] lg:text-[22px] font-bold text-foreground mt-1.5 font-display tabular-nums truncate">{display}</div>
        {(note || subtitle) && <div className="text-[10px] lg:text-[11px] text-muted-foreground/80 mt-1 truncate">{note || subtitle}</div>}
      </div>
    </AnimatedPanel>
  );
}