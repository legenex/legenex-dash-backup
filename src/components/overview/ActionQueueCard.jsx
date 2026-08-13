import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fmtMoney } from '@/lib/overviewFinance';

const LABEL_TONE = {
  'Missing source': 'status-error-bg status-error',
  'Revenue gap': 'status-error-bg status-error',
  'Supplier cost gap': 'status-warn-bg status-unsold',
  'Unmatched income': 'bg-status-duplicate status-duplicate',
  'Payment overdue': 'status-error-bg status-error',
  'Short paid': 'status-warn-bg status-unsold',
};

// Financial variance queue built from workbench.openGaps + unmatched income.
export default function ActionQueueCard({ queue, onResolve, onDone }) {
  const { items, totalAtRisk } = queue;
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 5;
  const visibleItems = expanded ? items : items.slice(0, PREVIEW);
  return (
    <div className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-primary" /> Action Queue
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Open financial variances requiring attention</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total at risk</div>
          <div className={`text-[18px] font-bold font-mono ${totalAtRisk > 0 ? 'text-destructive' : 'text-foreground'}`}>{fmtMoney(totalAtRisk)}</div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 && (
          <div className="flex items-center gap-2 text-[13px] status-sold px-5 py-8 justify-center">
            <CheckCircle2 className="w-4 h-4" /> Everything reconciles, no open variances.
          </div>
        )}
        <AnimatePresence initial={false}>
          {visibleItems.map((item, i) => (
            <motion.div
              key={item.key}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12, height: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3) }}
              className="px-5 py-3 flex items-start gap-3 hover:bg-accent/30 transition-colors"
            >
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-md whitespace-nowrap mt-0.5 ${LABEL_TONE[item.label] || 'tag-neutral'}`}>{item.label}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-foreground font-medium truncate">{item.name || item.note}</div>
                {item.why && <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{item.why}</div>}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="text-[14px] font-bold font-mono text-destructive whitespace-nowrap">{fmtMoney(item.amount)}</div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onResolve?.(item)}>Resolve</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground" onClick={() => onDone?.(item)}>Done</Button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {items.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full px-5 py-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors border-t border-border flex items-center justify-center gap-1.5"
        >
          {expanded ? 'Show less' : `Show all ${items.length} variances`}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}