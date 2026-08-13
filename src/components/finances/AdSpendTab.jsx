import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { isWithinInterval } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, groupBy } from '@/lib/reportMetrics';
import { downloadCsv } from '@/lib/csv';
import { Panel, PanelHeader, THead, rise } from '@/components/finances/financeAtoms';
import { StatChip } from '@/components/finances/financeUi';

const PLATFORM_LABELS = {
  meta: 'Meta', facebook: 'Meta', google_ads: 'Google Ads', google: 'Google Ads',
  tiktok: 'TikTok', taboola: 'Taboola', bing: 'Microsoft', microsoft: 'Microsoft',
};
const label = (p) => PLATFORM_LABELS[String(p || '').toLowerCase()] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Unknown');
const n = (v) => { const x = Number(v); return isNaN(x) ? 0 : x; };
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

// Ad Spend: dynamic per-platform breakdown. Only platforms that are connected
// (have an AdSpendMapping) or have spend in the window are shown, each broken
// down by supplier (true CPL) and by ad account / source.
export default function AdSpendTab({ win }) {
  const { data: allSpend = [] } = useQuery({ queryKey: ['adspend'], queryFn: () => fetchAll((limit, skip) => base44.entities.AdSpend.list('-date', limit, skip)) });
  const { data: allLeads = [] } = useQuery({ queryKey: ['report-leads'], queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.filter({ archived: false }, '-created_date', limit, skip)) });
  const { data: mappings = [] } = useQuery({ queryKey: ['adspend-mappings'], queryFn: () => base44.entities.AdSpendMapping.list() });

  const inWin = (d) => !win || (d && isWithinInterval(new Date(d), { start: win.start, end: win.end }));
  // Only account-level rows (or legacy rows with no level) feed this tab, so the
  // new campaign and ad rows never triple count spend in totals, charts or tables.
  const adSpend = useMemo(() => allSpend.filter(r => (!r.level || r.level === 'account') && inWin(r.date)), [allSpend, win]);
  const leads = useMemo(() => allLeads.filter(l => inWin(l.created_date)), [allLeads, win]);

  const totalSpend = adSpend.reduce((a, r) => a + n(r.spend), 0);

  const connectedPlatforms = useMemo(() => uniq(mappings.map(m => String(m.platform || '').toLowerCase())), [mappings]);
  const platforms = useMemo(() => {
    const withSpend = uniq(adSpend.map(r => String(r.platform || '').toLowerCase()));
    return uniq([...connectedPlatforms, ...withSpend]);
  }, [connectedPlatforms, adSpend]);

  const perPlatform = useMemo(() => platforms.map(p => {
    const rows = adSpend.filter(r => String(r.platform || '').toLowerCase() === p);
    const spend = rows.reduce((a, r) => a + n(r.spend), 0);
    const suppliers = groupBy(leads, 'supplier_name', rows).filter(r => r.cost > 0 || r.leads > 0);
    const accountKeys = uniq(rows.map(r => r.ad_account || r.cost_source));
    const accounts = accountKeys
      .map(acc => ({ account: acc, spend: rows.filter(r => (r.ad_account || r.cost_source) === acc).reduce((a, r) => a + n(r.spend), 0) }))
      .sort((a, b) => b.spend - a.spend);
    return { platform: p, spend, connected: connectedPlatforms.includes(p), suppliers, accounts };
  }).filter(p => p.spend > 0 || p.connected).sort((a, b) => b.spend - a.spend), [platforms, adSpend, leads, connectedPlatforms]);

  const hasAny = perPlatform.length > 0;
  const cardCount = Math.min(4, perPlatform.length + 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-3 flex-1 min-w-[240px]" style={{ gridTemplateColumns: `repeat(${cardCount}, minmax(0, 1fr))` }}>
          <StatChip label="Total Ad Spend (synced)" value={money(totalSpend)} tone={totalSpend > 0 ? 'good' : undefined} pct={totalSpend > 0 ? 100 : 0} i={0} />
          {perPlatform.slice(0, 3).map((p, i) => (
            <StatChip key={p.platform} label={label(p.platform)} value={money(p.spend)} tone={p.spend > 0 ? 'good' : undefined} sub={p.connected ? 'connected' : 'no sync'} pct={totalSpend > 0 ? (p.spend / totalSpend) * 100 : 0} i={i + 1} />
          ))}
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => downloadCsv('ad_spend', [
          { key: 'date', label: 'Date' }, { key: 'platform', label: 'Platform' }, { key: 'supplier_name', label: 'Supplier' }, { key: 'cost_source', label: 'Source' }, { key: 'spend', label: 'Spend' },
        ], adSpend)}><Download className="w-3.5 h-3.5" /> Export</Button>
      </div>

      {!hasAny && (
        <Panel className="p-8 text-center text-[13px] text-muted-foreground">
          No ad platforms connected or spend synced in this period. Connect Meta and add campaign mappings in <Link to="/settings?tab=integrations" className="text-primary underline">Settings Integrations</Link>.
        </Panel>
      )}

      {perPlatform.map((p) => (
        <Panel key={p.platform} className="overflow-hidden">
          <PanelHeader title={label(p.platform)}>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-[10px] ${p.connected ? 'bg-status-sold status-sold' : 'text-muted-foreground'}`}>{p.connected ? 'connected' : 'no sync'}</Badge>
              <span className="text-[12px] font-mono tabular-nums text-foreground">{money(p.spend)}</span>
            </div>
          </PanelHeader>

          {p.spend === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">Connected, no spend synced in this period.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/60">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-4 pt-3 pb-1">By supplier / true CPL</div>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12px]">
                  <thead><THead cols={['Supplier', 'Leads', 'Spend', 'True CPL']} alignRight={[1, 2, 3]} /></thead>
                  <tbody className="divide-y divide-border/60">
                    {p.suppliers.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">No supplier attribution</td></tr>}
                    {p.suppliers.map((r, i) => (
                      <motion.tr key={r.key} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                        <td className="px-4 py-2 text-foreground">{r.key}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">{r.leads}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">{money(r.cost)}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">{money(r.cpl)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-4 pt-3 pb-1">By ad account / source</div>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12px]">
                  <thead><THead cols={['Account / Source', 'Spend']} alignRight={[1]} /></thead>
                  <tbody className="divide-y divide-border/60">
                    {p.accounts.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-muted-foreground">No account detail</td></tr>}
                    {p.accounts.map((a, i) => (
                      <motion.tr key={a.account || i} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                        <td className="px-4 py-2 text-foreground">{a.account || '-'}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">{money(a.spend)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}
        </Panel>
      ))}

      {adSpend.length > 0 && (
        <Panel className="overflow-hidden">
          <PanelHeader title="All Ad Spend Rows" />
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead><THead cols={['Date', 'Platform', 'Supplier', 'Source', 'Spend']} alignRight={[4]} /></thead>
            <tbody className="divide-y divide-border/60">
              {adSpend.slice(0, 200).map((r, i) => (
                <motion.tr key={r.id} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.date}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{label(r.platform)}</Badge></td>
                  <td className="px-4 py-2.5 text-foreground">{r.supplier_name || '-'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.ad_account || r.cost_source || '-'}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.spend)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>
      )}
    </div>
  );
}