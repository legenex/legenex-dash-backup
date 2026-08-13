import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import PeriodTabs from '@/components/shared/PeriodTabs';
import { FileText, DollarSign, Wallet, TrendingUp } from 'lucide-react';
import { filterByPeriod, portalMetrics, feedbackSummary } from '@/lib/portalMetrics';
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

export default function PortalDashboard() {
  const { data, buyer } = useOutletContext();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });

  const leads = data?.leads || [];
  const feedback = data?.feedback || [];

  const { m, fb } = useMemo(() => {
    const scopedLeads = filterByPeriod(leads, period, custom);
    const scopedFb = filterByPeriod(feedback, period, custom);
    return { m: portalMetrics(scopedLeads), fb: feedbackSummary(scopedFb) };
  }, [leads, feedback, period, custom]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">{buyer?.company_name || 'Dashboard'}</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Your received leads, revenue and feedback at a glance.</p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Received Leads" value={m.total.toLocaleString()} icon={FileText} />
        <Stat label="Revenue" value={money(m.revenue)} icon={DollarSign} />
        <Stat label="Cost" value={money(m.cost)} icon={Wallet} />
      </div>

      <div className="bg-card border border-border rounded-[10px] p-5">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">Feedback Summary</div>
        {fb.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No feedback submitted in this period.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {fb.map(row => (
              <div key={row.disposition} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
                <span className="text-[13px] text-foreground truncate">{row.disposition}</span>
                <span className="text-[13px] font-mono font-semibold text-muted-foreground ml-2">{row.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}