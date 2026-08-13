import React from 'react';
import { motion } from 'framer-motion';
import { X, GripVertical } from 'lucide-react';
import { METRIC_CATALOG, formatMetric } from '@/lib/reportMetrics';

// A single editable metric card, Performance OS styling:
// uppercase micro-label, big tabular value, thin progress bar toned red (risk) / green (good).
// Draggable (via dragHandle), removable. Width is controlled by the parent grid.
export default function MetricCard({ card, value, series = [], onRemove, dragHandleProps, positive }) {
  const meta = METRIC_CATALOG.find(m => m.key === card.metric);
  const label = card.label || meta?.label || card.metric;
  const format = meta?.format || 'num';
  const display = formatMetric(value, format);
  // positive === false marks a risk metric (returns, gaps, overdue, etc.) -> red bar.
  const risk = positive === false;
  const barClass = risk ? 'bg-primary' : 'bg-status-sold';
  const borderClass = risk ? 'border-primary/25' : 'border-border';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      className={`group relative bg-card border ${borderClass} rounded-[10px] p-2.5 lg:p-3.5 flex flex-col justify-between min-h-[68px] lg:min-h-[104px]`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[9px] lg:text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground pr-6 leading-tight truncate">{label}</span>
        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button {...dragHandleProps} className="p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} className="p-1 text-muted-foreground hover:text-destructive">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="text-[17px] lg:text-[22px] font-bold text-foreground font-mono tabular-nums mt-0.5 lg:mt-1 leading-none truncate">{display}</div>
      <div className="h-0.5 rounded-full mt-1.5 lg:mt-3 bg-border/70">
        <div className={`h-full rounded-full ${barClass} opacity-70`} style={{ width: '38%' }} />
      </div>
    </motion.div>
  );
}