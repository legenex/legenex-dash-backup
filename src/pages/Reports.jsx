import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Copy, Plus, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import ReportSidebar, { STANDARD } from '@/components/reports/ReportSidebar';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import PerformanceCanvas, { makeDefaultCards, makeDefaultWidgets } from '@/components/reports/PerformanceCanvas';
import DailyReport from '@/components/reports/views/DailyReport';
import PnlReport from '@/components/reports/views/PnlReport';
import AdReport from '@/components/reports/views/AdReport';
import SupplierReport from '@/components/reports/views/SupplierReport';
import BuyerReport from '@/components/reports/views/BuyerReport';
import SectionShell from '@/components/layout/SectionShell';
import SectionHeader from '@/components/shared/SectionHeader';

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try { const p = JSON.parse(raw); return p ?? fallback; } catch { return fallback; }
}

// A single Base44 page is capped at 500 rows regardless of the limit asked for,
// so anything that requests more silently truncates. Reports used to ask for
// 2000 leads and quietly analysed only the newest 500, which is why the numbers
// here disagreed with the Leads tab. Paging now lives in @/lib/fetchAll so the
// AdSpend call sites (Overview, Finances, Ad Manager, Ad Spend tab, Campaign
// Suppliers) share one implementation instead of each re-truncating at 500.

