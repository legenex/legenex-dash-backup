import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw, Radio, MonitorPlay, ShieldCheck, Bot, Sparkles, TrendingUp, AlertTriangle, Pencil,
} from 'lucide-react';
import DateRangeFilter from '@/components/shared/DateRangeFilter';
import { Panel, Btn, Tag, KpiTile, PulseDot, PlatBadge, TONE } from './adAtoms';
import {
  f0, f2, num, pct, compact, roasText, cplBand, roasBand, ctrBand, platformLabel, insightSummary,
} from '@/lib/adManagerMetrics';

/* ------------------------------------------------------------------ */
/*  Top controls: platform switch, date window, live Meta sync          */
/* ------------------------------------------------------------------ */
export function TopControls({ platform, setPlatform, platforms, period, setPeriod, custom, setCustom, lastSyncedAt, onRefresh }) {
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncMetaSpend', {});
      const d = res?.data || {};
      if (d.error) throw new Error(d.error);
      toast({
        title: 'Meta sync complete',
        description: `${d.accounts_synced || 0} accounts, ${d.rows_synced || 0} account rows, ${d.campaign_rows_inserted || 0} campaign rows, ${d.ad_rows_inserted || 0} ad rows.`,
      });
      onRefresh?.();
    } catch (e) {
      toast({ title: 'Meta sync failed', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const ago = lastSyncedAt ? Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000) : null;
  const agoText = ago == null ? 'never synced' : ago < 1 ? 'updated just now' : ago < 60 ? `updated ${ago}m ago` : `updated ${Math.round(ago / 60)}h ago`;

  return (
    <Panel className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-background/50">
        {platforms.map((p) => {
          const on = p.id === platform;
          return (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              title={p.connected ? `${p.label} connected` : `${p.label} not connected`}
              className={`flex items-center gap-1.5 px-3 h-7 rounded-md text-[11.5px] font-medium transition-colors ${
                on ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: p.connected ? TONE.good : 'hsl(var(--muted-foreground) / 0.4)' }}
              />
              {p.label}
            </button>
          );
        })}
      </div>

      <DateRangeFilter period={period} custom={custom} onPeriodChange={setPeriod} onCustomChange={setCustom} />

      <Btn icon={RefreshCw} onClick={runSync} disabled={syncing}>{syncing ? 'Syncing' : 'Sync now'}</Btn>

      <div className="ml-auto flex items-center gap-1.5 text-[10.5px] text-muted-foreground/70">
        <Radio className="w-3 h-3" style={{ color: ago != null ? TONE.good : TONE.warn }} />
        {platformLabel(platform)} sync, {agoText}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Account tabs with editable nicknames                               */
/*  A nickname writes ad_account_name on the AdSpendMapping, so it      */
/*  persists for every user and every other view of that account.       */
/* ------------------------------------------------------------------ */
export function AccountTabs({ list, acct, setAcct, onRenamed, includePortfolio }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const { toast } = useToast();

  const commit = async (a) => {
    const name = draft.trim();
    setEditing(null);
    if (!name || name === a.name) return;
    if (!a.mappingId) {
      toast({ title: 'Cannot rename', description: 'This ad account has no AdSpendMapping yet. Map it in Settings Integrations first.', variant: 'destructive' });
      return;
    }
    try {
      await base44.entities.AdSpendMapping.update(a.mappingId, { ad_account_name: name });
      toast({ title: 'Account renamed', description: `Now shown as ${name} everywhere.` });
      onRenamed?.();
    } catch (e) {
      toast({ title: 'Rename failed', description: e.message, variant: 'destructive' });
    }
  };

  const tabs = includePortfolio ? [{ id: 'all', name: 'All accounts', isPortfolio: true }, ...list] : list;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {tabs.map((a) => {
        const on = a.id === acct;
        return (
          <div
            key={a.id}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg border shrink-0 ${
              on ? 'bg-primary/10 border-primary/35 text-primary' : 'border-border bg-background/50 text-muted-foreground'
            }`}
          >
            {editing === a.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit(a)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(a); if (e.key === 'Escape') setEditing(null); }}
                className="bg-transparent outline-none text-[12px] font-medium w-40 text-foreground border-b border-primary"
              />
            ) : (
              <button onClick={() => setAcct(a.id)} className="text-[12px] font-medium whitespace-nowrap flex items-center gap-1.5">
                {a.name}
                {!a.isPortfolio && <PlatBadge p={a.platform} label={platformLabel(a.platform)} />}
              </button>
            )}
            {!a.isPortfolio && (
              <button
                onClick={() => { setEditing(a.id); setDraft(a.name); }}
                title="Rename this ad account"
                className="opacity-40 hover:opacity-100"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI rows: what the platform reported, and what the leads prove      */
/* ------------------------------------------------------------------ */
export function PlatformKpis({ a, platform }) {
  const P = platformLabel(platform);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <MonitorPlay className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted-foreground">{P} reported</span>
        <span className="text-[10.5px] text-muted-foreground/60">straight from {P} Ads Manager, stops at the pixel event</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile label="Spend" value={f0(a.spend)} hint={`paid to ${P}`} />
        <KpiTile label="Impressions" value={compact(a.impressions)} hint="reach x frequency" />
        <KpiTile label="CPM" value={f2(a.cpm)} hint="per 1k impressions" />
        <KpiTile label="CTR" value={pct(a.ctr)} hint="clicks / impressions" band={ctrBand(a.ctr)} />
        <KpiTile label="CPC" value={f2(a.cpc)} hint="per click" />
        <KpiTile
          label={`${P} CPL`}
          value={f2(a.reportedCpl)}
          hint={a.reportedLeads ? `${num(a.reportedLeads)} reported leads` : 'no pixel leads reported'}
          tone={TONE.warn}
        />
      </div>
    </div>
  );
}

export function TruthKpis({ a, platform }) {
  const P = platformLabel(platform);
  const gap = a.cplGapPct == null ? null : a.cplGapPct.toFixed(0);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <ShieldCheck className="w-3.5 h-3.5" style={{ color: TONE.good }} />
        <span className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: TONE.good }}>Verified truth</span>
        <span className="text-[10.5px] text-muted-foreground/60">joined from the Lead entity and the LeadByte sold result, the downstream {P} cannot see</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiTile
          verified
          label="Real CPL"
          value={f2(a.realCpl)}
          hint={gap != null ? `cost / qualified, ${gap >= 0 ? '+' : ''}${gap}% vs ${P}` : 'cost / qualified'}
          band={cplBand(a.realCpl)}
        />
        <KpiTile verified label="Qualified" value={num(a.qualified)} hint="Sold, Unsold or Returned" />
        <KpiTile verified label="Sold leads" value={num(a.sold)} hint="LeadByte sold result" />
        <KpiTile verified label="Revenue" value={f0(a.revenue)} hint="sum of Lead.revenue" />
        <KpiTile verified label="Real ROAS" value={roasText(a.roas)} hint="revenue / spend" band={roasBand(a.roas)} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AI analyst card, backed by the adManagerInsights function           */
/* ------------------------------------------------------------------ */
export function AiInsightCard({ scope, campaigns = [], platform, periodLabel }) {
  const [state, setState] = useState({ loading: false, error: '', data: null });
  const lastSig = useRef(null);

  const signature = `${scope?.id}|${platform}|${periodLabel}|${Math.round(scope?.spend || 0)}|${Math.round(scope?.revenue || 0)}`;

  const run = useCallback(async (force = false) => {
    if (!scope) return;
    if (!force && lastSig.current === signature) return;
    lastSig.current = signature;
    setState({ loading: true, error: '', data: null });
    try {
      const res = await base44.functions.invoke('adManagerInsights', {
        summary: insightSummary({ ...scope, platform }, campaigns),
        scope: scope.name,
        periodLabel,
      });
      const insights = res?.data?.insights;
      if (insights) setState({ loading: false, error: '', data: insights });
      else setState({ loading: false, error: res?.data?.error || 'No analysis returned.', data: null });
    } catch {
      setState({ loading: false, error: 'Could not generate the analysis right now.', data: null });
    }
  }, [signature, scope, campaigns, platform, periodLabel]);

  useEffect(() => { run(false); }, [run]);

  const d = state.data;
  const conf = d?.confidence ?? 0;

  return (
    <Panel glow className="overflow-hidden">
      <motion.div
        className="absolute top-0 bottom-0 w-[160px] pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.05) 50%, transparent)' }}
        animate={{ left: ['-15%', '115%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg grid place-items-center bg-primary/10 border border-primary/30">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-bold tracking-wide text-foreground">AI ANALYST</span>
                <span className="text-[11px] text-muted-foreground/70">{platformLabel(platform)}, {scope?.name}, {periodLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {(d?.tags || []).slice(0, 4).map((t, i) => (
                  <Tag key={t + i} tone={['green', 'amber', 'red', 'blue'][i % 4]}>{t}</Tag>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div>
              <div className="text-[9px] font-semibold tracking-[0.14em] text-muted-foreground/70">CONFIDENCE</div>
              <div className="text-[24px] font-bold text-foreground tabular-nums">{state.loading ? '-' : `${conf}%`}</div>
              <div className="h-1 w-24 rounded-full mt-1 bg-border">
                <div className="h-full rounded-full" style={{ width: `${conf}%`, background: TONE.good }} />
              </div>
            </div>
            <Btn icon={Sparkles} primary onClick={() => run(true)} disabled={state.loading}>
              {state.loading ? 'Thinking' : 'Re-analyze'}
            </Btn>
          </div>
        </div>

        {state.error && (
          <div className="mt-4 p-3 rounded-lg border border-border bg-background/50 text-[11.5px] text-muted-foreground">{state.error}</div>
        )}

        {!state.error && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
              <div className="p-3.5 rounded-lg border" style={{ borderColor: `${TONE.good}4D`, background: `${TONE.good}1F` }}>
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: TONE.good }}>
                  <TrendingUp className="w-3 h-3" /> Biggest opportunity
                </div>
                <p className="text-[12px] leading-relaxed mt-1.5 text-muted-foreground">
                  {state.loading ? 'Joining reported spend to verified sold revenue...' : d?.opportunity || 'No opportunity identified for this scope.'}
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-primary/30 bg-primary/10">
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase text-primary">
                  <AlertTriangle className="w-3 h-3" /> Biggest risk
                </div>
                <p className="text-[12px] leading-relaxed mt-1.5 text-muted-foreground">
                  {state.loading ? 'Comparing reported CPL against verified CPL...' : d?.risk || 'No risk identified for this scope.'}
                </p>
              </div>
            </div>
            {d?.recommendation && (
              <div className="flex items-start gap-2.5 mt-3 p-3 rounded-lg border border-border bg-background/50">
                <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Top recommendation:</span> {d.recommendation}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Telemetry status bar                                               */
/* ------------------------------------------------------------------ */
export function StatusBar({ portfolio, platform, mappings, lastSyncedAt }) {
  const stale = mappings.filter((m) => !m.last_synced_at || (Date.now() - new Date(m.last_synced_at).getTime()) / 60000 > 120).length;
  const items = [
    { label: `${platformLabel(platform).toUpperCase()} SYNC`, value: lastSyncedAt ? 'Live' : 'Idle', live: !!lastSyncedAt },
    { label: 'ACCOUNTS', value: `${portfolio.accountCount}/${mappings.length || portfolio.accountCount}` },
    { label: 'SPEND', value: f0(portfolio.spend) },
    { label: 'SOLD JOIN', value: num(portfolio.sold), good: true },
    { label: 'MAPPINGS', value: stale ? `${stale} stale` : 'all fresh', warn: stale > 0 },
    { label: 'REAL ROAS', value: roasText(portfolio.roas), good: (portfolio.roas || 0) >= 2.5 },
  ];
  return (
    <Panel className="overflow-hidden">
      <div className="relative flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5" style={{ color: TONE.good }} />
          <span className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground/70">AD MANAGER TELEMETRY</span>
        </div>
        {items.map((x) => (
          <div key={x.label} className="flex items-center gap-2">
            {x.live && <PulseDot size={5} />}
            <span className="text-[10px] tracking-[0.1em] text-muted-foreground/70">{x.label}</span>
            <span
              className="text-[12px] font-bold tabular-nums"
              style={{ color: x.live || x.good ? TONE.good : x.warn ? TONE.warn : undefined }}
            >
              {x.value}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
