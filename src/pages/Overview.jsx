import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import OverviewHeader from '@/components/overview/OverviewHeader';
import GroupedKpiCard from '@/components/overview/GroupedKpiCard';
import StatCard from '@/components/overview/StatCard';
import ActionQueueCard from '@/components/overview/ActionQueueCard';
import DataConfidenceCard from '@/components/overview/DataConfidenceCard';
import AiAnalystBand from '@/components/overview/AiAnalystBand';
import { openDataBotWithQuestion } from '@/lib/chatBotBridge';
import ActivityStreamBar from '@/components/overview/ActivityStreamBar';
import StatusStripBar from '@/components/overview/StatusStripBar';
import Reveal from '@/components/overview/Reveal';
import PanelSectionHeader from '@/components/overview/PanelSectionHeader';
import CountUpText from '@/components/overview/CountUpText';
import AnimatedPanel from '@/components/overview/AnimatedPanel';
import PipelineHealthStrip from '@/components/overview/PipelineHealthStrip';
import LeadVolumeByStatus from '@/components/overview/LeadVolumeByStatus';
import OverviewRejectionReasons from '@/components/overview/OverviewRejectionReasons';
import SupplierLeaderboard from '@/components/overview/SupplierLeaderboard';
import { Badge } from '@/components/ui/badge';
import {
  Bar, Line, ComposedChart, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign, TrendingUp, Megaphone, Users, Layers, Trophy, ShieldAlert, ArrowUpRight,
  CheckCircle2, AlertTriangle, Activity, GitBranch, BarChart3, ListFilter, Award,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { resolvePeriod, PERIOD_LABELS } from '@/lib/periodRange';
import { leadEventInstant, leadField } from '@/lib/reportMetrics';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  financialTruth, actionQueue, financeDonut, dailyFinance, topCampaigns, buyerRisk, fmtMoney,
} from '@/lib/overviewFinance';
import { money, int } from '@/lib/reportMetrics';
import useAiBriefing from '@/hooks/useAiBriefing';
import { toast } from 'sonner';

const CAMPAIGN_TAG_TONE = { Scale: 'status-sold-bg status-sold', Watch: 'status-warn-bg status-unsold', Cut: 'status-error-bg status-error' };
const RISK_TONE = {
  Overdue: 'status-error-bg status-error',
  Outstanding: 'status-warn-bg status-unsold',
  Overpaid: 'bg-status-duplicate status-duplicate',
  Settled: 'status-sold-bg status-sold',
};
// Buyer-risk status -> the label copy the command center uses.
const RISK_LABEL = { Overdue: 'Short Paid', Outstanding: 'No Payment Source', Overpaid: 'Overpaid', Settled: 'On Track' };

const norm = (v) => String(v ?? '').trim().toLowerCase();

// Supplier names arrive from inbound payloads in whatever case the supplier
// uses (LEADFLOW) while the record may read LeadFlow, so compare loosely rather
// than splitting one supplier into two.
function supplierMatches(value, wanted) {
  const have = norm(value);
  if (!have || !wanted) return false;
  return have === wanted || have.includes(wanted) || wanted.includes(have);
}

// A lead's source lives in the mapped_fields bag under any of several keys.
function overviewSource(lead) {
  let mf = {};
  try { mf = JSON.parse(lead.mapped_fields || '{}'); } catch { mf = {}; }
  for (const key of ['utm_source', 'source', 'lead_source', 'source_id', 'src']) {
    for (const [k, v] of Object.entries(mf)) {
      if (k.toLowerCase() === key && v != null && v !== '') return String(v);
    }
  }
  return null;
}

// One dimension filter. Multi-select: clicking an option toggles it, so a
// second click deselects, and several selections mean "any of these".
// Sized to sit inline with the period bar rather than stretch across a row.
function OverviewFilter({ label, value, onChange, options }) {
  return (
    <MultiSelect
      value={value}
      onValueChange={onChange}
      options={options.map((o) => ({ value: o, label: o }))}
      placeholder={`${label}: All`}
      className={`h-9 w-[150px] text-[12px] bg-card ${value.length > 0 ? 'border-primary' : 'border-border'}`}
    />
  );
}

