import React, { useState } from 'react';
import { Plus, Pin } from 'lucide-react';
import MetricCard from './MetricCard';
import MetricPicker from './MetricPicker';
import ReportWidget from './ReportWidget';
import AddWidgetPicker from './AddWidgetPicker';
import { computeMetrics, dailySeries, applyFilters, METRIC_CATALOG, leadField, seriesWindow, spendInWindow } from '@/lib/reportMetrics';
import { internalSupplierSet } from '@/lib/reportMetrics';
import LeadCountsStrip from '@/components/shared/LeadCountsStrip';
import { reorder } from '@/lib/reorder';

let idc = 0;
const nid = () => `w${Date.now()}_${idc++}`;

// Performance OS metric board: a pinned row plus category toggle chips.
const GROUPS = [
  { id: 'revenue', label: 'Revenue', hex: '#E5484D' },
  { id: 'cash', label: 'Cash', hex: '#3DD68C' },
  { id: 'risk', label: 'Buyer Risk', hex: '#E8A33D' },
  { id: 'data', label: 'Data Quality', hex: '#5B8DEF' },
];
const CATEGORY = {
  revenue: 'revenue', net_revenue: 'revenue', profit: 'revenue', net_profit: 'revenue', qp_margin: 'revenue', roas: 'revenue', booked_revenue: 'revenue',
  verified_income: 'cash', revenue_gap: 'cash', outstanding: 'cash', overdue: 'cash', short_paid: 'cash', cost: 'cash', total_cost: 'cash', ad_spend: 'cash', cpl: 'cash', blended_cpl: 'cash', cost_per_sold: 'cash',
  sold: 'risk', unsold: 'risk', returns: 'risk', dqs: 'risk', duplicates: 'risk',
  total_leads: 'data', fakes: 'data', phone_verified: 'data',
};
// Cost and CPL are pinned on every report view, not buried in the Cash group.
// They are the two numbers that decide whether a campaign is worth running, so
// they sit next to revenue rather than a click away.
const PINNED = ['revenue', 'total_cost', 'blended_cpl', 'profit', 'total_leads'];
const RISK = ['returns', 'fakes', 'dqs', 'duplicates', 'revenue_gap', 'overdue', 'short_paid', 'outstanding', 'total_cost', 'blended_cpl'];
const groupOf = (metric) => CATEGORY[metric] || 'data';

