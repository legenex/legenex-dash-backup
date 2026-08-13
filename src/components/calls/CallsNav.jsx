import React, { useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { PhoneCall, Trophy, Slash, Link2Off } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import SubNavShell from '@/components/layout/SubNavShell';
import { resolvePeriod } from '@/lib/periodRange';
import { callEventInstant, matchesCallView } from '@/lib/callFields';

const ITEMS = [
  { label: 'All Calls', path: '/calls', icon: PhoneCall, view: 'all' },
  { label: 'Converted Calls', path: '/calls/converted', icon: Trophy, view: 'converted' },
  { label: 'Rejected Calls', path: '/calls/rejected', icon: Slash, view: 'rejected' },
];

// Left sub-sidebar for the Calls section. Same treatment as LeadsNav: CALLS
// group label, per-view icons with live count badges, active red pill, and an
// attention card when calls are sitting without a supplier.
export default function CallsNav() {
  const location = useLocation();
  // The table writes its period into the URL. Reading it back here keeps the
  // badges and the table answering the same question, exactly as Leads does.
  const [searchParams] = useSearchParams();
  const period = searchParams.get('period') || 'this_month';
  const customPeriod = {
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  };

  // Deliberately the SAME query key as CallsTable, so the badges and the rows
  // share one cache and can never disagree.
  const { data: calls = [] } = useQuery({
    queryKey: ['call-records-all'],
    queryFn: async () => {
      const all = [];
      let page = 0;
      const size = 500;
      for (;;) {
        const batch = (await base44.entities.CallRecord.list('-call_at', size, page * size)) || [];
        all.push(...batch);
        if (batch.length < size || page > 40) break;
        page += 1;
      }
      return all;
    },
  });

  const { counts, unattributed } = useMemo(() => {
    const { start, end } = resolvePeriod(period, customPeriod);
    const inWindow = (calls || []).filter((c) => {
      const inst = callEventInstant(c);
      if (start && (!inst || inst < start)) return false;
      if (end && (!inst || inst > end)) return false;
      return true;
    });
    const c = {};
    for (const item of ITEMS) {
      c[item.view] = inWindow.filter((call) => matchesCallView(call, item.view)).length;
    }
    return {
      counts: c,
      unattributed: inWindow.filter((call) => !call.supplier_name).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, period, customPeriod.from, customPeriod.to]);

  const railItems = ITEMS.map((item) => ({
    label: item.label, icon: item.icon, to: item.path, active: location.pathname === item.path,
  }));

  return (
    <SubNavShell items={railItems} title="Calls">
      <div className="flex flex-col h-full">
        <div className="space-y-0.5">
          {ITEMS.map((item) => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            const n = counts[item.view] || 0;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors border-l-2 ${
                  active
                    ? 'bg-primary/10 text-primary font-medium border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                <span
                  className={`min-w-[20px] text-center rounded-full px-1.5 py-px text-[10px] font-mono font-semibold tabular-nums ${
                    n > 0 ? 'bg-status-unsold status-unsold' : 'bg-accent text-muted-foreground/70'
                  }`}
                >
                  {n}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Attention card: calls with no supplier credited cannot be paid out
            or attributed in reports, so they need matching. */}
        {unattributed > 0 && (
          <div className="mt-auto rounded-xl border border-border bg-status-unsold p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Link2Off className="w-3.5 h-3.5 status-unsold" />
              <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase status-unsold">Attention</span>
            </div>
            <div className="text-[12px] font-semibold status-unsold">{unattributed} unattributed</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">No supplier credited yet</div>
          </div>
        )}
      </div>
    </SubNavShell>
  );
}
