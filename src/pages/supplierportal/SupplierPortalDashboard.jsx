import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import PeriodTabs from '@/components/shared/PeriodTabs';
import { FileText, CheckCircle2, Percent, Copy, XCircle, DollarSign, Wallet, TrendingUp, Megaphone } from 'lucide-react';
import { filterByPeriod, supplierPortalMetrics, adReportSummary, money, pct } from '@/lib/supplierPortalMetrics';

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

export default function SupplierPortalDashboard() {
  const { data, supplier } = useOutletContext();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });

  const leads = data?.leads || [];
  const adReporting = data?.adReporting || null;

  const { m, ad } = useMemo(() => {
    const scopedLeads = filterByPeriod(leads, period, custom);
    return {
      m: supplierPortalMetrics(scopedLeads),
      ad: adReportSummary(adReporting, scopedLeads.length),
    };
  }, [leads, adReporting, period, custom]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">{supplier?.name || 'Dashboard'}</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Your own performance, leads sent, acceptance and revenue.</p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
      </div>

      {/* Volume + quality */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat label="Leads Sent" value={m.total.toLocaleString()} icon={FileText} />
        <Stat label="Accepted" value={m.accepted.toLocaleString()} icon={CheckCircle2} />
        <Stat label="Accepted %" value={pct(m.acceptedPct)} icon={Percent} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Duplicate %" value={pct(m.duplicatePct)} icon={Copy} />
        <Stat label="DQ %" value={pct(m.dqPct)} icon={XCircle} />
        <Stat label="Revenue" value={money(m.revenue)} icon={DollarSign} />
        <Stat label="Your Cost" value={money(m.cost)} icon={Wallet} />
      </div>

      {/* Profitability */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Stat label="Profit" value={money(m.profit)} icon={TrendingUp} />
        <Stat label="CPL" value={money(m.cpl)} icon={Wallet} />
        <Stat label="Rejected" value={m.rejected.toLocaleString()} icon={XCircle} />
      </div>

      {/* Ad reporting, internal Facebook-connected suppliers only */}
      {ad && (
        <div className="bg-card border border-border rounded-[10px] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="w-4 h-4 text-primary" />
            <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Facebook Ad Reporting</span>
          </div>

          {!ad.hasData ? (
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
      )}
    </div>
  );
}