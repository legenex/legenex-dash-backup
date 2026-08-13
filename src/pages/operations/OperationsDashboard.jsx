import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { PulseDot } from '@/components/finances/financeUi';
import ToolTile from '@/components/tools/ToolTile';
import StateChangeStrip from '@/components/operations/StateChangeStrip';
import StateHeatGrid from '@/components/operations/StateHeatGrid';
import {
  Users, Factory, MapPin, ReceiptText, UserPlus, Megaphone,
  RefreshCw, ArrowUp, ArrowDown, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { SectionHeaderSlot } from '@/components/layout/SectionShell';

const num = (n) => Number(n).toLocaleString();

// ---- stat tile with an optional delta vs 7 days ago ----
function StatTile({ label, value, total, delta }) {
  // delta is the prior value (7 days ago). null => render no indicator.
  let indicator = null;
  if (delta != null && value != null) {
    const diff = value - delta;
    if (diff !== 0) {
      const up = diff > 0;
      indicator = (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'status-sold' : 'text-primary'}`}>
          {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(diff)}
        </span>
      );
    } else {
      indicator = <span className="text-[11px] font-medium text-muted-foreground">no change</span>;
    }
  }
  return (
    <div className="rounded-[10px] border border-border bg-card p-2.5 lg:p-4">
      <div className="text-[9px] lg:text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/70 truncate">{label}</div>
      <div className="flex items-baseline gap-1.5 lg:gap-2 mt-0.5 lg:mt-1">
        <div className="text-[18px] lg:text-[24px] font-bold font-mono tabular-nums leading-none text-foreground whitespace-nowrap">
          {value == null ? '' : num(value)}
        </div>
        {indicator}
      </div>
      {total != null && <div className="text-[10px] lg:text-[11px] text-muted-foreground/70 mt-0.5 lg:mt-1.5 whitespace-nowrap"><span className="font-mono tabular-nums">{num(total)}</span> total</div>}
    </div>
  );
}

// ---- section card metric pair for ToolTile ----
// A null metric shows the label with no value and a "Not configured yet" hint.
function metricStats(pairs) {
  return pairs.map(([label, value]) => (
    value == null
      ? { label, value: '' }
      : { label, value: typeof value === 'number' ? num(value) : value }
  ));
}
function anyNull(pairs) {
  return pairs.some(([, v]) => v == null);
}

const SkeletonBlock = ({ className = '' }) => (
  <div className={`animate-pulse rounded-[10px] bg-muted/40 ${className}`} />
);

export default function OperationsDashboard() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(Date.now());

  // Vertical tabs. operationsData already accepts a `vertical` body param and
  // filters the state grid, lead counts and period by it; the page just never
  // passed one, so this was always an all-verticals view with no way to see MVA
  // and WC coverage apart. Empty string means all.
  const [vertical, setVertical] = useState('');

  const { data: verticals = [] } = useQuery({
    queryKey: ['op-verticals'],
    queryFn: () => base44.entities.Vertical.list('sort_order'),
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    // vertical is part of the key so switching tabs refetches rather than
    // showing the previous vertical's grid.
    queryKey: ['operations-dashboard', vertical],
    queryFn: async () => {
      const res = await base44.functions.invoke('operationsData', vertical ? { vertical } : {});
      return { ...res.data, _loadedAt: Date.now() };
    },
  });

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  const gotoState = (state) => navigate(`/operations/active-states?state=${encodeURIComponent(state)}`);

  const Header = (
    <SectionHeaderSlot>
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Operations</h1>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-status-sold text-[10px] font-semibold uppercase tracking-wide status-sold">
            <PulseDot /> Live
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground mt-1">Who is live right now: active buyers, suppliers and state coverage.</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 shrink-0">
        <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
      </Button>
    </div>
    </SectionHeaderSlot>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-full">
        {Header}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-[92px]" />)}
        </div>
        <SkeletonBlock className="h-8 mb-5 max-w-md" />
        <SkeletonBlock className="h-[340px] mb-5" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonBlock key={i} className="h-[168px]" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col min-h-full">
        {Header}
        <div className="rounded-[10px] border border-primary/30 bg-primary/5 p-8 text-center">
          <AlertTriangle className="w-6 h-6 text-primary mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-foreground">Could not load the operations dashboard</p>
          <p className="text-[13px] text-muted-foreground mt-1.5">{error?.message || 'The operations data request failed.'}</p>
          <Button size="sm" onClick={() => refetch()} className="gap-1.5 mt-4">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const counts = data?.counts || {};
  const deltas = data?.deltas || {};
  const sections = data?.section_metrics || {};
  const grid = Array.isArray(data?.state_grid) ? data.state_grid : [];
  const changes = Array.isArray(data?.recent_state_changes) ? data.recent_state_changes : [];
  const attention = Array.isArray(data?.needs_attention) ? data.needs_attention : [];
  const tel = data?.telemetry || {};

  const activeGridCount = grid.filter((g) => g.active).length;
  const secsAgo = data?._loadedAt ? Math.max(0, Math.round((tick - data._loadedAt) / 1000)) : 0;

  // ---- section cards ----
  const cards = [
    {
      to: '/operations/buyers', icon: Users, title: 'Buyers',
      description: 'Active buyers, acceptance and exposure across campaigns.',
      pairs: [['Active', sections.buyers?.active], ['Total', sections.buyers?.total]],
    },
    {
      to: '/operations/suppliers', icon: Factory, title: 'Suppliers',
      description: 'Sources sending leads and their recent volume.',
      pairs: [['Active', sections.suppliers?.active], ['Total', sections.suppliers?.total]],
    },
    {
      to: '/operations/active-states', icon: MapPin, title: 'Active States',
      description: 'Geographic coverage with active buyer pricing.',
      pairs: [['States', sections.active_states?.active], ['Leads 30d', sections.active_states?.period_leads]],
    },
    {
      to: '/operations/billing-reports', icon: ReceiptText, title: 'Billing Reports',
      description: 'Per buyer billing exports and reconciliation.',
      pairs: [['Due to bill', sections.billing_reports?.due_to_bill], ['Outstanding', sections.billing_reports?.outstanding]],
    },
    {
      to: '/operations/buyer-onboarding', icon: UserPlus, title: 'Buyer Onboarding',
      description: 'Bring a new buyer live: mapping, caps and go-live checks.',
      pairs: [['In progress', sections.buyer_onboarding?.in_progress], ['Blocked', sections.buyer_onboarding?.blocked]],
    },
    {
      to: '/campaigns', icon: Megaphone, title: 'Campaigns',
      description: 'Manage campaigns, verticals, buyers, suppliers and brands.',
      pairs: [['Active', sections.campaigns?.active], ['Total', sections.campaigns?.total]],
    },
  ];

  return (
    <div className="flex flex-col min-h-full">
      {Header}

      {/* 1. Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Active Buyers" value={counts.active_buyers} total={counts.total_buyers} delta={deltas.active_buyers} />
        <StatTile label="Active Suppliers" value={counts.active_suppliers} total={counts.total_suppliers} delta={deltas.active_suppliers} />
        <StatTile label="Active States" value={counts.active_states} total={counts.total_states} delta={deltas.active_states} />
        <StatTile label="Active Campaigns" value={counts.active_campaigns} total={counts.total_campaigns} delta={deltas.active_campaigns} />
      </div>

      {/* 2. Recently changed states strip */}
      <div className="mt-4">
        <StateChangeStrip changes={changes} onSelect={gotoState} />
      </div>

      {/* 3. State heat grid */}
      <div className="mt-5">
        {/* Vertical tabs. Built from the Vertical records, so a new vertical
            appears here automatically without another hardcoded tab. */}
        <div className="flex gap-1 border-b border-border flex-wrap mb-4">
          {[{ code: '', name: 'All states' }, ...verticals].map((v) => (
            <button
              key={v.code || 'all'}
              onClick={() => setVertical(v.code)}
              className={`px-3.5 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px
                ${vertical === v.code ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {v.code ? `${v.name} (${v.code})` : v.name}
            </button>
          ))}
        </div>

        {grid.length === 0 ? (
          <div className="rounded-[10px] border border-border bg-card p-8 text-center">
            <MapPin className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-[14px] font-semibold text-foreground">
              {vertical ? `No buyer coverage configured for ${vertical} yet` : 'No buyer coverage has been configured yet'}
            </p>
            <p className="text-[13px] text-muted-foreground mt-1.5">
              {vertical
                ? `State pricing exists per vertical, so ${vertical} stays empty until a buyer is priced for it.`
                : 'Set up state pricing on your buyers to light up the coverage map.'}
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate('/operations/buyers')} className="gap-1.5 mt-4">
              Go to Buyers <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <StateHeatGrid grid={grid} activeCount={activeGridCount} onSelect={gotoState} />
        )}
      </div>

      {/* 4. Section cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        {cards.map((c) => (
          <ToolTile
            key={c.title}
            to={c.to}
            icon={c.icon}
            title={c.title}
            description={anyNull(c.pairs) ? 'Not configured yet' : c.description}
            status={anyNull(c.pairs) ? 'warn' : 'ok'}
            stats={metricStats(c.pairs)}
          />
        ))}
      </div>

      {/* 5. Needs attention */}
      {attention.length > 0 && (
        <NeedsAttention items={attention} navigate={navigate} />
      )}

      {/* 6. Telemetry footer */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 rounded-lg bg-card border border-border text-[11px]">
        <span className="font-semibold uppercase tracking-[0.11em] text-muted-foreground/70">Operations Telemetry</span>
        <TelItem
          label="Priority Engine"
          value={tel.priority_engine_last_run ? formatDistanceToNowStrict(new Date(tel.priority_engine_last_run), { addSuffix: true }) : null}
        />
        <TelItem label="State Changes 24h" value={tel.state_changes_24h} />
        <TelItem label="Unnotified Queued" value={tel.unnotified_state_changes} />
        <TelItem label="Suppliers No Channel" value={tel.active_suppliers_no_channel} />
        <span className="ml-auto text-muted-foreground/60">refreshed {secsAgo}s ago</span>
      </div>
    </div>
  );
}