// The Performance Overview canvas: pinned + grouped metric board, then widgets.
export default function PerformanceCanvas({
  leads, adSpend, suppliers = [], cards, widgets, onCardsChange, onWidgetsChange, customFields, filters,
}) {
  const [pickCard, setPickCard] = useState(false);
  const [pickWidget, setPickWidget] = useState(false);
  const [activeGroup, setActiveGroup] = useState('revenue');

  const filtered = applyFilters(leads, filters);
  // Spend has to be windowed separately: applyFilters only touches leads.
  const spend = spendInWindow(adSpend, filters);
  const metrics = computeMetrics(filtered, spend, internalSupplierSet(suppliers));
  // Sparklines follow the selected date range, not a fixed trailing 14 days.
  const series = dailySeries(filtered, spend, 14, seriesWindow(filters));
  const revSeries = series.map(s => s.revenue);

  const cardValue = (card) => {
    if (card.metric?.startsWith('field:')) {
      const f = card.metric.slice(6);
      const vals = filtered.map(l => Number(leadField(l, f))).filter(v => !isNaN(v));
      return vals.reduce((a, b) => a + b, 0);
    }
    return metrics[card.metric] ?? 0;
  };
  const cardSeries = (card) => {
    if (['revenue', 'net_revenue', 'booked_revenue'].includes(card.metric)) return revSeries;
    if (['cost', 'total_cost', 'ad_spend', 'cpl', 'blended_cpl'].includes(card.metric)) return series.map(s => s.cost + s.spend);
    if (['profit', 'net_profit'].includes(card.metric)) return series.map(s => s.profit);
    return series.map(s => s.leads);
  };

  const addCard = (opt) => {
    const metric = opt.kind === 'field' ? `field:${opt.key.replace('field:', '')}` : opt.key;
    onCardsChange([...cards, { id: nid(), metric, label: opt.label }]);
  };
  const removeCard = (id) => onCardsChange(cards.filter(c => c.id !== id));

  const addWidget = (type) => onWidgetsChange([...widgets, { id: nid(), type }]);
  const updateWidget = (id, next) => onWidgetsChange(widgets.map(w => w.id === id ? next : w));
  const removeWidget = (id) => onWidgetsChange(widgets.filter(w => w.id !== id));
  const dupWidget = (id) => {
    const w = widgets.find(x => x.id === id);
    const idx = widgets.findIndex(x => x.id === id);
    const copy = { ...w, id: nid() };
    onWidgetsChange([...widgets.slice(0, idx + 1), copy, ...widgets.slice(idx + 1)]);
  };
  const moveWidget = (id, dir) => {
    const idx = widgets.findIndex(x => x.id === id);
    const to = idx + dir;
    if (to < 0 || to >= widgets.length) return;
    onWidgetsChange(reorder(widgets, idx, to));
  };

  const renderCard = (card) => (
    <MetricCard
      key={card.id}
      card={card}
      value={cardValue(card)}
      series={cardSeries(card)}
      positive={!RISK.includes(card.metric)}
      onRemove={() => removeCard(card.id)}
    />
  );

  const pinnedCards = cards.filter(c => PINNED.includes(c.metric));
  const grouped = cards.filter(c => !PINNED.includes(c.metric));
  const activeCards = grouped.filter(c => groupOf(c.metric) === activeGroup);
  const counts = Object.fromEntries(GROUPS.map(g => [g.id, grouped.filter(c => groupOf(c.metric) === g.id).length]));

  return (
    <div>
      {/* Lead counts strip. Same component and same order as the Leads section,
          so the two can never disagree for the same window. Fed `filtered`,
          which already has every report filter applied. */}
      <LeadCountsStrip leads={filtered} className="mb-4" />

      {/* METRIC BOARD: pinned row + category chips */}
      <div className="mb-6 rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="flex items-center justify-between px-3 lg:px-5 pt-3 lg:pt-4">
          <div className="flex items-center gap-2">
            <Pin className="w-3.5 h-3.5 text-muted-foreground" />
            <h3 className="text-[13px] font-semibold text-foreground">Pinned metrics</h3>
          </div>
          <button onClick={() => setPickCard(true)} className="flex items-center gap-1 text-[11.5px] font-medium text-primary hover:text-primary/80">
            <Plus className="w-3.5 h-3.5" /> Add Card
          </button>
        </div>

        {/* Six across only on a genuinely wide screen. At xl (1280px) a
            six-column split leaves ~170px per card, which truncated ordinary
            currency values to "$74,2...". */}
        {pinnedCards.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2 lg:gap-3 px-3 lg:px-5 pt-2 lg:pt-3 pb-3 lg:pb-4">
            {pinnedCards.map(renderCard)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 px-3 lg:px-5 py-2.5 lg:py-3 border-t border-border">
          {GROUPS.map(g => {
            const on = activeGroup === g.id;
            return (
              <button key={g.id} onClick={() => setActiveGroup(g.id)}
                className={`flex items-center gap-2 px-3 h-8 rounded-lg border text-[12px] font-medium transition-colors ${on ? 'text-foreground' : 'text-muted-foreground border-border hover:text-foreground'}`}
                style={on ? { borderColor: `${g.hex}55`, background: `${g.hex}14` } : undefined}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.hex }} />
                {g.label}
                <span className={`px-1.5 py-px rounded text-[10px] tabular-nums ${on ? '' : 'bg-muted text-muted-foreground'}`}
                  style={on ? { background: `${g.hex}22`, color: g.hex } : undefined}>{counts[g.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="px-3 lg:px-5 pb-4 lg:pb-5 pt-3 lg:pt-4 border-t border-border">
          {activeCards.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-6 gap-2 lg:gap-3">
              {activeCards.map(renderCard)}
            </div>
          ) : (
            <div className="py-8 text-center text-[12px] text-muted-foreground">
              No cards in this group. Use Add Card to add one.
            </div>
          )}
        </div>
      </div>

      {/* WIDGETS: chart + dimension tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {widgets.map(w => (
          <ReportWidget
            key={w.id}
            widget={{
              ...w,
              onDuplicate: () => dupWidget(w.id),
              onRemove: () => removeWidget(w.id),
              onMoveLeft: () => moveWidget(w.id, -1),
              onMoveRight: () => moveWidget(w.id, 1),
            }}
            leads={filtered}
            adSpend={spend}
            filters={filters}
            onChange={(next) => updateWidget(w.id, next)}
          />
        ))}
        <button onClick={() => setPickWidget(true)}
          className="border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 min-h-[160px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
          <Plus className="w-6 h-6" /><span className="text-[13px]">Add Widget</span>
        </button>
      </div>

      <MetricPicker open={pickCard} onOpenChange={setPickCard} onPick={addCard} customFields={customFields} />
      <AddWidgetPicker open={pickWidget} onOpenChange={setPickWidget} onPick={addWidget} />
    </div>
  );
}

export const makeDefaultCards = () =>
  METRIC_CATALOG.filter(m => m.key !== 'phone_verified').map((m, i) => ({ id: `c${i}`, metric: m.key, label: m.label }));

export const makeDefaultWidgets = () => [
  { id: 'dw1', type: 'rev_spend_profit', wide: true },
  { id: 'dw2', type: 'status_donut' },
  { id: 'dw3', type: 'campaigns' },
  { id: 'dw4', type: 'states' },
  { id: 'dw5', type: 'buyers' },
  { id: 'dw6', type: 'suppliers' },
  { id: 'dw7', type: 'daily_metrics', wide: true },
  { id: 'dw8', type: 'utm_source' },
  { id: 'dw9', type: 'buyer_feedback' },
  { id: 'dw10', type: 'injury_type' },
  { id: 'dw11', type: 'accident_date' },
  { id: 'dw12', type: 'treatment_time' },
  { id: 'dw13', type: 'phone_verification' },
];