import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { spendRows } from '@/lib/reportMetrics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import FinanceShell from '@/components/finances/FinanceShell';
import ReconciliationTab from '@/components/finances/ReconciliationTab';
import BankFeedTab from '@/components/finances/BankFeedTab';
import InvoicesTab from '@/components/finances/InvoicesTab';
import BuyerPaymentsTab from '@/components/finances/BuyerPaymentsTab';
import SupplierPayoutsTab from '@/components/finances/SupplierPayoutsTab';
import AdSpendTab from '@/components/finances/AdSpendTab';
import ProfitabilityTab from '@/components/finances/ProfitabilityTab';
import FinanceSettingsTab from '@/components/finances/FinanceSettingsTab';
import { loadFinanceSettings } from '@/lib/financeSettings';
import { unmatched, reconcile, workbench } from '@/lib/financeMetrics';
import { usePermissions } from '@/lib/AuthContext';
import DateRangeFilter from '@/components/shared/DateRangeFilter';
import { resolvePeriod } from '@/lib/periodRange';
import { isWithinInterval } from 'date-fns';

// Per-tab title + subtitle for the FinanceShell header.
const TAB_META = {
  overview: { name: 'Overview', subtitle: "Cash truth: what came in, what went out, and what still doesn't reconcile." },
  bank: { name: 'Bank Feed', subtitle: 'Live bank feed: Mercury sync, CSV import and AI categorization.' },
  invoices: { name: 'Invoices', subtitle: 'Buyer invoices raised, awaiting payment, and collected.' },
  payments: { name: 'Buyer Payments', subtitle: 'Cash actually received from buyers, matched against invoices.' },
  payouts: { name: 'Supplier Payouts', subtitle: 'What is owed to suppliers and what has been paid.' },
  adspend: { name: 'Ad Spend', subtitle: 'Synced platform spend and the true CPL it produces.' },
  profit: { name: 'Profitability', subtitle: 'What everything costs, and what it takes to break even.' },
  settings: { name: 'Settings', subtitle: 'Categories, matching rules, counterparty aliases, and accounts.' },
};

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

export default function Finances() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canBank = can('bank_feed');
  const tab = params.get('tab') || 'overview';
  const [resolved, setResolved] = useState(0);
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const win = useMemo(() => resolvePeriod(period, custom), [period, custom]);
  const inWin = (d) => { if (!d) return false; try { return isWithinInterval(new Date(d), { start: win.start, end: win.end }); } catch { return false; } };

  const { data: leads = [] } = useQuery({ queryKey: ['report-leads'], queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.filter({ archived: false }, '-created_date', limit, skip)) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: invoices = [] } = useQuery({ queryKey: ['all-invoices'], queryFn: () => base44.entities.Invoice.list('-created_date', 500) });
  const { data: payments = [] } = useQuery({ queryKey: ['buyer-payments'], queryFn: () => base44.entities.BuyerPayment.list('-paid_date', 500) });
  const { data: payouts = [] } = useQuery({ queryKey: ['supplier-payouts'], queryFn: () => base44.entities.SupplierPayout.list('-created_date', 500) });
  const { data: adSpend = [] } = useQuery({ queryKey: ['adspend'], queryFn: () => fetchAll((limit, skip) => base44.entities.AdSpend.list('-date', limit, skip)) });
  const { data: txns = [] } = useQuery({ queryKey: ['bank-txns'], queryFn: () => base44.entities.BankTransaction.list('-date', 500) });
  const { data: financeSettings } = useQuery({ queryKey: ['finance-settings'], queryFn: async () => (await loadFinanceSettings()).settings });
  const { data: mercuryCfg } = useQuery({
    queryKey: ['mercury-config'],
    queryFn: async () => (await base44.entities.IntegrationConfig.filter({ name: 'mercury' }))[0] || null,
  });

  const unmatchedIn = useMemo(
    () => unmatched(txns).filter(t => t.amount > 0).reduce((a, t) => a + num(t.amount), 0),
    [txns],
  );

  const reconData = { leads, buyers, suppliers, invoices, payments, payouts, adSpend, unmatchedIn, resolved, txns };

  // Date-scoped copy for the Reconciliation (overview) tab. Telemetry stays all-time (live status).
  const scopedReconData = useMemo(() => ({
    buyers, suppliers, resolved, unmatchedIn,
    leads: leads.filter(l => inWin(l.created_date)),
    invoices: invoices.filter(i => inWin(i.created_date)),
    payments: payments.filter(p => inWin(p.paid_date)),
    payouts: payouts.filter(p => inWin(p.created_date)),
    adSpend: spendRows(adSpend).filter(a => inWin(a.date)),
    txns: txns.filter(t => inWin(t.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns, unmatchedIn, resolved, win]);

  // Real telemetry: bank feed, open gaps, overdue, payouts owing, ad-spend synced platforms.
  const telemetry = useMemo(() => {
    const rows = reconcile(reconData);
    const wb = workbench(rows, invoices);
    const payoutsOwing = payouts.reduce((a, p) => a + Math.max(0, num(p.amount) - num(p.paid_amount)), 0);
    const syncedPlatforms = new Set(adSpend.map(r => r.platform).filter(Boolean)).size;
    return {
      bankOnline: !!mercuryCfg || txns.length > 0,
      unmatchedIn,
      openGaps: wb.openGaps.length,
      overdue: wb.overdue,
      payoutsOwing,
      adSyncedPlatforms: syncedPlatforms,
      adTotalPlatforms: 3,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns, mercuryCfg, unmatchedIn]);

  const meta = TAB_META[tab] || TAB_META.overview;

  const refresh = () => {
    ['report-leads', 'buyers', 'suppliers', 'all-invoices', 'buyer-payments', 'supplier-payouts', 'adspend', 'bank-txns', 'mercury-config', 'adspend-mappings', 'finance-settings']
      .forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  };

  return (
    <FinanceShell
      tabName={meta.name}
      subtitle={meta.subtitle}
      telemetry={telemetry}
      onRefresh={refresh}
      filter={tab === 'settings' ? null : <DateRangeFilter period={period} custom={custom} onPeriodChange={setPeriod} onCustomChange={setCustom} />}
    >
      {tab === 'overview' && <ReconciliationTab data={scopedReconData} onResolve={(g) => { setResolved(r => r + 1); toast.success(`Marked ${g.name} resolved`); }} />}
      {tab === 'bank' && canBank && <BankFeedTab win={win} />}
      {tab === 'invoices' && <InvoicesTab buyers={buyers} win={win} />}
      {tab === 'payments' && <BuyerPaymentsTab buyers={buyers} win={win} />}
      {tab === 'payouts' && <SupplierPayoutsTab suppliers={suppliers} leads={leads} adSpend={adSpend} win={win} />}
      {tab === 'adspend' && <AdSpendTab win={win} />}
      {tab === 'profit' && canBank && <ProfitabilityTab win={win} leads={leads} adSpend={adSpend} settings={financeSettings} />}
      {tab === 'settings' && <FinanceSettingsTab />}
    </FinanceShell>
  );
}