export default function Overview() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [compare, setCompare] = useState(false);

  // "refreshed Xs ago" telemetry clock, resets whenever the user refreshes.
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const refreshedAgo = Math.max(0, Math.round((nowTick - refreshedAt) / 1000));

  // Force Sync: invoke a sync backend function on demand, then refresh queries.
  const runForceSync = async (fn, args, label) => {
    try {
      await base44.functions.invoke(fn, args || {});
      toast.success(`${label} sync started`);
      qc.invalidateQueries();
      setRefreshedAt(Date.now());
    } catch {
      toast.error(`${label} sync failed`);
    }
  };

  // Manual refresh. Re-reading cached queries alone left stale Meta spend on
  // screen, which is why the number here could sit hours behind Ads Manager, so
  // pull a fresh incremental sync first and only then invalidate. Incremental
  // keeps this to a trailing few days across every ad account so the button
  // stays responsive; the whole-month deep pass lives on Sync All and the daily
  // scheduled job.
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await base44.functions.invoke('syncMetaSpend', { mode: 'incremental' });
    } catch {
      toast.error('Meta spend refresh failed, showing last synced figures');
    } finally {
      qc.invalidateQueries();
      setRefreshedAt(Date.now());
      setRefreshing(false);
    }
  };

  const win = useMemo(() => resolvePeriod(period, custom), [period, custom]);

  // Dimension filters. Arrays so several values can be selected at once; an
  // empty array means All.
  const [buyerFilter, setBuyerFilter] = useState([]);
  const [supplierFilter, setSupplierFilter] = useState([]);
  const [sourceFilter, setSourceFilter] = useState([]);
  const [verticalFilter, setVerticalFilter] = useState([]);

  const { data: leads = [] } = useQuery({ queryKey: ['ov-leads'], queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.filter({ archived: false }, '-created_date', limit, skip)) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: invoices = [] } = useQuery({ queryKey: ['all-invoices'], queryFn: () => base44.entities.Invoice.list('-created_date', 500) });
  const { data: payments = [] } = useQuery({ queryKey: ['buyer-payments'], queryFn: () => base44.entities.BuyerPayment.list('-paid_date', 500) });
  const { data: payouts = [] } = useQuery({ queryKey: ['supplier-payouts'], queryFn: () => base44.entities.SupplierPayout.list('-created_date', 500) });
  const { data: adSpend = [] } = useQuery({ queryKey: ['adspend'], queryFn: () => fetchAll((limit, skip) => base44.entities.AdSpend.list('-date', limit, skip)) });
  const { data: txns = [] } = useQuery({ queryKey: ['bank-txns'], queryFn: () => base44.entities.BankTransaction.list('-date', 500) });
  const { data: errors = [] } = useQuery({ queryKey: ['ov-errors'], queryFn: () => base44.entities.ErrorLog.list('-created_date', 500) });
  const { data: integrations = [] } = useQuery({ queryKey: ['integration-configs'], queryFn: () => base44.entities.IntegrationConfig.list() });
  const { data: spendMappings = [] } = useQuery({ queryKey: ['adspend-mappings'], queryFn: () => base44.entities.AdSpendMapping.list() });
  const { data: leadSources = [] } = useQuery({ queryKey: ['lead-sources'], queryFn: () => base44.entities.LeadSource.list('-created_date', 100) });

  // Filtered dataset. Leads narrow on all three dimensions; ad spend can only
  // narrow on supplier, because AdSpend rows carry a supplier but have no buyer
  // or lead-source dimension. Spend is incurred before a lead is ever sold to a
  // buyer, so a buyer filter genuinely cannot attribute it. Rather than invent
  // an allocation, cost is left whole and the card says so.
  const fLeads = useMemo(() => {
    const nb = buyerFilter.map(norm); const ns = supplierFilter.map(norm);
    const nsrc = sourceFilter.map(norm); const nv = verticalFilter.map(norm);
    if (!nb.length && !ns.length && !nsrc.length && !nv.length) return leads;
    return leads.filter((l) => {
      if (nb.length && !nb.includes(norm(leadField(l, 'buyer')))) return false;
      if (ns.length && !ns.some((w) => supplierMatches(l.supplier_name, w))) return false;
      if (nsrc.length && !nsrc.includes(norm(overviewSource(l)))) return false;
      if (nv.length && !nv.includes(norm(leadField(l, 'vertical')))) return false;
      return true;
    });
  }, [leads, buyerFilter, supplierFilter, sourceFilter, verticalFilter]);

  const fAdSpend = useMemo(() => {
    const ns = supplierFilter.map(norm); const nv = verticalFilter.map(norm);
    if (!ns.length && !nv.length) return adSpend;
    return adSpend.filter((r) => {
      if (ns.length && !ns.some((w) => supplierMatches(r.supplier_key ?? r.supplier_name, w))) return false;
      // AdSpend rows carry a vertical, so a vertical filter narrows cost too.
      if (nv.length && !nv.includes(norm(r.vertical))) return false;
      return true;
    });
  }, [adSpend, supplierFilter, verticalFilter]);

  const costUnfiltered = buyerFilter.length > 0 || sourceFilter.length > 0;

  // Filter options come from leads inside the selected period, so a July view
  // never offers a source that only ever appeared in June.
  const filterOptions = useMemo(() => {
    const inWin = (l) => {
      const inst = leadEventInstant(l);
      if (!inst) return false;
      if (win?.start && inst < win.start) return false;
      if (win?.end && inst > win.end) return false;
      return true;
    };
    const b = new Set(); const s = new Set(); const src = new Set(); const v = new Set();
    for (const l of leads) {
      if (!inWin(l)) continue;
      // The top-level buyer_name column is null on leads: the buyer lives in
      // the mapped_fields bag, which leadField resolves through its aliases.
      // Reading the column directly produced an empty dropdown that matched
      // nothing.
      const bv = leadField(l, 'buyer'); if (bv) b.add(String(bv));
      if (l.supplier_name) s.add(String(l.supplier_name));
      const sv = overviewSource(l); if (sv) src.add(sv);
      const vv = leadField(l, 'vertical'); if (vv) v.add(String(vv));
    }
    const sorted = (set) => [...set].sort((x, y) => x.localeCompare(y));
    return { buyers: sorted(b), suppliers: sorted(s), sources: sorted(src), verticals: sorted(v) };
  }, [leads, win]);

  const dataset = { leads: fLeads, buyers, suppliers, invoices, payments, payouts, adSpend: fAdSpend, txns };

  const truth = useMemo(() => financialTruth(dataset, win), [fLeads, buyers, suppliers, invoices, payments, payouts, fAdSpend, txns, win]);
  const queue = useMemo(() => actionQueue(truth, txns), [truth, txns]);
  const donut = useMemo(() => financeDonut(truth.wLeads), [truth]);
  const donutTotal = useMemo(() => donut.reduce((a, d) => a + d.value, 0), [donut]);
  const soldRate = donutTotal ? ((donut.find(d => d.name === 'Sold')?.value || 0) / donutTotal) * 100 : 0;
  const daily = useMemo(() => dailyFinance({ wLeads: truth.wLeads, payments, adSpend }, win), [truth, payments, adSpend, win]);
  const campaigns = useMemo(() => topCampaigns(truth.wLeads), [truth]);
  const risk = useMemo(() => buyerRisk(truth.reconRows), [truth]);

  // Period-filtered leads for the lead-side widgets (Pipeline Health, volume by
  // status, rejection reasons, supplier leaderboard).
  //
  // Uses fLeads so the Vertical / Buyer / Supplier / Source filters apply here
  // too, and resolves the date with leadEventInstant rather than parsing
  // created_date directly.
  //
  // Both mattered. created_date is the moment the record was WRITTEN, so every
  // lead from the 19 July bulk import carried 19 July regardless of when it
  // actually arrived, and it is stored without a timezone suffix so the browser
  // read it as local time. Pipeline Health therefore counted 555 sold in a
  // window where the KPI cards (which use leadEventInstant) correctly counted
  // 285.
  const periodLeads = useMemo(
    () => fLeads.filter((l) => {
      const inst = leadEventInstant(l);
      if (!inst) return false;
      return inst >= win.start && inst <= win.end;
    }),
    [fLeads, win]
  );

  // Compare vs prior window of equal length.
  const priorTruth = useMemo(() => {
    if (!compare) return null;
    const len = win.end.getTime() - win.start.getTime();
    const prior = { start: new Date(win.start.getTime() - len), end: new Date(win.start.getTime()) };
    return financialTruth(dataset, prior);
  }, [compare, win, leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns]);

  // Prior window (always) for the AI briefing context, independent of the Compare toggle.
  const briefPrior = useMemo(() => {
    const len = win.end.getTime() - win.start.getTime();
    const prior = { start: new Date(win.start.getTime() - len), end: new Date(win.start.getTime()) };
    return financialTruth(dataset, prior);
  }, [win, leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns]);

  const cmpChip = (cur, prev) => {
    if (!compare || prev == null) return null;
    const d = prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (d == null) return null;
    return <span className={`ml-2 text-[11px] ${d >= 0 ? 'status-sold' : 'status-error'}`}>{d >= 0 ? '+' : ''}{d}%</span>;
  };

  const { kpis, stats } = truth;

  // ---- AI Analyst briefing summary (revenue-aware finance truth) ----
  const briefingSummary = useMemo(() => ({
    period: PERIOD_LABELS[period],
    revenue: { booked: Math.round(truth.bookedRevenue), verified: Math.round(truth.verifiedRevenue), gap: Math.round(kpis.revenue.gap) },
    profit: { reported: Math.round(kpis.profit.headline), cash: Math.round(kpis.profit.sub) },
    adSpend: { tracked: Math.round(kpis.adSpend.headline), paid: Math.round(kpis.adSpend.sub) },
    supplierCost: { accrued: Math.round(kpis.supplierCost.headline), paid: Math.round(kpis.supplierCost.sub) },
    outstanding: Math.round(stats.outstanding),
    overdue: Math.round(stats.overdue),
    totalAtRisk: Math.round(queue.totalAtRisk),
    topGaps: queue.items.slice(0, 4).map(i => ({ label: i.label, name: i.name, amount: Math.round(i.amount) })),
    topCampaigns: campaigns.slice(0, 3).map(c => ({ name: c.name, estimated: Math.round(c.estimated), verified: Math.round(c.verified), falseProfit: c.falseProfit })),
    leadCount: truth.wLeads.length,
    prior: { bookedRevenue: Math.round(briefPrior.bookedRevenue), reportedProfit: Math.round(briefPrior.kpis.profit.headline), totalAtRisk: Math.round(actionQueue(briefPrior, txns).totalAtRisk) },
  }), [truth, kpis, stats, queue, campaigns, briefPrior, period, txns]);

  // Signature ensures we only regenerate the briefing when the numbers actually change.
  const briefSignature = useMemo(() => JSON.stringify([
    period, Math.round(truth.bookedRevenue), Math.round(truth.verifiedRevenue), Math.round(queue.totalAtRisk), truth.wLeads.length,
  ]), [period, truth, queue]);

  const briefing = useAiBriefing(briefingSummary, briefSignature);

  // ---- Data confidence sources ----
  const cfg = (name) => {
    const rec = integrations.find(i => i.name === name);
    if (!rec) return null;
    try { return JSON.parse(rec.config || '{}').last_synced_at || null; } catch { return null; }
  };
  const newest = (arr, field) => arr.reduce((max, r) => {
    const v = r[field] ? new Date(r[field]).getTime() : 0;
    return v > max ? v : max;
  }, 0);
  const platSync = (plat) => spendMappings.filter(m => m.platform === plat).reduce((m, r) => Math.max(m, r.last_synced_at ? new Date(r.last_synced_at).getTime() : 0), 0);
  const leadSync = newest(leads.slice(0, 5), 'created_date');

  const confidenceSources = [
    { label: 'Lead ingestion', at: leadSync || null },
    { label: 'Stripe', at: cfg('stripe') },
    { label: 'Xero', at: cfg('xero') },
    { label: 'Mercury', at: cfg('mercury'), onSync: () => runForceSync('syncMercury', {}, 'Mercury') },
    { label: 'Meta Ads', at: platSync('meta') || null, onSync: () => runForceSync('syncMetaSpend', {}, 'Meta Ads') },
    { label: 'Buyer feedback', at: newest(payments, 'paid_date') || null },
    { label: 'Google Ads', at: platSync('google_ads') || null },
    { label: 'TikTok', at: platSync('tiktok') || null },
    { label: 'Supplier statements', at: newest(payouts, 'updated_date') || null },
    { label: 'Slack', at: cfg('slack') },
    ...leadSources.filter(s => s.enabled).map(s => ({
      label: s.name,
      at: s.last_synced_at || null,
      onSync: s.kind === 'google_sheets' ? () => runForceSync('syncGoogleSheets', { sourceId: s.id }, s.name) : undefined,
    })),
  ];

  // ---- Live activity stream chips ----
  const activityEvents = useMemo(() => {
    const ev = [];
    const lastPay = payments[0];
    if (lastPay) ev.push({ id: 'pay', tone: 'green', text: `Payment matched, ${lastPay.buyer_name || 'buyer'} ${fmtMoney(lastPay.amount)}` });
    if (queue.items[0]) ev.push({ id: 'gap', tone: 'amber', text: `Action item open, ${queue.items[0].label} · ${queue.items[0].name}` });
    const lastLead = leads[0];
    if (lastLead) ev.push({ id: 'lead', tone: 'blue', text: `New lead in, ${lastLead.supplier_name || 'source'} · ${lastLead.final_status || 'processing'}` });
    if (errors[0]) ev.push({ id: 'err', tone: 'red', text: `Error logged, ${errors[0].stage}: ${errors[0].message}` });
    if (ev.length === 0) ev.push({ id: 'idle', tone: 'green', text: 'All systems nominal, no new events' });
    return ev;
  }, [payments, queue, leads, errors]);

  // ---- Bottom status strip ----
  const lastLeadAt = leads[0]?.created_date;
  const errorsToday = errors.filter(e => {
    const d = e.created_date ? new Date(e.created_date) : null;
    return d && (Date.now() - d.getTime()) < 86400000;
  }).length;
  const unmatchedIncome = txns.filter(t => !t.matched_entity_type && t.amount > 0).reduce((a, t) => a + Math.abs(Number(t.amount) || 0), 0);
  const matchQueueDepth = txns.filter(t => !t.matched_entity_type).length;

  const stripItems = [
    { label: 'Ingest endpoint', value: 'Live', tone: 'good', dot: true },
    { label: 'Last lead', value: lastLeadAt ? formatDistanceToNow(new Date(lastLeadAt), { addSuffix: true }) : '—', tone: 'neutral' },
    { label: 'Errors today', count: errorsToday, render: (n) => int(Math.round(n)), tone: errorsToday > 0 ? 'bad' : 'good' },
    { label: 'Match queue', count: matchQueueDepth, render: (n) => int(Math.round(n)), tone: matchQueueDepth > 0 ? 'warn' : 'good' },
    { label: 'Open variances', count: queue.items.length, render: (n) => int(Math.round(n)), tone: queue.items.length > 0 ? 'warn' : 'good' },
    { label: 'Unmatched income', count: unmatchedIncome, render: (n) => fmtMoney(n), tone: unmatchedIncome > 0 ? 'warn' : 'good' },
  ];

  // ---- Header / AI band derived values ----
  const feedCount = confidenceSources.length;
  const verifiedFeeds = confidenceSources.filter(s => s.at && (Date.now() - new Date(s.at).getTime()) < 86400000).length;
  const analystConfidence = Math.round(stats.dataQuality || 0);
  const totalAtRisk = queue.totalAtRisk || 0;
  const riskLevel = totalAtRisk > 5000 ? 'Elevated' : totalAtRisk > 0 ? 'Watch' : verifiedFeeds < feedCount / 2 ? 'Watch' : 'Clear';
  const riskNote = totalAtRisk > 0 ? `${fmtMoney(totalAtRisk)} at risk` : 'stale ingestion';
  const topRecommendation = queue.items[0]
    ? `Resolve ${queue.items[0].label}, ${queue.items[0].name} (${fmtMoney(queue.items[0].amount)}) before it ages further.`
    : 'Verify booked revenue against cash before scaling any campaign.';

  // Per-KPI sparkline series pulled from the daily finance series.
  const kpiSpark = {
    revenue: daily.map(d => d.Verified ?? 0),
    profit: daily.map(d => (d.Verified ?? 0) - (d.Spend ?? 0)),
    adSpend: daily.map(d => d.Spend ?? 0),
    supplierCost: daily.map(d => (d.Booked ?? 0) * 0.4),
    cost: daily.map(d => d.Spend ?? 0),
    cpl: daily.map(d => d.Spend ?? 0),
  };

  // Delta vs prior window per KPI (independent of Compare toggle, using briefPrior).
  const deltaPct = (cur, prev) => {
    if (prev == null || prev === 0) return 0;
    return ((cur - prev) / Math.abs(prev)) * 100;
  };
  const kpiDelta = {
    revenue: deltaPct(kpis.revenue.headline, briefPrior.kpis.revenue.headline),
    profit: deltaPct(kpis.profit.headline, briefPrior.kpis.profit.headline),
    adSpend: deltaPct(kpis.adSpend.headline, briefPrior.kpis.adSpend.headline),
    supplierCost: deltaPct(kpis.supplierCost.headline, briefPrior.kpis.supplierCost.headline),
    cost: deltaPct(kpis.cost.headline, briefPrior.kpis.cost.headline),
    cpl: deltaPct(kpis.cpl.headline, briefPrior.kpis.cpl.headline),
  };

  const KPI_NOTES = {
    revenue: 'Awaiting booked events',
    profit: 'Margin not computable',
    adSpend: 'No platform sync',
    supplierCost: 'No statements ingested',
    cost: 'Supplier lead cost plus attributed ad spend',
    cpl: 'Cost divided by sold leads in this period',
  };

  // Right-aligned meta chips for the lower panel section headers.
  const buyerExposure = risk.reduce((a, r) => a + (r.out > 0.01 ? r.out : r.short || 0), 0);
  const donutMeta = PERIOD_LABELS[period];
  const campaignsMeta = 'All campaigns';
  const buyerRiskMeta = `${fmtMoney(buyerExposure)} exposure`;

  // Framer-motion staggered rise variants for card grids.
  const gridVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <div>
      <OverviewHeader
        period={period}
        onPeriodChange={setPeriod}
        custom={custom}
        onCustomChange={setCustom}
        compare={compare}
        onToggleCompare={() => setCompare(c => !c)}
        onRefresh={refreshAll}
        activity={<ActivityStreamBar events={activityEvents} inline />}
        filters={(
          <>
            <div className="w-px h-6 bg-border mx-0.5 hidden sm:block" />
            <OverviewFilter label="Vertical" value={verticalFilter} onChange={setVerticalFilter} options={filterOptions.verticals} />
            <OverviewFilter label="Buyer" value={buyerFilter} onChange={setBuyerFilter} options={filterOptions.buyers} />
            <OverviewFilter label="Supplier" value={supplierFilter} onChange={setSupplierFilter} options={filterOptions.suppliers} />
            <OverviewFilter label="Source" value={sourceFilter} onChange={setSourceFilter} options={filterOptions.sources} />
            {(buyerFilter.length > 0 || supplierFilter.length > 0 || sourceFilter.length > 0 || verticalFilter.length > 0) && (
              <button
                onClick={() => { setBuyerFilter([]); setSupplierFilter([]); setSourceFilter([]); setVerticalFilter([]); }}
                className="text-[12px] font-medium text-muted-foreground hover:text-foreground px-2 py-1.5"
              >
                Clear
              </button>
            )}
            {costUnfiltered && (
              <span className="text-[11px] text-muted-foreground/80 basis-full sm:basis-auto">
                Cost and CPL stay unfiltered: ad spend carries no buyer or source dimension.
              </span>
            )}
          </>
        )}
      />

      {/* AI Analyst summary band */}
      <Reveal>
        <AnimatedPanel>
          <AiAnalystBand
            text={briefing.text}
            loading={briefing.loading}
            error={briefing.error}
            onRefresh={briefing.refresh}
            confidence={analystConfidence}
            riskLevel={riskLevel}
            riskNote={riskNote}
            topRecommendation={topRecommendation}
            feedCount={feedCount}
            onAskAi={() => openDataBotWithQuestion('Give me a summary of the current state of the business: revenue, lead flow, and any risks I should act on now.')}
            onExplainVariance={() => openDataBotWithQuestion('Explain the variance between booked and verified revenue this period. What is causing the gap and which suppliers or buyers are driving it?')}
          />
        </AnimatedPanel>
      </Reveal>

      {/* Grouped KPI cards */}
      <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
        {[
          { key: 'revenue', label: 'Revenue', subLabel: 'Verified', icon: DollarSign, cmp: 'Booked' },
          { key: 'profit', label: 'Profit', subLabel: 'Cash', icon: TrendingUp, cmp: 'Reported' },
          { key: 'cost', label: 'Cost', subLabel: 'Paid', icon: Megaphone, cmp: 'Accrued' },
          { key: 'cpl', label: 'CPL', subLabel: 'Sold', icon: Users, cmp: 'Blended', subFormat: 'number', hideGap: true },
        ].map((c) => (
          <motion.div key={c.key} variants={itemVariants}>
            <GroupedKpiCard
              label={c.label}
              headline={kpis[c.key].headline}
              subLabel={c.subLabel}
              sub={kpis[c.key].sub}
              gap={kpis[c.key].gap}
              icon={c.icon}
              delta={kpiDelta[c.key]}
              spark={kpiSpark[c.key]}
              note={KPI_NOTES[c.key]}
              subFormat={c.subFormat}
              hideGap={c.hideGap}
            />
            {compare && <div className="text-[11px] text-muted-foreground mt-1 px-1">{c.cmp} {cmpChip(kpis[c.key].headline, priorTruth?.kpis[c.key].headline)}</div>}
          </motion.div>
        ))}
      </motion.div>

      {/* Small stat cards */}
      <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4">
        {[
          { label: 'Outstanding', count: stats.outstanding, render: (n) => money(n), note: 'no invoices open', tone: stats.outstanding > 0 ? 'warn' : 'good' },
          { label: 'Due 7 Days', count: stats.due7, render: (n) => money(n), note: 'nothing maturing', tone: stats.due7 > 0 ? 'warn' : 'good' },
          { label: 'Overdue', count: stats.overdue, render: (n) => money(n), note: 'clean', tone: stats.overdue > 0 ? 'bad' : 'good' },
          { label: 'Short-Paid', count: stats.shortPaid, render: (n) => money(n), note: 'clean', tone: stats.shortPaid > 0 ? 'bad' : 'good' },
          { label: 'True CPL', count: stats.trueCpl, render: (n) => money(n), note: 'no spend basis', tone: 'neutral' },
          { label: 'Cash Margin', count: stats.cashMargin, render: (n) => `${Math.round(n)}%`, note: 'no cash flow', tone: stats.cashMargin > 0 ? 'good' : 'neutral' },
          { label: 'Data Quality', count: stats.dataQuality, render: (n) => `${Math.round(n)}/100`, note: 'unverified, feeds stale', tone: stats.dataQuality >= 80 ? 'good' : stats.dataQuality >= 50 ? 'warn' : 'bad' },
        ].map((s) => (
          <motion.div key={s.label} variants={itemVariants}>
            <StatCard label={s.label} count={s.count} render={s.render} note={s.note} dotTone={s.tone} />
          </motion.div>
        ))}
      </motion.div>

      {/* Lead-side widgets */}
      <Reveal delay={0.05} className="mt-6 block">
        <AnimatedPanel duration={6.2}>
          <div className="overflow-hidden">
            <PanelSectionHeader icon={GitBranch} title="Pipeline Health" meta={PERIOD_LABELS[period]} />
            <PipelineHealthStrip leads={periodLeads} />
          </div>
        </AnimatedPanel>
      </Reveal>

      <Reveal delay={0.05} className="mt-4 block">
        <AnimatedPanel duration={6.5}>
          <div className="overflow-hidden">
            <PanelSectionHeader icon={BarChart3} title="Lead Volume by Status" meta={PERIOD_LABELS[period]} />
            <LeadVolumeByStatus leads={periodLeads} />
          </div>
        </AnimatedPanel>
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Reveal delay={0.05}>
          <AnimatedPanel duration={6.2}>
            <div className="overflow-hidden">
              <PanelSectionHeader icon={ListFilter} title="Top Rejection Reasons" meta={PERIOD_LABELS[period]} />
              <OverviewRejectionReasons leads={periodLeads} />
            </div>
          </AnimatedPanel>
        </Reveal>

        <Reveal delay={0.1}>
          <AnimatedPanel duration={5.8}>
            <div className="overflow-hidden">
              <PanelSectionHeader icon={Award} title="Supplier Leaderboard" meta={PERIOD_LABELS[period]} />
              <SupplierLeaderboard leads={periodLeads} />
            </div>
          </AnimatedPanel>
        </Reveal>
      </div>

      {/* Daily finance chart */}
      <Reveal delay={0.05} className="mt-6 block">
        <AnimatedPanel duration={6.5}>
          <div className="p-5">
            <div className="text-[13px] font-semibold text-foreground mb-1">Booked Revenue vs Verified Income vs Ad Spend</div>
            <div className="text-[11px] text-muted-foreground mb-4">The distance between the booked bars and the verified line is money booked but not yet proven.</div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={daily}>
                <XAxis dataKey="date" tick={{ fill: '#8B95A8', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fill: '#8B95A8', fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#182030', border: '1px solid #243044', borderRadius: '8px', fontSize: 12 }} labelStyle={{ color: '#EEF2F8' }} formatter={(v) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Booked" fill="#E5484D" radius={[3, 3, 0, 0]} maxBarSize={22} animationDuration={800} />
                <Line dataKey="Verified" stroke="#3DD68C" strokeWidth={2} dot={false} animationDuration={900} />
                <Line dataKey="Spend" stroke="#8B95A8" strokeWidth={2} strokeDasharray="4 3" dot={false} animationDuration={900} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </AnimatedPanel>
      </Reveal>

      {/* Action queue */}
      <Reveal delay={0.05} className="mt-4 block">
        <AnimatedPanel>
          <ActionQueueCard
            queue={queue}
            onResolve={(item) => {
              if (item.label === 'Unmatched income') navigate('/finances?tab=bank');
              else if (item.label === 'Missing source') navigate('/finances?tab=invoices');
              else if (item.label === 'Payment overdue' || item.label === 'Short paid') navigate('/finances?tab=payments');
              else if (item.label === 'Supplier cost gap') navigate('/finances?tab=payouts');
              else navigate('/finances');
            }}
            onDone={(item) => toast.success(`Marked done: ${item.label}`)}
          />
        </AnimatedPanel>
      </Reveal>

      {/* Reconciliation status callout */}
      <Reveal delay={0.05} className="mt-4 block">
        <AnimatedPanel glow={queue.items.length === 0 ? '#3DD68C' : '#E5484D'} duration={6.5}>
          {queue.items.length === 0 ? (
            <div className="border border-[#3DD68C]/40 bg-[#3DD68C]/10 px-5 py-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 status-sold shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-foreground">Everything reconciles, no open variances.</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">The bigger risk is not variance. It is missing or stale data ingestion.</div>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-md status-sold-bg status-sold shrink-0">Clean</span>
            </div>
          ) : (
            <div className="border border-primary/40 bg-primary/10 px-5 py-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-foreground">{queue.items.length} open {queue.items.length === 1 ? 'variance' : 'variances'} need attention.</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{queue.items.slice(0, 3).map(i => `${i.label} · ${i.name || i.note}`).join('  ·  ')}</div>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-md status-error-bg status-error shrink-0 whitespace-nowrap">
                <CountUpText value={queue.totalAtRisk} render={(n) => fmtMoney(n)} /> at risk
              </span>
            </div>
          )}
        </AnimatedPanel>
      </Reveal>

      {/* Row 1: Leads by Status + Top Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Reveal delay={0.05}>
          <AnimatedPanel duration={6.2}>
            <div className="overflow-hidden">
              <PanelSectionHeader icon={Layers} title="Leads by Status" meta={donutMeta} />
              <div className="p-5">
                {donut.length > 0 ? (
                  <>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="text-[28px] leading-none font-semibold text-foreground tabular-nums">
                          <CountUpText value={donutTotal} render={(n) => int(Math.round(n))} />
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1.5">Leads in period</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[28px] leading-none font-semibold status-sold tabular-nums">
                          <CountUpText value={soldRate} render={(n) => `${n.toFixed(1)}%`} />
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1.5">Sold rate</div>
                      </div>
                    </div>

                    <div className="mt-4 flex h-2.5 w-full gap-[3px] rounded-full bg-muted overflow-hidden">
                      {donut.map(d => (
                        <div
                          key={d.name}
                          title={`${d.name}: ${int(d.value)}`}
                          className={`${d.tone} bg-current h-full rounded-full transition-[width] duration-700 ease-out`}
                          style={{ width: `${(d.value / donutTotal) * 100}%` }}
                        />
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                      {donut.map(d => (
                        <div key={d.name} className="flex items-center gap-2 px-1.5 py-2 rounded-md hover:bg-accent/40">
                          <span className={`${d.tone} bg-current h-2 w-2 rounded-full shrink-0`} />
                          <span className="text-[12px] text-foreground truncate">{d.name}</span>
                          <span className="ml-auto text-[12px] font-mono text-foreground tabular-nums">
                            <CountUpText value={d.value} render={(n) => int(Math.round(n))} />
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums w-11 text-right">
                            {((d.value / donutTotal) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-[220px] flex flex-col items-center justify-center text-center gap-1.5 px-4">
                    <Layers className="w-7 h-7 text-muted-foreground/50" />
                    <div className="text-[13px] text-muted-foreground">No leads in period</div>
                    <div className="text-[11px] text-muted-foreground/70 max-w-[300px]">Likely cause: Leadbyte ingestion has never synced. Distribution and status counts depend on it.</div>
                    <Link to="/payload-tester" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">Run Payload Tester <ArrowUpRight className="w-3 h-3" /></Link>
                  </div>
                )}
              </div>
            </div>
          </AnimatedPanel>
        </Reveal>

        <Reveal delay={0.1}>
          <AnimatedPanel duration={5.8}>
            <div className="overflow-hidden">
              <PanelSectionHeader icon={Trophy} title="Top Campaigns by Cash Profit" meta={campaignsMeta} />
              {campaigns.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40">
                      <th className="text-left px-4 py-2.5">Campaign</th><th className="text-right px-4 py-2.5">Leads</th>
                      <th className="text-right px-4 py-2.5">Estimated</th><th className="text-right px-4 py-2.5">Verified</th><th className="text-center px-4 py-2.5">Action</th>
                    </tr></thead>
                    <motion.tbody variants={gridVariants} initial="hidden" animate="show" className="divide-y divide-border">
                      {campaigns.map(c => (
                        <motion.tr key={c.name} variants={itemVariants} className="hover:bg-accent/30">
                          <td className="px-4 py-2.5 text-foreground truncate max-w-[200px]">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{c.name}</span>
                              {c.falseProfit && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded status-error-bg status-error whitespace-nowrap">FALSE PROFIT</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{int(c.leads)}</td>
                          <td className="px-4 py-2.5 text-right font-mono"><CountUpText value={c.estimated} render={(n) => money(n)} /></td>
                          <td className={`px-4 py-2.5 text-right font-mono ${c.verified > 0 ? 'status-sold' : 'text-muted-foreground'}`}><CountUpText value={c.verified} render={(n) => money(n)} /></td>
                          <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={`text-[10px] border-0 ${CAMPAIGN_TAG_TONE[c.tag]}`}>{c.tag}</Badge></td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                </div>
              ) : (
                <div className="h-[220px] flex flex-col items-center justify-center text-center gap-1.5 p-5">
                  <Trophy className="w-7 h-7 text-muted-foreground/50" />
                  <div className="text-[13px] text-muted-foreground">No campaign economics yet</div>
                  <div className="text-[11px] text-muted-foreground/70 max-w-[320px]">Profitability needs three feeds: leads in, buyer revenue booked, and ad spend. All three are currently silent.</div>
                  <Link to="/settings?tab=integrations" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">Connect ad platforms <ArrowUpRight className="w-3 h-3" /></Link>
                </div>
              )}
            </div>
          </AnimatedPanel>
        </Reveal>
      </div>

      {/* Row 2: Buyer Payment Risk + Data Confidence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Reveal delay={0.05}>
          <AnimatedPanel duration={6.8}>
            <div className="overflow-hidden">
              <PanelSectionHeader icon={ShieldAlert} title="Buyer Payment Risk" meta={buyerRiskMeta} />
              {risk.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40">
                      <th className="text-left px-4 py-2.5">Buyer</th><th className="text-right px-4 py-2.5">Booked</th>
                      <th className="text-right px-4 py-2.5">Out / Short</th><th className="text-center px-4 py-2.5">Status</th>
                    </tr></thead>
                    <motion.tbody variants={gridVariants} initial="hidden" animate="show" className="divide-y divide-border">
                      {risk.map(r => (
                        <motion.tr key={r.name} variants={itemVariants} className="hover:bg-accent/30">
                          <td className="px-4 py-2.5 text-foreground truncate max-w-[160px]">{r.name}</td>
                          <td className="px-4 py-2.5 text-right font-mono"><CountUpText value={r.booked} render={(n) => money(n)} /></td>
                          <td className="px-4 py-2.5 text-right font-mono"><CountUpText value={r.out > 0.01 ? r.out : r.short} render={(n) => money(n)} /></td>
                          <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={`text-[10px] border-0 ${RISK_TONE[r.status]}`}>{RISK_LABEL[r.status] || r.status}</Badge></td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                </div>
              ) : (
                <div className="h-[220px] flex flex-col items-center justify-center text-center gap-1.5 p-5">
                  <ShieldAlert className="w-7 h-7 text-muted-foreground/50" />
                  <div className="text-[13px] text-muted-foreground">No buyer exposure detected</div>
                  <div className="text-[11px] text-muted-foreground/70 max-w-[300px]">No buyer exposure detected for selected period.</div>
                </div>
              )}
            </div>
          </AnimatedPanel>
        </Reveal>

        <Reveal delay={0.1}>
          <AnimatedPanel duration={6.4}>
            <DataConfidenceCard sources={confidenceSources} />
          </AnimatedPanel>
        </Reveal>
      </div>

      {/* Bottom system telemetry strip */}
      <Reveal delay={0.05} className="mt-6 mb-2 block">
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-primary" /> System Telemetry
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">refreshed {refreshedAgo}s ago</div>
        </div>
        <AnimatedPanel duration={7}>
          <StatusStripBar items={stripItems} />
        </AnimatedPanel>
      </Reveal>
    </div>
  );
}