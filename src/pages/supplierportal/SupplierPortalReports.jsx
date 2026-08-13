import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import PeriodTabs from '@/components/shared/PeriodTabs';
import { FileText, CheckCircle2, Percent, DollarSign, Wallet, TrendingUp, Megaphone } from 'lucide-react';
import { filterByPeriod, supplierPortalMetrics, adReportSummary, dailyBreakdown, money, pct } from '@/lib/supplierPortalMetrics';

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

export default function SupplierPortalReports() {
  const { data, supplier } = useOutletContext();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });

  const leads = data?.leads || [];
  const adReporting = data?.adReporting || null;
  // Ad Performance is only relevant for internal (media-buying) sources.
  const isInternal = String(supplier?.supplier_type || '') === 'Internal';

  const { m, days, ad } = useMemo(() => {
    const scoped = filterByPeriod(leads, period, custom);
    return {
      m: supplierPortalMetrics(scoped),
      days: dailyBreakdown(scoped),
      ad: adReportSummary(adReporting, scoped.length),
    };
  }, [leads, adReporting, period, custom]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Reports</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Performance overview and daily breakdown for {supplier?.name || 'your account'}.</p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
      </div>

      {/* Performance Overview */}
      <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Performance Overview</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Leads Sent" value={m.total.toLocaleString()} icon={FileText} />
        <Stat label="Accepted" value={m.accepted.toLocaleString()} icon={CheckCircle2} />
        <Stat label="Accepted %" value={pct(m.acceptedPct)} icon={Percent} />
        <Stat label="Revenue" value={money(m.revenue)} icon={DollarSign} />
        <Stat label="Cost" value={money(m.cost)} icon={Wallet} />
        <Stat label="Profit" value={money(m.profit)} icon={TrendingUp} />
        <Stat label="CPL" value={money(m.cpl)} icon={Wallet} />
      </div>

      {/* Daily Performance */}
      <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Daily Performance</div>
      <div className="bg-card border border-border rounded-[10px] p-5 mb-8">
        {days.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No leads in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead>
                <tr className="border-b border-border">
                  {['Date', 'Sent', 'Accepted', 'Accepted %', 'Revenue', 'Cost'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map(d => (
                  <tr key={d.day}>
                    <td className="px-3 py-2 font-mono text-[12px] text-foreground">{d.day}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{d.total.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{d.accepted.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{d.acceptedPct.toFixed(1)}%</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{money(d.revenue)}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{money(d.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ad Performance, internal media-buying sources only */}
      {isInternal && (
        <>
          <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            Ad Performance
          </div>
          <div className="bg-card border border-border rounded-[10px] p-5">
            {!ad || !ad.hasData ? (
              <p className="text-[13px] text-muted-foreground">No ad spend synced for this period yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  <div className="bg-background border border-border rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Spend</div>
                    <div className="text-[18px] font-bold text-foreground mt-1 font-mono">{money(ad.spend)}</div>
                  </div>
                  <div className="bg-background border border-border rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">CPL</div>
                    <div className="text-[18px] font-bold text-foreground mt-1 font-mono">{money(ad.cpl)}</div>
                  </div>
                  <div className="bg-background border border-border rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Impressions</div>
                    <div className="text-[18px] font-bold text-foreground mt-1 font-mono">{ad.impressions.toLocaleString()}</div>
                  </div>
                  <div className="bg-background border border-border rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Clicks</div>
                    <div className="text-[18px] font-bold text-foreground mt-1 font-mono">{ad.clicks.toLocaleString()}</div>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Campaign Performance</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border">
                        {['Campaign', 'Spend', 'Leads', 'CPL', 'Clicks'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ad.campaigns.map(c => (
                        <tr key={c.key}>
                          <td className="px-3 py-2 font-mono text-[12px] text-foreground">{c.key}</td>
                          <td className="px-3 py-2 font-mono text-[12px]">{money(c.spend)}</td>
                          <td className="px-3 py-2 font-mono text-[12px]">{c.leads.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono text-[12px]">{money(c.cpl)}</td>
                          <td className="px-3 py-2 font-mono text-[12px]">{c.clicks.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}