import React from 'react';
import { PhoneCall, Trophy, Slash, Clock, Timer, DollarSign, TrendingUp, Link2Off } from 'lucide-react';
import { callStatusOf, fmtCallMoney, fmtDuration } from '@/lib/callFields';

// The call equivalent of LeadCountsStrip: everything worth knowing about the
// set of calls currently on screen. Fed the ALREADY FILTERED rows, so the
// numbers always describe exactly what the table below is showing.
export function callStats(calls = []) {
  let converted = 0, rejected = 0, pending = 0, errored = 0;
  let qualified = 0, unattributed = 0, connected = 0;
  let revenue = 0, durationSum = 0, durationCount = 0;

  for (const c of calls) {
    const status = callStatusOf(c);
    if (status === 'Converted') converted += 1;
    else if (status === 'Rejected') rejected += 1;
    else if (status === 'Error') errored += 1;
    else pending += 1;

    if (c.qualified) qualified += 1;
    if (!c.supplier_name) unattributed += 1;

    const secs = Number(c.duration_seconds) || 0;
    if (secs > 0) {
      connected += 1;
      durationSum += secs;
      durationCount += 1;
    }
    revenue += Number(c.revenue) || 0;
  }

  const total = calls.length;
  return {
    total, converted, rejected, pending, errored, qualified, unattributed, connected,
    revenue,
    durationSum,
    avgDuration: durationCount > 0 ? durationSum / durationCount : 0,
    // Share of calls that reached a paying outcome. Named for what it is.
    convertedRate: total > 0 ? (converted / total) * 100 : 0,
    revenuePerCall: total > 0 ? revenue / total : 0,
  };
}

const CARDS = [
  { key: 'total', label: 'Calls', icon: PhoneCall, fmt: (s) => s.total.toLocaleString(), sub: (s) => `${s.connected.toLocaleString()} connected` },
  { key: 'converted', label: 'Converted', icon: Trophy, fmt: (s) => s.converted.toLocaleString(), sub: (s) => `${s.convertedRate.toFixed(1)}% of calls`, tone: 'status-converted' },
  { key: 'rejected', label: 'Rejected', icon: Slash, fmt: (s) => s.rejected.toLocaleString(), sub: (s) => `${s.pending.toLocaleString()} pending`, tone: 'status-rejected' },
  { key: 'talkTime', label: 'Talk Time', icon: Clock, fmt: (s) => fmtDuration(s.durationSum), sub: () => 'total connected' },
  { key: 'avgDuration', label: 'Avg Duration', icon: Timer, fmt: (s) => fmtDuration(s.avgDuration), sub: () => 'per connected call' },
  { key: 'revenue', label: 'Revenue', icon: DollarSign, fmt: (s) => fmtCallMoney(s.revenue), sub: () => 'payout on these calls', tone: 'status-sold' },
  { key: 'rpc', label: 'Revenue / Call', icon: TrendingUp, fmt: (s) => fmtCallMoney(s.revenuePerCall), sub: () => 'across all calls' },
  { key: 'unattributed', label: 'Unattributed', icon: Link2Off, fmt: (s) => s.unattributed.toLocaleString(), sub: () => 'no supplier credited' },
];

export default function CallStatsCards({ calls, stats, className = '' }) {
  const s = stats || callStats(calls || []);

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 ${className}`}>
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase truncate">{card.label}</span>
            </div>
            <div className={`text-[18px] font-bold mt-1.5 leading-none tabular-nums ${card.tone || 'text-foreground'}`}>
              {card.fmt(s)}
            </div>
            <div className="text-[10.5px] text-muted-foreground/70 mt-1 truncate">{card.sub(s)}</div>
          </div>
        );
      })}
    </div>
  );
}
