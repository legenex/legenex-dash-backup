import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { integrationStatus } from '@/functions/integrationStatus';
import { distributionInsights } from '@/functions/distributionInsights';
import SectionHeader from '@/components/shared/SectionHeader';
import RefreshButton from '@/components/shared/RefreshButton';
import PeriodTabs from '@/components/shared/PeriodTabs';
import { resolvePeriod, priorWindow, PERIOD_LABELS } from '@/lib/periodRange';
import { operationalMetrics, leadsOverTime, supplierBreakdown } from '@/lib/distributionMetrics';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Copy, Link2, Workflow, Users, CheckCircle2, Ban, Clock, RotateCcw, XCircle, AlertTriangle,
  Target, Phone, Mail, MessageSquare, Brain, Sparkles, ArrowUpRight, RefreshCw, Route as RouteIcon, GitBranch,
} from 'lucide-react';

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

// Recharts needs concrete color strings, so resolve chart series colors from the
// status helper palette (kept in sync with the theme's status tokens).
const CHART = { amber: '#E8A33D', green: '#3DD68C', gridStroke: 'hsl(var(--border))' };

// Tone -> theme helper classes for stage tiles (text color for value + icon).
const toneText = {
  green: 'status-sold',
  red: 'text-primary',
  amber: 'status-unsold',
  blue: 'status-duplicate',
  slate: 'text-muted-foreground',
};
const toneValueText = {
  green: 'status-sold',
  red: 'text-primary',
  amber: 'status-unsold',
  blue: 'status-duplicate',
  slate: 'text-foreground',
};
const toneBar = {
  green: 'bg-status-sold',
  red: 'bg-primary',
  amber: 'bg-status-unsold',
  blue: 'bg-status-duplicate',
  slate: 'bg-muted-foreground',
};

const Panel = ({ children, className = '', glow = false, style = {} }) => (
  <div
    className={`relative rounded-xl border border-border bg-card ${glow ? 'shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_8px_40px_-12px_hsl(var(--primary)/0.25)]' : 'shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)]'} ${className}`}
    style={style}
  >
    {children}
  </div>
);

const PulseDot = ({ className = 'bg-current status-sold', size = 7 }) => (
  <span className="relative inline-flex" style={{ width: size, height: size }}>
    <motion.span
      className={`absolute inset-0 rounded-full ${className}`}
      animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
    />
    <span className={`relative rounded-full w-full h-full ${className}`} />
  </span>
);

const Tag = ({ children, tone = 'slate', mono }) => {
  const map = {
    slate: 'tag-neutral border-border',
    red: 'bg-primary/10 text-primary border-primary/35',
    green: 'bg-status-sold status-sold border-border',
    amber: 'bg-status-unsold status-unsold border-border',
    blue: 'bg-status-duplicate status-duplicate border-border',
  }[tone];
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium tracking-wide border ${mono ? 'font-mono' : ''} ${map}`}>
      {children}
    </span>
  );
};

const Btn = ({ icon: Icon, children, primary, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11.5px] font-medium border shrink-0 transition-colors ${
      primary
        ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_16px_hsl(var(--primary)/0.3)]'
        : 'border-border bg-background/50 text-muted-foreground hover:bg-accent hover:text-foreground'
    }`}
  >
    {Icon && <Icon size={12} />} {children}
  </button>
);

