import React from 'react';
import { StatChip } from '@/components/finances/financeUi';
import { money, integer } from './billingApi';

// Four summary tiles above both panels. Any figure that cannot be computed
// honestly renders no value rather than a zero, so we pass an em-dash-free
// placeholder string only when the value is genuinely null.
export default function BillingTiles({
  dueToday, prepayLow, draftRuns, totalNet, netLoading,
}) {
  const netValue = netLoading ? '...' : (money(totalNet) != null ? money(totalNet) : 'No value');
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatChip
        i={0}
        label="Buyers due to bill today"
        value={integer(dueToday) != null ? integer(dueToday) : 'No value'}
        sub="On a daily invoicing arrangement"
      />
      <StatChip
        i={1}
        label="Prepay balances running low"
        value={integer(prepayLow) != null ? integer(prepayLow) : 'No value'}
        tone={prepayLow > 0 ? 'warn' : undefined}
        sub="Projected to run out within 3 days"
      />
      <StatChip
        i={2}
        label="Draft runs awaiting issue"
        value={integer(draftRuns) != null ? integer(draftRuns) : 'No value'}
        sub="Generated but not yet invoiced"
      />
      <StatChip
        i={3}
        label="Total net in selected period"
        value={netValue}
        tone="good"
        sub="Sum of daily queue previews"
      />
    </div>
  );
}