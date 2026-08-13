import React from 'react';
import { Inbox, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { summaryCounts } from './onboardingModel';

// Four summary tiles. Counts are true counts off the records: a zero shows as
// zero, never hidden or estimated.
const TILES = [
  { key: 'submitted', label: 'Submitted awaiting start', Icon: Inbox, tone: 'text-muted-foreground' },
  { key: 'in_progress', label: 'In progress', Icon: Loader2, tone: 'status-unsold' },
  { key: 'blocked', label: 'Blocked', Icon: AlertTriangle, tone: 'text-primary' },
  { key: 'complete', label: 'Completed', Icon: CheckCircle2, tone: 'status-sold' },
];

export default function OnboardingTiles({ records }) {
  const counts = summaryCounts(records);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {TILES.map(({ key, label, Icon, tone }) => (
        <div key={key} className="bg-card border border-border rounded-[12px] p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Icon className={`w-4.5 h-4.5 ${tone}`} />
          </div>
          <div className="min-w-0">
            <div className={`font-mono text-[22px] font-semibold leading-none ${tone}`}>{counts[key]}</div>
            <div className="text-[12px] text-muted-foreground mt-1.5 leading-tight">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}