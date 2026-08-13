import React from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Landmark } from 'lucide-react';
import { moneyShort } from '@/lib/reportMetrics';

// Richer StatChip for the Finances rebuild: uppercase micro-label, big tabular value,
// tone dot, and a thin progress bar. tone: 'good' | 'risk' | 'warn' | undefined.
// pct (0-100) drives the progress bar width; omit for a flat rail.
const TONE = {
  good: { dot: 'bg-[hsl(152_65%_54%)]', value: 'status-sold', bar: 'bg-[hsl(152_65%_54%)]' },
  risk: { dot: 'bg-primary', value: 'text-primary', bar: 'bg-primary' },
  warn: { dot: 'bg-[hsl(38_80%_57%)]', value: 'status-unsold', bar: 'bg-[hsl(38_80%_57%)]' },
  default: { dot: 'bg-muted-foreground/50', value: 'text-foreground', bar: 'bg-muted-foreground/40' },
};

export function StatChip({ label, value, tone, pct = null, sub, i = 0 }) {
  const t = TONE[tone] || TONE.default;
  const width = pct == null ? null : Math.max(0, Math.min(100, pct));
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 14 }, show: (n = 0) => ({ opacity: 1, y: 0, transition: { delay: 0.04 * n, duration: 0.45, ease: [0.22, 1, 0.36, 1] } }) }}
      initial="hidden"
      animate="show"
      custom={i}
      whileHover={{ y: -2 }}
      className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)]"
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70 truncate">{label}</span>
      </div>
      <div className={`text-[16px] sm:text-[18px] lg:text-[20px] font-bold font-mono tabular-nums mt-1.5 leading-none truncate ${t.value}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted-foreground/70 mt-1 truncate">{sub}</div>}
      <div className="mt-2.5 h-1 rounded-full bg-border/60 overflow-hidden">
        {width != null && (
          <motion.div
            className={`h-full rounded-full ${t.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${width}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.04 * i + 0.1 }}
          />
        )}
      </div>
    </motion.div>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="font-mono tabular-nums text-foreground ml-auto">{moneyShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Cash In vs Cash Out chart. data: [{ date, in, out }]. When `empty` is true
// (no bank transactions), renders a faint chart with a "Connect Mercury" overlay.
export function CashChart({ data, empty = false, height = 220 }) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="cashIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(152 65% 54%)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(152 65% 54%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={d => String(d).slice(5)} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={moneyShort} width={44} />
          <Tooltip content={<ChartTip />} />
          <Area type="monotone" dataKey="in" name="Cash In" stroke="hsl(152 65% 54%)" strokeWidth={2} fill="url(#cashIn)" />
          <Line type="monotone" dataKey="out" name="Cash Out" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {empty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-card/60 backdrop-blur-[1px] rounded-lg">
          <Landmark className="w-5 h-5 text-muted-foreground/60" />
          <div className="text-[12px] text-muted-foreground">No bank activity in range</div>
          <div className="text-[11px] text-muted-foreground/70">Connect Mercury to see live cash flow</div>
        </div>
      )}
    </div>
  );
}

// Small pulsing dot for the LIVE pill.
export function PulseDot({ className = '' }) {
  return (
    <span className={`relative flex h-1.5 w-1.5 ${className}`}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(152_65%_54%)] opacity-70 animate-ping" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(152_65%_54%)]" />
    </span>
  );
}