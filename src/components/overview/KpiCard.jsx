import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function KpiCard({ label, value, trend, trendLabel, icon: Icon }) {
  const isUp = trend > 0;
  const isDown = trend < 0;

  return (
    <div className="relative bg-card border border-border rounded-[12px] p-5 overflow-hidden hover:border-primary/30 transition-all duration-150 hover:-translate-y-0.5">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary/40" />
      <div className="flex items-start justify-between">
        <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-[18px] h-[18px] text-primary" />
          </div>
        )}
      </div>
      <div className="text-[23px] sm:text-[28px] lg:text-[34px] font-bold text-foreground mt-2 leading-tight font-display truncate">{value}</div>
      {trend !== undefined && trend !== null && (
        <div className={`flex items-center gap-1 mt-2 text-[12px] font-medium ${isUp ? 'status-sold' : isDown ? 'status-error' : 'text-muted-foreground'}`}>
          {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : isDown ? <TrendingDown className="w-3.5 h-3.5" /> : null}
          {trend > 0 ? '+' : ''}{trend}% {trendLabel || 'vs prior'}
        </div>
      )}
    </div>
  );
}