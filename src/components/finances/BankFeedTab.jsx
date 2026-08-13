import React, { useRef, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { isWithinInterval } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { categorizeTransactions } from '@/functions/categorizeTransactions';
import { syncMercury } from '@/functions/syncMercury';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Upload, Sparkles, Link2, ArrowDownUp, RefreshCw, CheckCircle2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { money } from '@/lib/reportMetrics';
import { unmatched } from '@/lib/financeMetrics';
import { Panel, THead, rise } from '@/components/finances/financeAtoms';
import { StatChip } from '@/components/finances/financeUi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { loadFinanceSettings, suggestMatch, suggestCategory } from '@/lib/financeSettings';
import { Wand2 } from 'lucide-react';

const CAT_STYLE = {
  tech: 'bg-status-qualified status-qualified', media: 'bg-status-queued status-queued',
  personal: 'bg-muted text-muted-foreground', payouts: 'bg-status-unsold status-unsold',
  revenue: 'bg-status-sold status-sold', other: 'bg-muted text-muted-foreground',
};

export default function BankFeedTab({ win }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);
  const [mercuryOpen, setMercuryOpen] = useState(false);
  const [mForm, setMForm] = useState({ api_token: '', account_id: '' });
  const [mSaving, setMSaving] = useState(false);
  const [mSyncing, setMSyncing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [savingTxn, setSavingTxn] = useState(false);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  const { data: fsettings } = useQuery({ queryKey: ['finance-settings'], queryFn: async () => (await loadFinanceSettings()).settings });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });

  const openTxn = (t) => {
    setSelected(t);
    setForm({ category: t.category || '', matched_entity_type: t.matched_entity_type || '', matched_entity_name: t.matched_entity_name || '' });
  };
  const suggestion = selected ? suggestMatch(selected.description, fsettings) : null;
  const catSuggestion = selected ? suggestCategory(selected.description, fsettings) : null;
  const nameFor = (type) => (type === 'supplier' ? suppliers.map(s => s.name) : buyers.map(b => b.company_name)).filter(Boolean);

  const saveTxn = async () => {
    if (!selected || !form) return;
    setSavingTxn(true);
    try {
      await base44.entities.BankTransaction.update(selected.id, {
        category: form.category || undefined,
        matched_entity_type: form.matched_entity_name ? (form.matched_entity_type || 'buyer') : undefined,
        matched_entity_name: form.matched_entity_name || undefined,
      });
      toast.success('Mapping saved');
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
      setSelected(null);
    } catch { toast.error('Could not save mapping'); }
    setSavingTxn(false);
  };

  const { data: allTxns = [] } = useQuery({
    queryKey: ['bank-txns'],
    queryFn: () => base44.entities.BankTransaction.list('-date', 500),
  });
  const txns = useMemo(() => (win ? allTxns.filter(t => t.date && isWithinInterval(new Date(t.date), { start: win.start, end: win.end })) : allTxns), [allTxns, win]);

  const { data: mercuryCfg } = useQuery({
    queryKey: ['mercury-config'],
    queryFn: async () => (await base44.entities.IntegrationConfig.filter({ name: 'mercury' }))[0] || null,
  });
  const mercuryConnected = !!mercuryCfg;
  const mercuryMeta = (() => { try { return JSON.parse(mercuryCfg?.config || '{}'); } catch { return {}; } })();

  const openMercury = () => {
    setMForm({ api_token: '', account_id: mercuryMeta.account_id || '' });
    setMercuryOpen(true);
  };

  const saveMercury = async () => {
    if (!mForm.api_token.trim()) { toast.error('Enter your Mercury API token'); return; }
    setMSaving(true);
    try {
      const payload = JSON.stringify({ api_token: mForm.api_token.trim(), account_id: mForm.account_id.trim() || undefined });
      if (mercuryCfg?.id) await base44.entities.IntegrationConfig.update(mercuryCfg.id, { config: payload });
      else await base44.entities.IntegrationConfig.create({ name: 'mercury', config: payload });
      toast.success('Mercury connected, pulling transactions...');
      qc.invalidateQueries({ queryKey: ['mercury-config'] });
      setMercuryOpen(false);
      await runMercurySync();
    } catch { toast.error('Failed to save Mercury token'); }
    setMSaving(false);
  };

  const runMercurySync = async () => {
    setMSyncing(true);
    try {
      const res = await syncMercury({});
      const d = res?.data || {};
      if (d.success) toast.success(`Synced ${d.ingested} new transaction${d.ingested !== 1 ? 's' : ''} from Mercury`);
      else toast.error(d.error || 'Mercury sync failed');
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Mercury sync failed'); }
    setMSyncing(false);
  };

  const moneyIn = txns.filter(t => t.amount > 0).reduce((a, t) => a + Number(t.amount), 0);
  const moneyOut = txns.filter(t => t.amount < 0).reduce((a, t) => a + Number(t.amount), 0);
  const unmatchedTxns = unmatched(txns);

  // Bulk auto-match: apply Finance Settings rules and aliases to every unmatched txn at once.
  const bulkAutoMatch = async () => {
    const targets = txns.filter(t => !t.matched_entity_type);
    const jobs = targets
      .map(t => ({ t, s: suggestMatch(t.description, fsettings) }))
      .filter(j => j.s && j.s.entity_name);
    if (jobs.length === 0) { toast.info('No confident matches from your rules. Add aliases in Finance Settings.'); return; }
    setBulkRunning(true);
    let applied = 0;
    try {
      for (const j of jobs) {
        try {
          await base44.entities.BankTransaction.update(j.t.id, { matched_entity_type: j.s.entity_type, matched_entity_name: j.s.entity_name });
          applied++;
        } catch { /* skip a failed row, keep going */ }
      }
      toast.success(`Matched ${applied} of ${targets.length} unmatched transaction${targets.length !== 1 ? 's' : ''}`);
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
    } finally { setBulkRunning(false); }
  };

  const displayTxns = unmatchedOnly ? txns.filter(t => !t.matched_entity_type) : txns;

  const importCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' }, description: { type: 'string' }, amount: { type: 'number' },
                },
              },
            },
          },
        },
      });
      const rows = res?.output?.rows || res?.output || [];
      const clean = (Array.isArray(rows) ? rows : []).filter(r => r.date && r.amount != null).map(r => ({
        source: 'csv', date: String(r.date).slice(0, 10), description: r.description || '', amount: Number(r.amount) || 0,
      }));
      if (clean.length) await base44.entities.BankTransaction.bulkCreate(clean);
      toast.success(`Imported ${clean.length} transactions`);
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
    } catch (err) {
      toast.error('Import failed - check the CSV format');
    }
    setBusy(false);
    e.target.value = '';
  };

  const runCategorize = async () => {
    setBusy(true);
    try {
      const res = await categorizeTransactions({});
      const d = res?.data || {};
      if (d.success) toast.success(`AI categorized ${d.updated} transactions`);
      else toast.error(d.error || 'Failed');
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
    } catch { toast.error('Categorization failed'); }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-3 gap-3 flex-1 min-w-[360px] max-w-[600px]">
          <StatChip label="Money In" value={money(moneyIn)} tone="good" pct={100} i={0} />
          <StatChip label="Money Out" value={money(moneyOut)} tone="risk" pct={moneyIn > 0 ? Math.min(100, (Math.abs(moneyOut) / moneyIn) * 100) : (moneyOut < 0 ? 100 : 0)} i={1} />
          <StatChip label="Net" value={money(moneyIn + moneyOut)} tone={moneyIn + moneyOut >= 0 ? 'good' : 'risk'} pct={(moneyIn + moneyOut) >= 0 ? 100 : 0} i={2} />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCsv} />
          {mercuryConnected ? (
            <>
              <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium mr-1"><CheckCircle2 className="w-3.5 h-3.5" /> Mercury connected</span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={runMercurySync} disabled={mSyncing}>
                <RefreshCw className={`w-3.5 h-3.5 ${mSyncing ? 'animate-spin' : ''}`} /> Sync Now
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={openMercury}>
                <Link2 className="w-3.5 h-3.5" /> Reconnect
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openMercury}>
              <Link2 className="w-3.5 h-3.5" /> Connect Mercury
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </Button>
          <Button size="sm" className="gap-1.5" onClick={runCategorize} disabled={busy}>
            <Sparkles className="w-3.5 h-3.5" /> AI Categorize
          </Button>
        </div>
      </div>

      {unmatchedTxns.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <ArrowDownUp className="w-3.5 h-3.5" /> {unmatchedTxns.length} unmatched transaction{unmatchedTxns.length !== 1 ? 's' : ''} in the queue
          </span>
          <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={bulkAutoMatch} disabled={bulkRunning}>
            <Wand2 className={`w-3.5 h-3.5 ${bulkRunning ? 'animate-pulse' : ''}`} /> {bulkRunning ? 'Matching...' : 'Auto-match all'}
          </Button>
          <button
            type="button"
            onClick={() => setUnmatchedOnly(v => !v)}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] transition-colors ${unmatchedOnly ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {unmatchedOnly ? 'Showing unmatched only' : 'Show unmatched only'}
          </button>
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12px]">
          <thead><THead cols={['Date', 'Description', 'Category', 'Matched', 'Amount']} alignRight={[4]} /></thead>
          <tbody className="divide-y divide-border/60">
            {displayTxns.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">{unmatchedOnly ? 'No unmatched transactions in this period.' : 'No transactions yet. Connect Mercury or import a CSV.'}</td></tr>}
            {displayTxns.map((t, i) => (
              <motion.tr key={t.id} variants={rise} initial="hidden" animate="show" custom={i} onClick={() => openTxn(t)} className="hover:bg-foreground/[0.02] cursor-pointer">
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.date}</td>
                <td className="px-4 py-2.5 text-foreground truncate max-w-[280px]">{t.description || '-'}</td>
                <td className="px-4 py-2.5">{t.category ? <Badge variant="outline" className={`text-[10px] ${CAT_STYLE[t.category] || ''}`}>{t.category}{t.ai_categorized ? ' *' : ''}</Badge> : <span className="text-muted-foreground">-</span>}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{t.matched_entity_name || '-'}</td>
                <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${t.amount >= 0 ? 'status-sold' : 'text-destructive'}`}>{money(t.amount)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>

      {txns.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <span>
            {unmatchedTxns.length === 0
              ? 'Every transaction is matched to a counterparty. This bank feed is fully reconciled.'
              : `${unmatchedTxns.length} of ${txns.length} transactions are still unmatched. Run AI Categorize to sort them, then match them to buyers or suppliers in Reconciliation.`}
          </span>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="bg-popover border-border max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Transaction detail</DialogTitle>
            <DialogDescription>See where this transaction is mapped and re-map it.</DialogDescription>
          </DialogHeader>
          {selected && form && (
            <div className="space-y-3.5">
              <div className="rounded-lg border border-border bg-background/40 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground truncate">{selected.description || '-'}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{selected.date}</div>
                </div>
                <div className={`text-[16px] font-bold font-mono tabular-nums whitespace-nowrap ${selected.amount >= 0 ? 'status-sold' : 'text-destructive'}`}>{money(selected.amount)}</div>
              </div>

              {suggestion && form.matched_entity_name !== suggestion.entity_name && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
                  <div className="flex items-start gap-2 min-w-0">
                    <Wand2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[12px] text-foreground">Suggested: <span className="font-semibold">{suggestion.entity_name}</span> <span className="text-muted-foreground">({suggestion.entity_type})</span></div>
                      <div className="text-[11px] text-muted-foreground">Matched by {suggestion.reason}</div>
                    </div>
                  </div>
                  <Button size="sm" className="h-7 text-[11px] shrink-0" onClick={() => setForm(f => ({ ...f, matched_entity_type: suggestion.entity_type, matched_entity_name: suggestion.entity_name }))}>Apply</Button>
                </div>
              )}

              <div>
                <Label className="text-[12px]">Category {catSuggestion && !form.category && <span className="text-muted-foreground">- suggested {catSuggestion.label}</span>}</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1 bg-background text-[12px]"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                  <SelectContent>{(fsettings?.categories || []).map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[12px]">Match type</Label>
                  <Select value={form.matched_entity_type} onValueChange={v => setForm(f => ({ ...f, matched_entity_type: v, matched_entity_name: '' }))}>
                    <SelectTrigger className="mt-1 bg-background text-[12px]"><SelectValue placeholder="Unmatched" /></SelectTrigger>
                    <SelectContent><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="supplier">Supplier</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Counterparty</Label>
                  <Select value={form.matched_entity_name} onValueChange={v => setForm(f => ({ ...f, matched_entity_name: v }))}>
                    <SelectTrigger className="mt-1 bg-background text-[12px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{nameFor(form.matched_entity_type).map(nm => <SelectItem key={nm} value={nm}>{nm}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={saveTxn} disabled={savingTxn} className="gap-1.5"><Save className="w-3.5 h-3.5" /> {savingTxn ? 'Saving...' : 'Save mapping'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mercuryOpen} onOpenChange={setMercuryOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Connect Mercury</DialogTitle>
            <DialogDescription>Paste your Mercury API token to pull transactions live. CSV import stays available as a fallback.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Mercury API Token</Label>
              <Input value={mForm.api_token} onChange={e => setMForm(p => ({ ...p, api_token: e.target.value }))} type="password" placeholder="secret-token-…" className="mt-1 bg-background font-mono text-[12px]" />
              <p className="text-[11px] text-muted-foreground mt-1.5">Create a read token in Mercury Settings, API tokens. Requires read access to transactions.</p>
            </div>
            <div>
              <Label className="text-[12px]">Account ID (optional)</Label>
              <Input value={mForm.account_id} onChange={e => setMForm(p => ({ ...p, account_id: e.target.value }))} placeholder="Leave blank to sync all accounts" className="mt-1 bg-background font-mono text-[12px]" />
            </div>
            {mercuryMeta.last_synced_at && <div className="text-[11px] text-muted-foreground">Last synced {new Date(mercuryMeta.last_synced_at).toLocaleString()}. Syncs automatically every hour.</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMercuryOpen(false)}>Cancel</Button>
            <Button onClick={saveMercury} disabled={mSaving} className="gap-1.5"><Save className="w-3.5 h-3.5" /> {mSaving ? 'Saving…' : 'Save & Sync'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}