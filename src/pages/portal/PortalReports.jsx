import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import PeriodTabs from '@/components/shared/PeriodTabs';
import { FileText, DollarSign, Wallet, TrendingUp } from 'lucide-react';
import { filterByPeriod, portalMetrics, dailyBreakdown } from '@/lib/portalMetrics';
import { money } from '@/lib/reportMetrics';

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-[10px] p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="text-[24px] font-bold text-foreground mt-2 font-mono">{value}</div>
    </div>
  );
}

export default function PortalReports() {
  const { data, buyer } = useOutletContext();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });

  const leads = data?.leads || [];

  const { m, days } = useMemo(() => {
    const scoped = filterByPeriod(leads, period, custom);
    return { m: portalMetrics(scoped), days: dailyBreakdown(scoped) };
  }, [leads, period, custom]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Reports</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Performance overview and daily breakdown for {buyer?.company_name || 'your account'}.</p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
      </div>

      {/* Performance Overview */}
      <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Performance Overview</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Received Leads" value={m.total.toLocaleString()} icon={FileText} />
        <Stat label="Revenue" value={money(m.revenue)} icon={DollarSign} />
        <Stat label="Cost" value={money(m.cost)} icon={Wallet} />
      </div>

      {/* Daily Performance */}
      <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Daily Performance</div>
      <div className="bg-card border border-border rounded-[10px] p-5">
        {days.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No leads in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead>
                <tr className="border-b border-border">
                  {['Date', 'Leads', 'Sold', 'Revenue', 'Cost'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map(d => (
                  <tr key={d.day}>
                    <td className="px-3 py-2 font-mono text-[12px] text-foreground">{d.day}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{d.total.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{d.sold.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{money(d.revenue)}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{money(d.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}