import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Panel } from '@/components/settings/settingsUi';
import MobileFilterSheet from '@/components/shared/MobileFilterSheet';
import { Filter, Plus, X } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { STANDARD_PERIODS, resolvePeriod, APP_TZ } from '@/lib/periodRange';
import { verticalFilterOptions } from '@/lib/verticalOptions';

const OPTIONAL_FILTERS = [
  { key: 'utm_source', label: 'UTM Source' },
  { key: 'accident_date', label: 'Accident Date' },
  { key: 'state', label: 'State' },
];

const fmt = (d) => formatInTimeZone(d, APP_TZ, 'yyyy-MM-dd');

// Report-level filter bar. Matches the Leads filter bar styling.
// value = { date_from, date_to, campaign, vertical, supplier_name, buyer, brand, ...optional }
// Keys here must be canonical report field names, since applyFilters resolves
// each one against the lead through the report field aliases. This used to send
// buyer_id (a Buyer record id on the lead) while selecting a company name, so
// the Buyer filter could never match anything.
export default function ReportFilterBar({ value, onChange, options, hide = [] }) {
  const { verticals = [], suppliers = [], buyers = [], brands = [] } = options || {};
  // Some standard views own a single dimension and must not offer the opposite
  // one, so the parent passes the keys to drop rather than every view rendering
  // its own near-identical bar.
  const shows = (key) => !hide.includes(key);
  const [showFilters, setShowFilters] = useState(false);
  const [extra, setExtra] = useState(Object.keys(value || {}).filter(k => OPTIONAL_FILTERS.some(f => f.key === k) && value[k]));
  // Which named period the current dates correspond to.
  //
  // This used to be `dates present ? 'custom' : 'this_month'`, but the effect
  // below writes This Month's dates on mount. So any remount (switching report
  // views) saw dates already present and displayed Custom, even though the
  // range WAS This Month. Match the dates back to a named period instead, and
  // fall back to Custom only when they genuinely match none.
  const periodFromDates = (v) => {
    if (!v?.date_from && !v?.date_to) return 'this_month';
    for (const p of STANDARD_PERIODS) {
      if (p.value === 'custom') continue;
      const w = resolvePeriod(p.value);
      if (fmt(w.start) === v.date_from && fmt(w.end) === v.date_to) return p.value;
    }
    return 'custom';
  };
  const [period, setPeriod] = useState(() => periodFromDates(value));

  const set = (k, v) => onChange({ ...value, [k]: v });
  const setDates = (from, to) => onChange({ ...value, date_from: from || '', date_to: to || '' });

  // Default to This Month once, if no explicit date is already applied.
  useEffect(() => {
    if (!value.date_from && !value.date_to && period !== 'custom') {
      const w = resolvePeriod(period);
      onChange({ ...value, date_from: fmt(w.start), date_to: fmt(w.end) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPeriod = (p) => {
    setPeriod(p);
    if (p === 'custom') return;
    const w = resolvePeriod(p);
    setDates(fmt(w.start), fmt(w.end));
  };

  const addExtra = (k) => { if (!extra.includes(k)) setExtra([...extra, k]); };
  const removeExtra = (k) => { setExtra(extra.filter(x => x !== k)); set(k, ''); };

  const clearAll = () => {
    setPeriod('this_month');
    setExtra([]);
    const w = resolvePeriod('this_month');
    onChange({ date_from: fmt(w.start), date_to: fmt(w.end) });
  };

  // Filter values may be a single value (older saved views) or an array (the
  // multi-selects), so normalise before handing one to a MultiSelect.
  const asArray = (v) => {
    if (Array.isArray(v)) return v;
    return v == null || v === '' || v === 'all' ? [] : [v];
  };
  const count = (v) => asArray(v).length;

  // Count active filters for the mobile Filters badge.
  const activeCount = extra.length + count(value.vertical) +
    (shows('supplier_name') ? count(value.supplier_name) : 0) + (shows('buyer') ? count(value.buyer) : 0) + count(value.brand);

  return (
    <div className="mb-5 space-y-3">
      <Panel className="p-3 flex items-center gap-3 flex-wrap" i={0}>
        <MobileFilterSheet activeCount={activeCount} onClearAll={clearAll}>
        <SearchableSelect
          value={period}
          onValueChange={pickPeriod}
          className="w-full lg:w-[150px] bg-card border-border"
          options={STANDARD_PERIODS.map(p => ({ value: p.value, label: p.label }))}
        />

        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={value.date_from || ''} onChange={e => setDates(e.target.value, value.date_to)} className="bg-card border-border w-full lg:w-[140px]" />
            <span className="text-muted-foreground text-xs">to</span>
            <Input type="date" value={value.date_to || ''} onChange={e => setDates(value.date_from, e.target.value)} className="bg-card border-border w-full lg:w-[140px]" />
          </div>
        )}

        {/* Labelled Vertical, matching Operations > Verticals where these
            records are managed. The old Campaign filter listed Meta ad campaign
            names, which is an ad-reporting dimension rather than a vertical,
            and has been removed.

            All of these are multi-select: clicking an option toggles it, so a
            second click deselects. Several selections mean "any of these". */}
        <MultiSelect value={asArray(value.vertical)} onValueChange={v => set('vertical', v)} className="w-full lg:w-[150px] bg-card border-border" placeholder="Vertical: All" options={verticalFilterOptions(verticals)} />
        {shows('supplier_name') && <MultiSelect value={asArray(value.supplier_name)} onValueChange={v => set('supplier_name', v)} className="w-full lg:w-[150px] bg-card border-border" placeholder="Supplier: All" options={suppliers.map(s => ({ value: s.name, label: s.name }))} />}
        {shows('buyer') && <MultiSelect value={asArray(value.buyer)} onValueChange={v => set('buyer', v)} className="w-full lg:w-[150px] bg-card border-border" placeholder="Buyer: All" options={buyers.map(b => ({ value: b.company_name, label: b.company_name }))} />}
        <MultiSelect value={asArray(value.brand)} onValueChange={v => set('brand', v)} className="w-full lg:w-[140px] bg-card border-border" placeholder="Brand: All" options={brands.map(b => ({ value: b.brand_code, label: b.brand_name }))} />

        <Button
          variant={showFilters || extra.length > 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5 w-full lg:w-auto"
        >
          <Filter className="w-3.5 h-3.5" /> Filters
          {extra.length > 0 && <Badge variant="secondary" className="ml-1">{extra.length}</Badge>}
        </Button>

        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-muted-foreground ml-auto hidden lg:flex">
          <X className="w-3.5 h-3.5" /> Clear
        </Button>
        </MobileFilterSheet>
      </Panel>

      {showFilters && (
        <div className="bg-card border border-border rounded-[10px] p-4 space-y-2">
          {extra.length === 0 && (
            <div className="text-[13px] text-muted-foreground py-2">No extra filters. Add one below.</div>
          )}
          {extra.map(k => {
            const f = OPTIONAL_FILTERS.find(x => x.key === k);
            return (
              <div key={k} className="flex items-center gap-2">
                <div className="w-[160px] text-[13px] text-muted-foreground">{f.label}</div>
                <Input value={value[k] || ''} onChange={e => set(k, e.target.value)} placeholder="Value" className="flex-1 bg-background" />
                <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeExtra(k)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {OPTIONAL_FILTERS.filter(f => !extra.includes(f.key)).map(f => (
              <Button key={f.key} variant="outline" size="sm" onClick={() => addExtra(f.key)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> {f.label}
              </Button>
            ))}
            {OPTIONAL_FILTERS.every(f => extra.includes(f.key)) && <div className="px-2 py-1.5 text-[12px] text-muted-foreground">All added</div>}
          </div>
        </div>
      )}
    </div>
  );
}