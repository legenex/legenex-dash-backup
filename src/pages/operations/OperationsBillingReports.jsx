import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/lib/theme';
import SectionHeader from '@/components/shared/SectionHeader';
import RefreshButton from '@/components/shared/RefreshButton';
import PeriodTabs from '@/components/shared/PeriodTabs';
import { PulseDot } from '@/components/settings/settingsUi';
import { useToast } from '@/components/ui/use-toast';
import { resolvePeriod } from '@/lib/periodRange';
import BillingTiles from '@/components/operations/billing/BillingTiles';
import PrepayWatchPanel from '@/components/operations/billing/PrepayWatchPanel';
import DailyQueuePanel from '@/components/operations/billing/DailyQueuePanel';
import { TopUpDialog, GenerateInvoiceDialog } from '@/components/operations/billing/BillingDialogs';
import { runBillingPreview, toReginaDateString } from '@/components/operations/billing/billingApi';

export default function OperationsBillingReports() {
  useTheme();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [period, setPeriod] = useState('yesterday');
  const [custom, setCustom] = useState({ from: '', to: '' });

  const { start, end } = useMemo(() => resolvePeriod(period, custom), [period, custom]);
  const periodStart = useMemo(() => toReginaDateString(start), [start]);
  const periodEnd = useMemo(() => toReginaDateString(end), [end]);

  // ── Entity reads via the existing client + react-query pattern ──────────
  const { data: buyers = [] } = useQuery({
    queryKey: ['br-buyers'],
    queryFn: () => base44.entities.Buyer.list('-updated_date', 500),
  });
  const { data: billingRuns = [] } = useQuery({
    queryKey: ['br-billing-runs'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.BillingRun.list('-created_date', limit, skip)),
  });
  // Invoice is read to keep the client entity pattern consistent for later
  // builds; not surfaced as a figure here.
  useQuery({
    queryKey: ['br-invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date', 500),
  });

  const prepayBuyers = useMemo(
    () => buyers.filter((b) => b.billing_type === 'prepay' && b.status !== 'terminated'),
    [buyers],
  );
  const dailyBuyers = useMemo(
    () => buyers.filter((b) => b.billing_type === 'invoiced_daily' && b.status !== 'terminated'),
    [buyers],
  );

  // ── Summary tile state, fed up from the panels ──────────────────────────
  const [prepayProjection, setPrepayProjection] = useState({});
  const [dailyPreviews, setDailyPreviews] = useState({});

  const prepayLowCount = useMemo(
    () => Object.values(prepayProjection).filter((d) => d != null && d <= 3).length,
    [prepayProjection],
  );

  // Draft runs awaiting issue: committed BillingRun rows still in draft status.
  const draftRunCount = useMemo(
    () => billingRuns.filter((r) => r.status === 'draft').length,
    [billingRuns],
  );

  // Total net in the selected period: sum of daily queue preview nets. Null when
  // no preview has resolved yet, so the tile renders no value rather than a zero.
  const dailyReady = dailyBuyers.length === 0
    || dailyBuyers.every((b) => dailyPreviews[b.id]);
  const totalNet = useMemo(() => {
    if (!dailyReady) return null;
    const vals = dailyBuyers.map((b) => dailyPreviews[b.id]?.totals?.net).filter((v) => v != null);
    if (dailyBuyers.length > 0 && vals.length === 0) return null;
    return vals.reduce((s, v) => s + Number(v || 0), 0);
  }, [dailyReady, dailyBuyers, dailyPreviews]);

  // ── Dialogs ──────────────────────────────────────────────────────────────
  const [topUp, setTopUp] = useState({ open: false, buyer: null, preview: null });
  const [genDialog, setGenDialog] = useState({ open: false, buyer: null, preview: null });
  const [generating, setGenerating] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);

  const refresh = useCallback(() => Promise.all([
    qc.invalidateQueries({ queryKey: ['br-buyers'] }),
    qc.invalidateQueries({ queryKey: ['br-billing-runs'] }),
    qc.invalidateQueries({ queryKey: ['br-invoices'] }),
    qc.invalidateQueries({ queryKey: ['daily-preview'] }),
    qc.invalidateQueries({ queryKey: ['prepay-trailing'] }),
  ]), [qc]);

  // Commit one buyer's draft, returning a plain result the caller can report on.
  const commitBuyer = useCallback(async (buyer) => {
    try {
      const res = await runBillingPreview({
        scope: 'buyer', buyerId: buyer.id, periodStart, periodEnd, commit: true,
      });
      if (res?.error) return { ok: false, name: buyer.company_name, message: res.error };
      return { ok: true, name: buyer.company_name };
    } catch (e) {
      // The function returns 409 with a naming error when an issued/paid run
      // exists; surface that message rather than a generic failure.
      const message = e?.response?.data?.error || e?.message || 'Generation failed';
      return { ok: false, name: buyer.company_name, message };
    }
  }, [periodStart, periodEnd]);

  const onConfirmGenerate = async () => {
    const buyer = genDialog.buyer;
    if (!buyer) return;
    setGenerating(true);
    const result = await commitBuyer(buyer);
    setGenerating(false);
    setGenDialog({ open: false, buyer: null, preview: null });
    if (result.ok) {
      toast({ title: 'Draft billing run created', description: `A draft run was written for ${result.name}.` });
    } else {
      toast({ variant: 'destructive', title: 'Draft not created', description: result.message });
    }
    await refresh();
  };

  const onGenerateAll = async () => {
    if (generatingAll || dailyBuyers.length === 0) return;
    setGeneratingAll(true);
    let created = 0;
    const refusals = [];
    // Strictly sequential, never parallel.
    for (const b of dailyBuyers) {
      // eslint-disable-next-line no-await-in-loop
      const r = await commitBuyer(b);
      if (r.ok) created += 1;
      else refusals.push(`${r.name}: ${r.message}`);
    }
    setGeneratingAll(false);
    if (refusals.length === 0) {
      toast({ title: 'All drafts generated', description: `${created} draft runs written.` });
    } else {
      toast({
        variant: 'destructive',
        title: `${created} created, ${refusals.length} refused`,
        description: refusals.slice(0, 3).join('  |  '),
      });
    }
    await refresh();
  };

  const dueTodayCount = dailyBuyers.length;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Billing Reports" subtitle="Who to charge, how much, and when.">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <PulseDot /> Live
        </span>
        <PeriodTabs value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
        <RefreshButton onClick={refresh} />
      </SectionHeader>

      <BillingTiles
        dueToday={dueTodayCount}
        prepayLow={prepayLowCount}
        draftRuns={draftRunCount}
        totalNet={totalNet}
        netLoading={!dailyReady}
      />

      <div className="space-y-2">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Prepay watch</h2>
          <p className="text-[12px] text-muted-foreground">Law firms pay upfront. This is when each deposit runs out.</p>
        </div>
        <PrepayWatchPanel
          buyers={prepayBuyers}
          onTopUp={(buyer, preview) => setTopUp({ open: true, buyer, preview })}
          onPreviews={setPrepayProjection}
        />
      </div>

      <div className="space-y-2">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Daily invoicing queue</h2>
          <p className="text-[12px] text-muted-foreground">Aggregators bill daily. Previews for the selected period.</p>
        </div>
        <DailyQueuePanel
          buyers={dailyBuyers}
          periodStart={periodStart}
          periodEnd={periodEnd}
          generatingAll={generatingAll}
          onGenerate={(buyer, preview) => setGenDialog({ open: true, buyer, preview })}
          onGenerateAll={onGenerateAll}
          onPreviews={setDailyPreviews}
        />
      </div>

      <TopUpDialog
        open={topUp.open}
        onOpenChange={(v) => setTopUp((s) => ({ ...s, open: v }))}
        buyer={topUp.buyer}
        preview={topUp.preview}
        onConfirm={() => {
          setTopUp({ open: false, buyer: null, preview: null });
          toast({ title: 'Acknowledged', description: 'Invoice issuing arrives in a later build.' });
        }}
      />

      <GenerateInvoiceDialog
        open={genDialog.open}
        onOpenChange={(v) => setGenDialog((s) => ({ ...s, open: v }))}
        buyer={genDialog.buyer}
        preview={genDialog.preview}
        working={generating}
        onConfirm={onConfirmGenerate}
      />
    </div>
  );
}