export default function Reports() {
  const qc = useQueryClient();

  // Reports had no way to pull fresh data short of a browser reload, which
  // matters most right after a Meta sync lands. Invalidates every query the
  // page reads rather than a hand-maintained list, so a new query added later
  // is refreshed too.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  };
  const [searchParams, setSearchParams] = useSearchParams();

  // Active view is derived from the URL so every report has a shareable link:
  //   standard views -> /reports?tab=<key>   (e.g. ?tab=daily)
  //   custom reports  -> /reports?report=<id>
  const reportParam = searchParams.get('report');
  const tabParam = searchParams.get('tab');
  const active = reportParam ? `custom:${reportParam}` : `std:${tabParam || 'performance_overview'}`;

  const setActive = (id) => {
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.delete('report');
    if (id.startsWith('custom:')) next.set('report', id.slice(7));
    else next.set('tab', id.slice(4));
    setSearchParams(next, { replace: false });
  };

  const [filters, setFilters] = useState({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  // Working (unsaved) card/widget state for standard views.
  const [stdCards, setStdCards] = useState(makeDefaultCards());
  const [stdWidgets, setStdWidgets] = useState(makeDefaultWidgets());

  // Mirrors the Leads tab query (archived excluded) so the two tabs agree.
  const { data: leads = [] } = useQuery({
    queryKey: ['report-leads'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.filter({ archived: false }, '-created_date', limit, skip)),
  });
  const { data: adSpend = [] } = useQuery({ queryKey: ['adspend'], queryFn: () => fetchAll((limit, skip) => base44.entities.AdSpend.list('-date', limit, skip)) });
  const { data: bankTx = [] } = useQuery({ queryKey: ['report-banktx'], queryFn: () => fetchAll((limit, skip) => base44.entities.BankTransaction.list('-date', limit, skip)) });
  const { data: adMappings = [] } = useQuery({ queryKey: ['report-admappings'], queryFn: () => base44.entities.AdSpendMapping.list() });
  const { data: integrations = [] } = useQuery({ queryKey: ['report-integrations'], queryFn: () => base44.entities.IntegrationConfig.list() });
  const { data: reports = [] } = useQuery({ queryKey: ['reports'], queryFn: () => base44.entities.Report.filter({ group: 'custom' }, 'sort_order') });
  const { data: customFields = [] } = useQuery({ queryKey: ['custom-fields'], queryFn: () => base44.entities.CustomField.list('sort_order') });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('sort_order') });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  // Sources carry the payout rule (flat CPL, revenue %, profit %, tiered), which
  // is what a supplier is OWED. That is a different number from what their
  // leads cost, so the supplier report needs both.
  const { data: supplierSources = [] } = useQuery({ queryKey: ['supplier-sources-all'], queryFn: () => fetchAll((limit, skip) => base44.entities.SupplierSource.list('source_code', limit, skip)) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list() });
  const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: () => base44.entities.Brand.list() });

  const isCustom = active.startsWith('custom:');
  const activeReport = isCustom ? reports.find(r => r.id === active.slice(7)) : null;

  // Which filter dropdowns a standard view is allowed to show. A supplier report
  // filtered by buyer, or a buyer report filtered by supplier, produces numbers
  // that look like CPL and margin but are not, because the dimension being
  // filtered does not change the money on the other side of the trade.
  const HIDDEN_FILTERS = {
    'std:supplier': ['buyer'],
    'std:buyer': ['supplier_name'],
  };
  const hiddenFilters = HIDDEN_FILTERS[active] || [];

  // Resolve cards/widgets/filters for the currently active view.
  const view = useMemo(() => {
    if (activeReport) {
      return {
        cards: safeParse(activeReport.cards, makeDefaultCards()),
        widgets: safeParse(activeReport.widgets, makeDefaultWidgets()),
        pinned: safeParse(activeReport.pinned_filters, {}),
      };
    }
    return { cards: stdCards, widgets: stdWidgets, pinned: {} };
  }, [activeReport, stdCards, stdWidgets]);

  const effectiveFilters = { ...view.pinned, ...filters };
  // Never let a hidden dimension keep filtering from a previously active view.
  for (const key of hiddenFilters) delete effectiveFilters[key];

  const persistReport = async (id, patch) => {
    await base44.entities.Report.update(id, patch);
    qc.invalidateQueries({ queryKey: ['reports'] });
  };

  const setCards = (next) => {
    if (activeReport) persistReport(activeReport.id, { cards: JSON.stringify(next) });
    else setStdCards(next);
  };
  const setWidgets = (next) => {
    if (activeReport) persistReport(activeReport.id, { widgets: JSON.stringify(next) });
    else setStdWidgets(next);
  };

  const title = activeReport
    ? activeReport.name
    : STANDARD.find(s => `std:${s.key}` === active)?.label || 'Performance Overview';

  const saveAsReport = async () => {
    if (!saveName.trim()) return;
    const created = await base44.entities.Report.create({
      name: saveName.trim(),
      group: 'custom',
      base_page: 'performance_overview',
      pinned_filters: JSON.stringify(effectiveFilters),
      cards: JSON.stringify(view.cards),
      widgets: JSON.stringify(view.widgets),
      sort_order: reports.length,
    });
    await qc.invalidateQueries({ queryKey: ['reports'] });
    setSaveOpen(false); setSaveName(''); setFilters({});
    setActive(`custom:${created.id}`);
    toast.success(`Report "${created.name}" saved`);
  };

  const duplicateCurrent = async () => {
    const created = await base44.entities.Report.create({
      name: `${title} (Copy)`,
      group: 'custom',
      base_page: 'performance_overview',
      pinned_filters: JSON.stringify(effectiveFilters),
      cards: JSON.stringify(view.cards),
      widgets: JSON.stringify(view.widgets),
      sort_order: reports.length,
    });
    await qc.invalidateQueries({ queryKey: ['reports'] });
    setActive(`custom:${created.id}`);
    toast.success('Report duplicated');
  };

  const newReport = () => { setSaveName(''); setSaveOpen(true); };

  const deleteReport = async () => {
    if (!activeReport) return;
    await base44.entities.Report.delete(activeReport.id);
    await qc.invalidateQueries({ queryKey: ['reports'] });
    setActive('std:performance_overview');
    toast.success('Report deleted');
  };

  return (
    <SectionShell nav={<ReportSidebar active={active} onSelect={(id) => { setActive(id); setFilters({}); }} customReports={reports} onNewReport={newReport} />}>
      <SectionHeader
        title={title}
        subtitle={isCustom ? 'Saved report with pinned filters' : 'Build your report - add cards, widgets and filters'}
      >
        {isCustom && <Button variant="outline" size="sm" onClick={deleteReport} className="text-destructive">Delete</Button>}
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        {!isCustom && <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} className="gap-1.5"><Save className="w-3.5 h-3.5" /> Save View</Button>}
        <Button variant="outline" size="sm" onClick={duplicateCurrent} className="gap-1.5"><Copy className="w-3.5 h-3.5" /> Duplicate</Button>
        <Button size="sm" onClick={newReport} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> New Report</Button>
      </SectionHeader>

      <ReportFilterBar
        value={effectiveFilters}
        onChange={(v) => setFilters(v)}
        hide={hiddenFilters}
        options={{ verticals, suppliers, buyers, brands }}
      />

      {active === 'std:daily' ? (
        <DailyReport leads={leads} adSpend={adSpend} filters={effectiveFilters} />
      ) : active === 'std:pnl' ? (
        <PnlReport leads={leads} adSpend={adSpend} bankTx={bankTx} suppliers={suppliers} filters={effectiveFilters} />
      ) : active === 'std:ad' ? (
        <AdReport adSpend={adSpend} adMappings={adMappings} integrations={integrations} leads={leads} suppliers={suppliers} filters={effectiveFilters} />
      ) : active === 'std:supplier' ? (
        <SupplierReport leads={leads} adSpend={adSpend} suppliers={suppliers} supplierSources={supplierSources} filters={effectiveFilters} />
      ) : active === 'std:buyer' ? (
        <BuyerReport leads={leads} adSpend={adSpend} buyers={buyers} filters={effectiveFilters} />
      ) : (
        <PerformanceCanvas
          leads={leads}
          adSpend={adSpend}
          suppliers={suppliers}
          cards={view.cards}
          widgets={view.widgets}
          onCardsChange={setCards}
          onWidgetsChange={setWidgets}
          customFields={customFields}
          filters={effectiveFilters}
        />
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="bg-popover border-border max-w-[420px]">
          <DialogHeader><DialogTitle>Save as Report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Report Name</Label>
              <Input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g. AG1 Report" className="mt-1 bg-background text-[13px]" />
            </div>
            <p className="text-[12px] text-muted-foreground">
              Saves the current cards, widgets and active filters as a named report under the Custom group.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={saveAsReport} disabled={!saveName.trim()}>Save Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionShell>
  );
}