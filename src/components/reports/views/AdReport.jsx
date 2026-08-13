import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { applyFilters, computeMetrics, money, spendInWindow } from '@/lib/reportMetrics';
import { internalSupplierSet } from '@/lib/reportMetrics';
import { ReportKpi, THead, TRow, AINote } from '@/components/reports/reportViewAtoms';
import { Button } from '@/components/ui/button';

const GREEN = '#3DD68C';

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

const PLATFORMS = [
  { key: 'meta', name: 'Meta Ads', dot: '#1877F2' },
  { key: 'google_ads', name: 'Google Ads', dot: '#EA4335' },
  { key: 'tiktok', name: 'TikTok', dot: '#25F4EE' },
];

const PlatformCard = ({ platform, connected, spend, leadCount, revenue }) => {
  const cpl = leadCount > 0 && spend > 0 ? money(spend / leadCount) : '-';
  const roas = spend > 0 ? (revenue / spend).toFixed(2) : '-';
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: platform.dot }} />
          <span className="text-[13px] font-semibold text-foreground">{platform.name}</span>
        </div>
        <span
          className="text-[8.5px] font-semibold tracking-[0.08em] uppercase px-2 py-0.5 rounded"
          style={connected
            ? { color: GREEN, background: 'rgba(61,214,140,0.12)' }
            : undefined}
        >
          {connected ? 'connected' : 'Not connected'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {[
          { label: 'Spend', value: spend > 0 ? money(spend) : '-' },
          { label: 'CPL', value: cpl },
          { label: 'ROAS', value: roas },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-[8.5px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">{s.label}</div>
            <div className="text-[14px] font-mono tabular-nums font-semibold text-foreground mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>
      <Button asChild variant="outline" size="sm" className="w-full mt-4 h-8 text-[11px]">
        <Link to="/settings?tab=integrations">Connect</Link>
      </Button>
    </div>
  );
};

export default function AdReport({ adSpend, adMappings, integrations, leads, suppliers = [], filters }) {
  const data = useMemo(() => {
    const f = applyFilters(leads, filters);
    // spendInWindow does two things this report was missing: it drops campaign
    // and ad rows (which are a drill-down of the same money, so summing them
    // alongside account rows double counted), and it honours the selected date
    // range. Every figure below is an aggregate, so all of them use it.
    const windowSpend = spendInWindow(adSpend, filters);
    const m = computeMetrics(f, windowSpend, internalSupplierSet(suppliers));
    const totalSpend = windowSpend.reduce((a, r) => a + num(r.spend), 0);

    const connectedSet = new Set(PLATFORMS.filter(p => integrations.find(c => c.name === p.key)).map(p => p.key));
    const syncedCount = connectedSet.size;

    const platformSpend = {};
    for (const p of PLATFORMS) platformSpend[p.key] = 0;
    for (const r of windowSpend) {
      const key = r.platform || 'meta';
      if (platformSpend[key] != null) platformSpend[key] += num(r.spend);
    }

    let capiEvents = 0;
    for (const l of f) {
      try {
        const log = JSON.parse(l.capi_log || '[]');
        if (Array.isArray(log) && log.length > 0) capiEvents++;
      } catch { /* ignore */ }
    }

    return { f, m, totalSpend, connectedSet, syncedCount, platformSpend, capiEvents, windowSpend };
  }, [adSpend, adMappings, integrations, leads, filters]);

  const { f, m, totalSpend, connectedSet, syncedCount, platformSpend, capiEvents, windowSpend } = data;

  const blendedCpl = totalSpend > 0 ? money(totalSpend / Math.max(f.length, 1)) : '-';
  const roas = totalSpend > 0 ? (m.revenue / totalSpend).toFixed(2) : '-';

  const mappingRows = adMappings.map((mp) => {
    const rows = windowSpend.filter(r => r.mapping_id === mp.id);
    const spend = rows.reduce((a, r) => a + num(r.spend), 0);
    const leadCount = rows.reduce((a, r) => a + num(r.leads), 0);
    const trueCpl = leadCount > 0 ? money(spend / leadCount) : '-';
    return {
      id: mp.id,
      name: mp.ad_account_name || mp.meta_campaign_name || mp.ad_account_id || 'Mapping',
      platform: mp.platform || 'meta',
      supplier: mp.supplier_name || '-',
      spend: money(spend),
      leads: leadCount.toLocaleString(),
      trueCpl,
    };
  });

  const tmpl = '1.8fr 1fr 1.2fr 1fr 0.8fr 1fr';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <ReportKpi label="Total Ad Spend" value={money(totalSpend)} hint={`${syncedCount}/3 platforms synced`} />
        <ReportKpi label="Blended CPL" value={blendedCpl} hint={totalSpend > 0 ? undefined : 'no spend basis'} />
        <ReportKpi label="ROAS" value={roas} hint="needs revenue + spend" />
        <ReportKpi
          label="CAPI Events Sent"
          value={capiEvents.toLocaleString()}
          tone={capiEvents === 0 ? 'risk' : undefined}
          hint={`${3 - syncedCount} connectors idle`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PLATFORMS.map((p) => (
          <PlatformCard
            key={p.key}
            platform={p}
            connected={connectedSet.has(p.key)}
            spend={platformSpend[p.key]}
            leadCount={f.length}
            revenue={m.revenue}
          />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold text-foreground">Spend by Campaign Mapping</h3>
        </div>
        {mappingRows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[12px] text-muted-foreground">No campaign mappings.</p>
            <Link to="/settings?tab=integrations" className="text-[12px] font-medium text-primary hover:underline mt-1 inline-block">
              Add mapping
            </Link>
          </div>
        ) : (
          <>
            <THead cols={['Mapping', 'Platform', 'Supplier', 'Spend', 'Leads', 'True CPL']} template={tmpl} first={3} />
            {mappingRows.map((r) => (
              <TRow
                key={r.id}
                template={tmpl}
                first={3}
                cells={[r.name, r.platform, r.supplier, r.spend, r.leads, r.trueCpl]}
              />
            ))}
          </>
        )}
      </div>

      <AINote>
        {totalSpend === 0
          ? 'no ad spend is synced, so CPL falls back to supplier-declared cost and real acquisition economics are not visible.'
          : `${money(totalSpend)} in ad spend across ${syncedCount}/3 connected platforms; blended CPL is ${blendedCpl} and ROAS is ${roas}.`}
      </AINote>
    </div>
  );
}