// ---- needs attention panel ----
function NeedsAttention({ items, navigate }) {
  // Group items by type into label + count + destination.
  const groups = {};
  for (const it of items) {
    const key = it.type;
    if (!groups[key]) {
      groups[key] = {
        label: it.label,
        count: 0,
        to: it.type === 'supplier_no_channel' ? '/operations/suppliers' : '/operations/active-states',
      };
    }
    groups[key].count += 1;
  }
  const rows = Object.values(groups);

  return (
    <div className="mt-5 rounded-[10px] border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <AlertTriangle className="w-4 h-4 text-[hsl(38_80%_57%)]" />
        <span className="text-[13px] font-semibold text-foreground">Needs attention</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <button
            key={r.label}
            onClick={() => navigate(r.to)}
            className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-accent/40 transition-colors"
          >
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-status-unsold status-unsold text-[11px] font-mono tabular-nums font-semibold">
              {r.count}
            </span>
            <span className="text-[13px] text-foreground flex-1">{r.label}</span>
            <span className="inline-flex items-center gap-1 text-[12px] text-primary font-medium">
              Review <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TelItem({ label, value }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="uppercase tracking-wide text-muted-foreground/60">{label}</span>
      <span className="font-mono tabular-nums font-semibold text-foreground">{value}</span>
    </span>
  );
}