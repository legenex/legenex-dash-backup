import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line, Cell,
} from 'recharts';
import {
  Megaphone, Download, Columns3, ChevronDown, ChevronRight, Check, ShieldCheck, BarChart3, LineChart,
  Link2, RefreshCw, Database, MapPin, Layers, Clock, Video, Play, Info,
} from 'lucide-react';
import { downloadCsv } from '@/lib/csv';
import { Panel, SectionHead, Btn, Tag, HeatCell, SpendCell, Decision, AiScore, Thumb, rise, TONE, EmptyState } from './adAtoms';
import {
  f0, f2, num, pct, compact, roasText, cplTone, roasTone, decisionOf, platformLabel,
  buildCampaigns, buildAdSets, breakoutByField, breakoutByHour, breakoutByAd, buildSyncRoster, portfolioSeries,
} from '@/lib/adManagerMetrics';

const dash = <span className="text-muted-foreground/40">-</span>;

/* ------------------------------------------------------------------ */
/*  Spend versus verified revenue, by account                          */
/* ------------------------------------------------------------------ */
export function PortfolioChart({ accounts, platform }) {
  const data = useMemo(() => portfolioSeries(accounts), [accounts]);
  if (!data.length) return null;
  return (
    <Panel>
      <SectionHead
        icon={LineChart}
        title="Spend vs Verified Revenue by Account"
        sub="The distance between the spend bars and the verified line is margin proven by the leads data."
        right={<Tag>{platformLabel(platform)}</Tag>}
      />
      <div className="relative h-[230px] px-2 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.4)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10.5 }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} interval={0} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10.5 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => '$' + compact(v)} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, color: 'hsl(var(--foreground))' }}
              cursor={{ fill: 'hsl(var(--foreground) / 0.03)' }}
              formatter={(v, n) => [f0(v), n]}
            />
            <Bar dataKey="spend" name="Spend" fill="hsl(var(--primary))" fillOpacity={0.85} barSize={16} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line type="monotone" dataKey="revenue" name="Verified revenue" stroke={TONE.good} strokeWidth={1.6} dot={{ r: 2.5, fill: TONE.good, strokeWidth: 0 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-5 pb-3">
        <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground"><span className="w-2.5 h-2.5 rounded-sm bg-primary/85" /> Spend</span>
        <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground"><span className="w-4 h-0.5 rounded-full" style={{ background: TONE.good }} /> Verified revenue</span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Accounts summary                                                   */
/* ------------------------------------------------------------------ */
export function AccountsSummary({ accounts, platform }) {
  const max = Math.max(1, ...accounts.map((r) => r.spend));
  const T = '2fr 1fr 1fr 0.9fr 1fr 0.9fr 108px';

  const exportRows = () => downloadCsv('ad_manager_accounts', [
    { key: 'name', label: 'Account' }, { key: 'brand', label: 'Brand' }, { key: 'supplierName', label: 'Supplier' },
    { key: 'spend', label: 'Spend' }, { key: 'reportedCpl', label: 'Reported CPL' }, { key: 'realCpl', label: 'Real CPL' },
    { key: 'qualified', label: 'Qualified' }, { key: 'sold', label: 'Sold' }, { key: 'revenue', label: 'Revenue' }, { key: 'roas', label: 'ROAS' },
  ], accounts);

  return (
    <Panel>
      <SectionHead
        icon={BarChart3}
        title="Accounts"
        sub={`Every ${platformLabel(platform)} account with synced spend, joined to verified sold economics`}
        right={<Btn icon={Download} onClick={exportRows}>Export</Btn>}
      />
      <div className="grid gap-2 px-4 py-2.5 border-b border-border/60 bg-background/40 text-[9.5px] font-semibold tracking-[0.1em] uppercase items-center text-muted-foreground/70" style={{ gridTemplateColumns: T }}>
        <span>Account</span>
        <span className="text-right">Spend</span>
        <span className="text-right" style={{ color: TONE.warn }}>Rep. CPL</span>
        <span className="text-right" style={{ color: TONE.good }}>Real CPL</span>
        <span className="text-right" style={{ color: TONE.good }}>Revenue</span>
        <span className="text-right" style={{ color: TONE.good }}>ROAS</span>
        <span className="text-right">Decision</span>
      </div>
      {accounts.map((r, i) => (
        <motion.div key={r.id} variants={rise} initial="hidden" animate="show" custom={i}
          className="grid gap-2 px-4 py-3 border-b border-border/60 items-center hover:bg-foreground/[0.02]" style={{ gridTemplateColumns: T }}>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold truncate text-foreground">{r.name}</div>
            <div className="text-[10px] mt-0.5 text-muted-foreground/70 truncate">
              {[r.brand, r.supplierName].filter(Boolean).join(', ') || (r.mapped ? 'no attribution set' : 'unmapped ad account')}
            </div>
          </div>
          <div className="flex justify-end"><SpendCell value={r.spend} ratio={r.spend / max} format={f0} /></div>
          <span className="text-right text-[11.5px] font-mono tabular-nums" style={{ color: TONE.warn }}>{f2(r.reportedCpl)}</span>
          <div className="flex justify-end">{r.realCpl == null ? dash : <HeatCell value={f2(r.realCpl)} tone={cplTone(r.realCpl)} />}</div>
          <span className="text-right text-[11.5px] font-mono tabular-nums text-foreground">{f0(r.revenue)}</span>
          <div className="flex justify-end">{r.roas == null ? dash : <HeatCell value={roasText(r.roas)} tone={roasTone(r.roas)} />}</div>
          <div className="flex justify-end"><Decision d={decisionOf(r.roas)} /></div>
        </motion.div>
      ))}
      <div className="px-4 py-2.5 text-[10.5px] text-muted-foreground/70">
        Accounts with no AdSpendMapping cannot attribute leads to a supplier, so their verified columns stay empty.
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Campaigns table with column picker, sort and drilldown             */
/* ------------------------------------------------------------------ */
const ALL_COLS = [
  { id: 'score', label: 'AI', req: true, w: '52px', align: 'right' },
  { id: 'decision', label: 'Decision', req: true, w: '108px', align: 'left' },
  { id: 'spend', label: 'Spend', req: true, w: '1fr', align: 'right' },
  { id: 'impressions', label: 'Impr', w: '0.8fr', align: 'right' },
  { id: 'ctr', label: 'CTR', w: '0.7fr', align: 'right' },
  { id: 'cpc', label: 'CPC', w: '0.7fr', align: 'right' },
  { id: 'reportedCpl', label: 'Rep. CPL', w: '0.9fr', align: 'right' },
  { id: 'realCpl', label: 'Real CPL', w: '1fr', align: 'right', verified: true },
  { id: 'sold', label: 'Sold', w: '0.7fr', align: 'right', verified: true },
  { id: 'revenue', label: 'Revenue', w: '1fr', align: 'right', verified: true },
  { id: 'roas', label: 'ROAS', w: '0.9fr', align: 'right', verified: true },
];

export function CampaignsTable({ account, spendRows, creativeMeta }) {
  const [visible, setVisible] = useState(() => new Set(ALL_COLS.map((c) => c.id)));
  const [picker, setPicker] = useState(false);
  const [sort, setSort] = useState({ k: 'spend', dir: -1 });
  const [exp, setExp] = useState(null);

  const rows = useMemo(() => buildCampaigns(account, spendRows), [account, spendRows]);
  const expanded = useMemo(
    () => (exp ? buildAdSets(rows.find((r) => r.id === exp), spendRows, creativeMeta) : []),
    [exp, rows, spendRows, creativeMeta]
  );

  const maxSpend = Math.max(1, ...rows.map((r) => r.spend));
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((x, y) => {
      const a = x[sort.k], b = y[sort.k];
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (a > b ? 1 : a < b ? -1 : 0) * sort.dir;
    });
    return arr;
  }, [rows, sort]);

  const cols = ALL_COLS.filter((c) => visible.has(c.id));
  const tmpl = `26px 1.7fr ${cols.map((c) => c.w).join(' ')}`;
  const toggle = (id) => setVisible((s) => { const n2 = new Set(s); n2.has(id) ? n2.delete(id) : n2.add(id); return n2; });
  const setSortK = (k) => setSort((s) => ({ k, dir: s.k === k ? -s.dir : -1 }));

  if (!rows.length) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No campaign spend synced for this window"
        body="syncMetaSpend writes campaign level rows on every run. Run a sync, or widen the date range."
      />
    );
  }

  const cell = (r, c) => {
    switch (c.id) {
      case 'score': return <AiScore n={r.score} />;
      case 'decision': return <div><Decision d={r.decision} /></div>;
      case 'spend': return <SpendCell value={r.spend} ratio={r.spend / maxSpend} format={f0} />;
      case 'impressions': return <span className="text-[11.5px] font-mono tabular-nums text-muted-foreground">{compact(r.impressions)}</span>;
      case 'ctr': return <span className="text-[11.5px] font-mono tabular-nums text-muted-foreground">{pct(r.ctr)}</span>;
      case 'cpc': return <span className="text-[11.5px] font-mono tabular-nums text-muted-foreground">{f2(r.cpc)}</span>;
      case 'reportedCpl': return <span className="text-[11.5px] font-mono tabular-nums" style={{ color: TONE.warn }}>{f2(r.reportedCpl)}</span>;
      case 'realCpl': return r.realCpl == null ? dash : <HeatCell value={f2(r.realCpl)} tone={cplTone(r.realCpl)} />;
      case 'sold': return <span className="text-[11.5px] font-mono tabular-nums font-semibold" style={{ color: TONE.good }}>{num(r.sold)}</span>;
      case 'revenue': return <span className="text-[11.5px] font-mono tabular-nums text-foreground">{f0(r.revenue)}</span>;
      case 'roas': return r.roas == null ? dash : <HeatCell value={roasText(r.roas)} tone={roasTone(r.roas)} />;
      default: return null;
    }
  };

  return (
    <Panel className="overflow-visible">
      <SectionHead
        icon={Megaphone}
        title="Campaigns"
        sub="Meta campaign spend joined to real sold economics on utm_campaign. Expand a row for ad sets and ads."
        right={
          <div className="flex items-center gap-2 relative">
            <button onClick={() => setPicker((p) => !p)} className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11.5px] font-medium border border-border bg-background/50 text-muted-foreground hover:text-foreground">
              <Columns3 className="w-3 h-3" /> Columns <ChevronDown className="w-3 h-3" />
            </button>
            {picker && (
              <div className="absolute right-0 top-9 z-30 w-56 p-2 rounded-lg border border-border bg-popover shadow-2xl">
                <div className="text-[9.5px] font-bold tracking-[0.12em] uppercase px-2 py-1.5 text-muted-foreground/70">Metrics on this account</div>
                {ALL_COLS.map((c) => (
                  <button key={c.id} disabled={c.req} onClick={() => toggle(c.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] hover:bg-accent/40 disabled:opacity-50">
                    <span className={`w-4 h-4 rounded grid place-items-center border ${visible.has(c.id) ? 'bg-primary border-primary' : 'border-border'}`}>
                      {visible.has(c.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                    </span>
                    <span className="flex-1 text-left text-foreground">{c.label}</span>
                    {c.verified && <ShieldCheck className="w-3 h-3" style={{ color: TONE.good }} />}
                  </button>
                ))}
              </div>
            )}
            <Btn icon={Download} onClick={() => downloadCsv('ad_manager_campaigns', [
              { key: 'name', label: 'Campaign' }, { key: 'spend', label: 'Spend' }, { key: 'reportedCpl', label: 'Reported CPL' },
              { key: 'realCpl', label: 'Real CPL' }, { key: 'sold', label: 'Sold' }, { key: 'revenue', label: 'Revenue' }, { key: 'roas', label: 'ROAS' },
            ], rows)}>Export</Btn>
          </div>
        }
      />
      <div className="grid gap-2 px-4 py-2.5 border-b border-border/60 bg-background/40 text-[9.5px] font-semibold tracking-[0.1em] uppercase items-center" style={{ gridTemplateColumns: tmpl }}>
        <span />
        <button onClick={() => setSortK('name')} className="flex items-center gap-1 text-left text-muted-foreground/70">Campaign</button>
        {cols.map((c) => (
          <button key={c.id} onClick={() => setSortK(c.id)}
            className={`flex items-center gap-1 ${c.align === 'right' ? 'justify-end' : ''}`}
            style={{ color: c.verified ? TONE.good : undefined }}>
            <span className={c.verified ? '' : 'text-muted-foreground/70'}>{c.label}</span>
          </button>
        ))}
      </div>

      {sorted.map((r, i) => (
        <div key={r.id}>
          <motion.div variants={rise} initial="hidden" animate="show" custom={Math.min(i, 8)}
            onClick={() => setExp(exp === r.id ? null : r.id)}
            className="grid gap-2 px-4 py-2.5 border-b border-border/60 items-center cursor-pointer hover:bg-foreground/[0.02]" style={{ gridTemplateColumns: tmpl }}>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 transition-transform" style={{ transform: exp === r.id ? 'rotate(90deg)' : 'none' }} />
            <span className="text-[12.5px] font-semibold truncate text-foreground flex items-center gap-1.5">
              {r.name}
              {!r.matched && <span title="No lead carries this campaign name in utm_campaign, so verified columns are empty"><Info className="w-3 h-3 text-muted-foreground/50" /></span>}
            </span>
            {cols.map((c) => <div key={c.id} className={`flex ${c.align === 'right' ? 'justify-end' : 'justify-start'}`}>{cell(r, c)}</div>)}
          </motion.div>

          {exp === r.id && (
            <div className="bg-background/40 border-b border-border/60">
              {expanded.length === 0 && (
                <div className="px-4 py-3 text-[11px] text-muted-foreground/70">No ad level rows synced for this campaign in this window.</div>
              )}
              {expanded.map((as) => (
                <div key={as.id}>
                  <div className="grid gap-2 px-4 py-2 items-center" style={{ gridTemplateColumns: tmpl }}>
                    <span />
                    <span className="text-[11.5px] pl-3 flex items-center gap-1.5 text-muted-foreground truncate">
                      <Layers className="w-3 h-3 text-muted-foreground/60" /> {as.name}
                    </span>
                    {cols.map((c) => (
                      <div key={c.id} className={`flex ${c.align === 'right' ? 'justify-end' : 'justify-start'} text-[10.5px] font-mono text-muted-foreground`}>
                        {c.id === 'spend' ? f0(as.spend) : c.id === 'impressions' ? compact(as.impressions) : c.id === 'sold' ? num(as.sold) : c.id === 'revenue' ? f0(as.revenue) : ''}
                      </div>
                    ))}
                  </div>
                  {as.ads.map((ad) => (
                    <div key={ad.id} className="grid gap-2 px-4 py-1.5 items-center hover:bg-foreground/[0.02]" style={{ gridTemplateColumns: tmpl }}>
                      <span />
                      <span className="text-[11px] pl-8 flex items-center gap-1.5 text-muted-foreground/70 truncate">
                        <Play className="w-2.5 h-2.5" fill="currentColor" /> {ad.name}
                      </span>
                      {cols.map((c) => (
                        <div key={c.id} className={`flex ${c.align === 'right' ? 'justify-end' : 'justify-start'} text-[10.5px] font-mono text-muted-foreground/70`}>
                          {c.id === 'spend' ? f0(ad.spend)
                            : c.id === 'impressions' ? compact(ad.impressions)
                            : c.id === 'realCpl' ? (ad.realCpl == null ? dash : f2(ad.realCpl))
                            : c.id === 'sold' ? (ad.matched ? num(ad.sold) : dash)
                            : c.id === 'revenue' ? (ad.matched ? f0(ad.revenue) : dash)
                            : c.id === 'roas' ? (ad.roas == null ? dash : roasText(ad.roas))
                            : ''}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="px-4 py-2.5 flex items-center justify-between text-[10.5px] text-muted-foreground/70 flex-wrap gap-2">
        <span>{sorted.length} campaigns, click a row to drill into ad sets and ads</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: TONE.good }} /> healthy</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: TONE.warn }} /> watch</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: TONE.bad }} /> critical</span>
        </span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Breakouts                                                          */
/* ------------------------------------------------------------------ */
const TABS = [
  { id: 'state', label: 'By State', icon: MapPin },
  { id: 'placement', label: 'By Placement', icon: Layers },
  { id: 'hour', label: 'By Hour', icon: Clock },
  { id: 'ad', label: 'By Ad', icon: Video },
];

const Head = ({ cols, tmpl }) => (
  <div className="grid gap-2 px-4 py-2.5 border-b border-border/60 bg-background/40 text-[9.5px] font-semibold tracking-[0.1em] uppercase" style={{ gridTemplateColumns: tmpl }}>
    {cols.map((c, i) => (
      <span key={i} className={i === 0 ? '' : 'text-right'} style={{ color: c.v ? TONE.good : undefined }}>
        <span className={c.v ? '' : 'text-muted-foreground/70'}>{c.l ?? c}</span>
      </span>
    ))}
  </div>
);

export function Breakouts({ scope, spendRows, creativeMeta }) {
  const [tab, setTab] = useState('state');
  const T = '1.6fr repeat(3,1fr) 0.8fr 1fr';

  const rows = useMemo(() => {
    if (tab === 'state') return breakoutByField(scope, 'accident_state');
    if (tab === 'placement') return breakoutByField(scope, 'utm_terms');
    if (tab === 'hour') return breakoutByHour(scope);
    return breakoutByAd(scope, spendRows, creativeMeta);
  }, [tab, scope, spendRows, creativeMeta]);

  const allocated = tab !== 'ad';

  return (
    <Panel>
      <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-1 overflow-x-auto">
        {TABS.map((b) => {
          const on = b.id === tab;
          return (
            <button key={b.id} onClick={() => setTab(b.id)}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11.5px] font-medium border shrink-0 ${
                on ? 'border-primary/35 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}>
              <b.icon className="w-3 h-3" /> {b.label}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] flex items-center gap-1.5 text-muted-foreground/70 whitespace-nowrap">
          <ShieldCheck className="w-3 h-3" style={{ color: TONE.good }} /> outcomes tied to real sold leads, not platform conversions
        </span>
      </div>

      {allocated && (
        <div className="mx-4 mt-2 mb-1 flex items-start gap-2 p-2.5 rounded-lg border border-border bg-background/50">
          <Info className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/70" />
          <p className="text-[10.5px] text-muted-foreground/80 leading-relaxed">
            Meta does not report spend by {tab === 'hour' ? 'hour' : tab}. Leads, sold and revenue below are real. Spend is allocated across rows in proportion to qualified lead share, so it is an attribution estimate and not reported spend.
          </p>
        </div>
      )}

      {rows.length === 0 && (
        <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">No data for this breakout in the selected window.</div>
      )}

      {tab === 'hour' && rows.length > 0 && (
        <div className="px-4 pt-3 pb-1 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="hsl(var(--border) / 0.4)" vertical={false} />
              <XAxis dataKey="key" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} interval={1} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => '$' + compact(v)} />
              <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }} formatter={(v, n) => [f0(v), n]} />
              <Bar dataKey="allocatedSpend" name="Allocated spend" radius={[3, 3, 0, 0]}>
                {rows.map((h, i) => <Cell key={i} fill={cplTone(h.realCpl)} fillOpacity={0.85} />)}
              </Bar>
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke={TONE.good} strokeWidth={1.6} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {rows.length > 0 && tab !== 'ad' && (
        <>
          <Head tmpl={T} cols={[
            tab === 'state' ? 'State' : tab === 'placement' ? 'Placement' : 'Hour (app time)',
            { l: 'Spend (allocated)' }, 'Leads', { l: 'Real CPL', v: 1 }, { l: 'Sold', v: 1 }, { l: 'Revenue', v: 1 },
          ]} />
          {rows.map((s, i) => (
            <motion.div key={s.key} variants={rise} initial="hidden" animate="show" custom={Math.min(i, 8)}
              className="grid gap-2 px-4 py-2.5 border-b border-border/60 items-center hover:bg-foreground/[0.02]" style={{ gridTemplateColumns: T }}>
              <span className="text-[12px] font-semibold text-foreground truncate">{s.key}</span>
              <span className="text-right text-[11.5px] font-mono tabular-nums text-muted-foreground">{f0(s.allocatedSpend)}</span>
              <span className="text-right text-[11.5px] font-mono tabular-nums text-muted-foreground">{num(s.leads)}</span>
              <span className="text-right">{s.realCpl == null ? dash : <HeatCell value={f2(s.realCpl)} tone={cplTone(s.realCpl)} />}</span>
              <span className="text-right text-[11.5px] font-mono tabular-nums font-semibold" style={{ color: TONE.good }}>{num(s.sold)}</span>
              <span className="text-right text-[11.5px] font-mono tabular-nums text-foreground">{f0(s.revenue)}</span>
            </motion.div>
          ))}
        </>
      )}

      {rows.length > 0 && tab === 'ad' && (
        <>
          <Head tmpl="34px 1.9fr 1fr 0.8fr 1fr 1fr" cols={['', 'Ad', 'Spend', { l: 'Real CPL', v: 1 }, { l: 'Sold', v: 1 }, { l: 'Revenue', v: 1 }]} />
          {rows.map((s, i) => (
            <motion.div key={s.key + i} variants={rise} initial="hidden" animate="show" custom={Math.min(i, 8)}
              className="grid gap-2 px-4 py-2.5 border-b border-border/60 items-center hover:bg-foreground/[0.02]" style={{ gridTemplateColumns: '34px 1.9fr 1fr 0.8fr 1fr 1fr' }}>
              <Thumb kind={s.creativeType} w={26} h={26} />
              <span className="min-w-0">
                <span className="text-[12px] font-semibold block truncate text-foreground">{s.key}</span>
                <span className="text-[10px] text-muted-foreground/70">
                  {s.tagged ? [s.concept, s.creator].filter(Boolean).join(', ') || 'tagged' : 'not tagged, verified outcomes unavailable'}
                </span>
              </span>
              <span className="text-right text-[11.5px] font-mono tabular-nums text-muted-foreground">{f0(s.spend)}</span>
              <span className="text-right">{s.realCpl == null ? dash : <HeatCell value={f2(s.realCpl)} tone={cplTone(s.realCpl)} />}</span>
              <span className="text-right text-[11.5px] font-mono tabular-nums font-semibold" style={{ color: TONE.good }}>{s.matched ? num(s.sold) : dash}</span>
              <span className="text-right text-[11.5px] font-mono tabular-nums text-foreground">{s.matched ? f0(s.revenue) : dash}</span>
            </motion.div>
          ))}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Connected accounts sync roster                                     */
/* ------------------------------------------------------------------ */
const statusTone = (s) => (s === 'Synced' ? TONE.good : s === 'Stale' ? TONE.warn : s === 'Unmapped' || s === 'Never synced' ? TONE.bad : TONE.neutral);

export function SyncRoster({ accounts, mappings, platform, onSync }) {
  const groups = useMemo(() => buildSyncRoster({ accounts, mappings, platform }), [accounts, mappings, platform]);
  const total = groups.reduce((a, g) => a + g.items.length, 0);

  if (!total) {
    return (
      <EmptyState
        icon={Link2}
        title={`No ${platformLabel(platform)} ad accounts mapped`}
        body="Add an AdSpendMapping for each ad account so its spend attributes to a supplier, brand and vertical."
        action={<Link to="/settings?tab=integrations"><Btn icon={Link2} primary>Open Integrations</Btn></Link>}
      />
    );
  }

  return (
    <Panel>
      <SectionHead
        icon={Link2}
        title="Connected accounts"
        sub={`${total} ad accounts grouped by brand, mapping and sync health`}
        right={<Btn icon={RefreshCw} onClick={onSync}>Sync all</Btn>}
      />
      <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {groups.map((g) => (
          <div key={g.group} className="rounded-lg border border-border/60 overflow-hidden bg-background/40">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
              <span className="text-[11.5px] font-semibold flex items-center gap-1.5 text-foreground">
                <Database className="w-3 h-3 text-muted-foreground/70" /> {g.group}
              </span>
              <span className="text-[10px] text-muted-foreground/70">{g.items.length} accounts</span>
            </div>
            {g.items.map((ac) => (
              <div key={ac.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/60 last:border-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusTone(ac.status) }} />
                <span className="text-[11.5px] flex-1 truncate text-muted-foreground">{ac.name}</span>
                {ac.supplier && <span className="text-[9.5px] px-1.5 py-0.5 rounded tag-neutral">{ac.supplier}</span>}
                <span className="text-[10px] w-20 text-right" style={{ color: statusTone(ac.status) }}>{ac.status}</span>
                <span className="text-[10px] w-14 text-right text-muted-foreground/60">
                  {ac.ageMin == null ? '-' : ac.ageMin < 60 ? `${Math.round(ac.ageMin)}m` : `${Math.round(ac.ageMin / 60)}h`}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}