export default function DistributionDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const win = useMemo(() => resolvePeriod(period, custom), [period, custom]);
  const prior = useMemo(() => priorWindow(win), [win]);

  const { data: leads = [] } = useQuery({ queryKey: ['dist-leads'], queryFn: () => base44.entities.Lead.filter({ archived: false }, '-created_date', 2000) });
  const { data: errors = [] } = useQuery({ queryKey: ['dist-errors'], queryFn: () => fetchAll((limit, skip) => base44.entities.ErrorLog.list('-created_date', limit, skip)) });
  const { data: hlrArr = [] } = useQuery({ queryKey: ['hlr-settings'], queryFn: () => base44.entities.HlrSettings.list() });
  const { data: emailArr = [] } = useQuery({ queryKey: ['email-val-settings'], queryFn: () => base44.entities.EmailValidationSettings.list() });
  const { data: appSettingsArr = [] } = useQuery({ queryKey: ['app-settings'], queryFn: () => base44.entities.AppSettings.list() });
  const { data: metaCfg } = useQuery({ queryKey: ['meta-config'], queryFn: async () => (await base44.entities.IntegrationConfig.filter({ name: 'meta' }))[0] || null });
  const { data: intStatus } = useQuery({ queryKey: ['integration-status'], queryFn: async () => (await integrationStatus({}))?.data?.status || {} });

  const publicBaseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';
  const endpointUrl = `${publicBaseUrl}/functions/leads`;

  const m = useMemo(() => operationalMetrics(leads, errors, win), [leads, errors, win]);
  const priorM = useMemo(() => operationalMetrics(leads, errors, prior), [leads, errors, prior]);
  const series = useMemo(() => leadsOverTime(m.leads, win), [m.leads, win]);
  const chartData = useMemo(() => series.map(d => ({ day: d.date, volume: d.Total, sold: d.Sold })), [series]);

  const hlrProvider = hlrArr[0]?.provider_name;
  const emailActive = emailArr.length > 0 ? (emailArr[0]?.enabled !== false) : true;

  const verifications = [
    { name: 'Phone HLR', icon: Phone, ok: !!hlrProvider, status: hlrProvider ? 'Active' : 'Not configured' },
    { name: 'Email Validation', icon: Mail, ok: emailActive, status: emailActive ? 'Active' : 'Not configured' },
    { name: 'Meta CAPI', icon: Target, ok: !!metaCfg, status: metaCfg ? 'Connected' : 'Not connected' },
    { name: 'Slack Alerts', icon: MessageSquare, ok: !!intStatus?.slack, status: intStatus?.slack ? 'Connected' : 'Not connected' },
  ];

  const stages = [
    { label: 'Total Leads', value: m.total, icon: Users, tone: 'slate' },
    { label: 'Sold', value: m.sold, icon: CheckCircle2, tone: 'green' },
    { label: 'Disqualified', value: m.disqualified, icon: Ban, tone: 'red' },
    { label: 'Unsold', value: m.unsold, icon: Clock, tone: 'amber' },
    { label: 'Returns', value: m.returns, icon: RotateCcw, tone: 'slate' },
    { label: 'Rejections', value: m.rejections, icon: XCircle, tone: 'red' },
    { label: 'Errors', value: m.errors, icon: AlertTriangle, tone: 'red' },
    { label: 'Conversions', value: m.conversions, icon: Target, tone: 'green' },
  ];

  const insightSummary = useMemo(() => ({
    period: PERIOD_LABELS[period],
    current: {
      total: m.total, sold: m.sold, disqualified: m.disqualified, unsold: m.unsold,
      returns: m.returns, rejections: m.rejections, errors: m.errors, conversions: m.conversions,
      pctDq: m.pctDq, pctError: m.pctError, pctRejection: m.pctRejection, convRate: m.convRate,
    },
    prior: {
      total: priorM.total, disqualified: priorM.disqualified, errors: priorM.errors,
      pctDq: priorM.pctDq, pctError: priorM.pctError,
    },
    suppliers: supplierBreakdown(m.leads).slice(0, 15),
  }), [m, priorM, period]);

  const copyEndpoint = () => {
    try { navigator.clipboard.writeText(endpointUrl); toast.success('Endpoint copied'); } catch { /* noop */ }
  };

  const runAi = async () => {
    setAiLoading(true);
    try {
      const res = await distributionInsights({ summary: insightSummary, periodLabel: PERIOD_LABELS[period] });
      const text = res?.data?.insights || '';
      if (text) setAiText(text);
      else toast.error(res?.data?.error || 'Could not generate insights');
    } catch {
      toast.error('Could not generate insights');
    }
    setAiLoading(false);
  };

  const aiBullets = aiText.split('\n').map(l => l.trim()).filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, ''));
  const defaultNarrative = `${m.total} lead${m.total === 1 ? '' : 's'} processed this period. ${m.sold} sold, ${m.unsold} unsold, ${m.disqualified} disqualified, ${m.errors} error${m.errors === 1 ? '' : 's'}.`;

  return (
    <div>
      <SectionHeader title="Distribution Dashboard" subtitle="Operational pipeline health, volume, status mix, verification and source performance">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Routing tools live off the Dashboard now that they are out of the nav. */}
          <button
            type="button"
            onClick={() => navigate('/distribution/simulator')}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
          >
            <RouteIcon className="w-4 h-4" />Simulator
          </button>
          <button
            type="button"
            onClick={() => navigate('/distribution/routes')}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
          >
            <GitBranch className="w-4 h-4" />Route Groups
          </button>
          <PeriodTabs value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
          <RefreshButton onClick={() => qc.invalidateQueries()} />
        </div>
      </SectionHeader>

      <div className="space-y-5 mt-4">
        {/* Endpoint + verification stack */}
        <Panel className="overflow-hidden">
          <motion.div
            className="absolute top-0 bottom-0 w-[120px] pointer-events-none bg-gradient-to-r from-transparent via-status-sold to-transparent opacity-40"
            animate={{ left: ['-12%', '112%'] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
          />
          <div className="relative flex flex-col xl:flex-row xl:items-center gap-4 px-5 py-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-status-sold border border-border">
                <Link2 size={15} className="status-sold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground/70">SUPPLIER ENDPOINT</span>
                  <span className="flex items-center gap-1 text-[10px] status-sold">
                    <PulseDot size={4} /> accepting POSTs
                  </span>
                </div>
                <code className="block text-[13px] font-mono truncate mt-0.5 text-primary">{endpointUrl}</code>
              </div>
              <Btn icon={Copy} onClick={copyEndpoint}>Copy</Btn>
            </div>
            <div className="grid grid-cols-2 gap-2 xl:shrink-0">
              {verifications.map((v) => (
                <div
                  key={v.name}
                  className={`flex items-center gap-2 px-3 h-9 rounded-lg border ${v.ok ? 'bg-status-sold border-border' : 'bg-primary/10 border-primary/30'}`}
                >
                  <v.icon size={13} className={v.ok ? 'status-sold' : 'text-primary'} />
                  <span className="text-[11.5px] font-medium text-foreground">{v.name}</span>
                  <span className={`text-[10.5px] ${v.ok ? 'status-sold' : 'text-primary'}`}>{v.status}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Pipeline stages */}
        <Panel>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Workflow size={15} className="text-muted-foreground" />
              <h3 className="text-[13px] font-semibold text-foreground">Pipeline · {PERIOD_LABELS[period]}</h3>
            </div>
            {m.unsold > 0 && <Tag tone="amber">{m.unsold} unsold in flight</Tag>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 px-5 pb-5">
            {stages.map((s, i) => {
              const barW = m.total > 0 && s.value > 0 ? `${Math.max(6, Math.round((s.value / m.total) * 100))}%` : '3%';
              const highlightAmber = s.value > 0 && s.tone === 'amber';
              return (
                <motion.div
                  key={s.label}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={i}
                  whileHover={{ y: -3 }}
                  className={`p-3.5 rounded-lg border ${highlightAmber ? 'bg-status-unsold border-border' : 'bg-background/40 border-border/60'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground">{s.label}</span>
                    <s.icon size={13} className={`${toneText[s.tone]} opacity-85`} />
                  </div>
                  <div className={`text-[26px] font-bold tabular-nums mt-1.5 ${toneValueText[s.tone]}`}>{s.value}</div>
                  <div className="h-0.5 rounded-full mt-2 bg-border/60">
                    <div className={`h-full rounded-full opacity-70 ${toneBar[s.tone]}`} style={{ width: barW }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Panel>

        {/* Chart + AI */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
          <Panel className="flex flex-col">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-[13px] font-semibold text-foreground">Leads Over Time</h3>
              <Tag>{PERIOD_LABELS[period]}</Tag>
            </div>
            <div className="relative flex-1 min-h-[240px] px-2 pb-3">
              <div
                className="absolute inset-x-5 inset-y-0 pointer-events-none opacity-40"
                style={{
                  backgroundImage: 'linear-gradient(hsl(var(--border) / 0.18) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.18) 1px, transparent 1px)',
                  backgroundSize: '48px 44px',
                }}
              />
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="volFill2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.amber} stopOpacity="0.25" />
                      <stop offset="100%" stopColor={CHART.amber} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART.gridStroke} strokeOpacity={0.25} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10.5 }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10.5 }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, color: 'hsl(var(--foreground))' }} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.33} strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="volume" stroke={CHART.amber} strokeWidth={1.5} fill="url(#volFill2)" name="Volume" />
                  <Line type="monotone" dataKey="sold" stroke={CHART.green} strokeWidth={1.5} dot={false} name="Sold" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel glow className="flex flex-col overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            />
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="flex items-center gap-2">
                <Brain size={15} className="text-primary" />
                <h3 className="text-[13px] font-semibold text-foreground">AI Insights</h3>
              </div>
              <button onClick={runAi} disabled={aiLoading} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors">
                <RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} /> {aiText ? 'Refresh' : 'Generate'}
              </button>
            </div>
            <div className="px-5 py-3 space-y-3 flex-1">
              {aiBullets.length > 0 ? (
                <ul className="space-y-2">
                  {aiBullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] text-foreground">
                      <span className="text-primary">•</span><span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] leading-relaxed text-foreground">{defaultNarrative}</p>
              )}
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/60 bg-background/50">
                <Sparkles size={13} className="text-primary shrink-0" />
                <p className="text-[11.5px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Top recommendation:</span>{' '}
                  {m.unsold > 0 ? 'route unsold leads by configuring a buyer for this campaign.' : 'keep supplier feeds fresh so status counts stay reliable.'}
                </p>
              </div>
              <button onClick={() => navigate('/campaigns?tab=buyers')} className="text-[12px] font-medium inline-flex items-center gap-1 text-primary hover:underline">
                Open Buyers <ArrowUpRight size={12} />
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}