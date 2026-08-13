import React from 'react';
import { motion } from 'framer-motion';
import { Search, Calendar as CalendarIcon, GitCompareArrows, RefreshCw } from 'lucide-react';
import { PERIODS } from '@/lib/periodRange';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Top-of-page header for the Performance OS Overview. Presentational, parent
// owns all state (period, custom range, compare, refresh).
export default function OverviewHeader({
  period, onPeriodChange, custom, onCustomChange, compare, onToggleCompare, onRefresh, filters, activity,
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(custom || { from: '', to: '' });
  const [spinning, setSpinning] = React.useState(false);

  const handleRefresh = async () => {
    setSpinning(true);
    try { await onRefresh?.(); } finally { setTimeout(() => setSpinning(false), 600); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5"
    >
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        {/* Title block */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[24px] font-bold text-foreground tracking-tight">Overview</h1>
            {/* The live activity strip sits inline with the title. It carries its
                own pulsing dot, so the separate LIVE pill that used to live here
                was saying the same thing twice on two different lines. */}
            {activity}
          </div>
          <p className="text-[13px] text-muted-foreground mt-1.5 max-w-xl">
            One truth: what was booked, what cash is verified, and where the gap is.
          </p>
        </div>

        {/* Search + controls */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Ask or search"
              className="h-9 w-full sm:w-64 pl-9 pr-14 rounded-lg bg-card border border-border text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Period tabs + actions row */}
      <div className="flex items-center gap-2 flex-wrap mt-4">
        <div className="inline-flex items-center bg-card border border-border rounded-lg p-0.5">
          {PERIODS.map(p => {
            const active = p.value === period;
            if (p.value === 'custom') {
              return (
                <Popover key={p.value} open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <button
                      onClick={() => onPeriodChange('custom')}
                      className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors inline-flex items-center gap-1.5 ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
                    >
                      <CalendarIcon className="w-3.5 h-3.5" /> Custom
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-popover border-border" align="start">
                    <div className="space-y-2.5">
                      <div>
                        <label className="text-[11px] text-muted-foreground">From</label>
                        <Input type="date" value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} className="mt-1 bg-background text-[12px]" />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">To</label>
                        <Input type="date" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} className="mt-1 bg-background text-[12px]" />
                      </div>
                      <Button size="sm" className="w-full" onClick={() => { onCustomChange?.(draft); onPeriodChange('custom'); setOpen(false); }}>Apply</Button>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }
            return (
              <button
                key={p.value}
                onClick={() => onPeriodChange(p.value)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={onToggleCompare}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${compare ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}
        >
          <GitCompareArrows className="w-3.5 h-3.5" /> Compare
        </button>

        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} /> Refresh
        </Button>

        {/* Dimension filters sit on this same row rather than a row of their own.
            Below the period bar they read as a separate block and were easy to
            miss entirely. flex-wrap lets them drop to a second line on narrow
            screens without being visually detached. */}
        {filters}
      </div>
    </motion.div>
  );
}