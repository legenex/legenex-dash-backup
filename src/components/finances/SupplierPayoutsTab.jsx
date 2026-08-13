import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { isWithinInterval } from 'date-fns';
import { leadCost } from '@/lib/reportMetrics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { money, spendRows } from '@/lib/reportMetrics';
import { downloadCsv } from '@/lib/csv';
import { Panel, THead, rise } from '@/components/finances/financeAtoms';
import { StatChip } from '@/components/finances/financeUi';

const n = (v) => { const x = Number(v); return isNaN(x) ? 0 : x; };

export default function SupplierPayoutsTab({ suppliers = [], leads = [], adSpend = [], win }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplier_name: '', amount: '', lead_count: '', status: 'draft' });

  const { data: allPayouts = [] } = useQuery({ queryKey: ['supplier-payouts'], queryFn: () => base44.entities.SupplierPayout.list('-created_date', 500) });
  const inWin = (d) => !win || (d && isWithinInterval(new Date(d), { start: win.start, end: win.end }));
  const payouts = useMemo(() => allPayouts.filter(p => inWin(p.created_date)), [allPayouts, win]);
  const winLeads = useMemo(() => leads.filter(l => inWin(l.created_date)), [leads, win]);
  const winSpend = useMemo(() => spendRows(adSpend).filter(a => inWin(a.date)), [adSpend, win]);

  // Per-supplier reconciliation: declared cost (lead cost), ad spend, true cost, payouts issued/paid/owing.
  const rows = useMemo(() => {
    const names = new Set([
      ...suppliers.map(s => s.name),
      ...payouts.map(p => p.supplier_name),
    ].filter(Boolean));
    return Array.from(names).map(name => {
      const sLeads = winLeads.filter(l => l.supplier_name === name);
      const declaredCost = sLeads.reduce((a, l) => a + leadCost(l), 0);
      const spend = winSpend.filter(a => a.supplier_name === name).reduce((a, r) => a + n(r.spend), 0);
      const sPayouts = payouts.filter(p => p.supplier_name === name);
      const issued = sPayouts.reduce((a, p) => a + n(p.amount), 0);
      const paid = sPayouts.reduce((a, p) => a + n(p.paid_amount), 0);
      return { name, declaredCost, spend, trueCost: declaredCost + spend, issued, paid, owing: Math.max(0, issued - paid) };
    }).filter(r => r.declaredCost > 0 || r.spend > 0 || r.issued > 0).sort((a, b) => b.trueCost - a.trueCost);
  }, [suppliers, winLeads, winSpend, payouts]);

  const owing = rows.reduce((a, r) => a + r.owing, 0);
  const paidTotal = rows.reduce((a, r) => a + r.paid, 0);
  const declaredTotal = rows.reduce((a, r) => a + r.declaredCost, 0);

  const stats = [
    { label: 'Owing', value: money(owing), tone: owing > 0 ? 'warn' : 'good', pct: owing > 0 ? 100 : 0 },
    { label: 'Paid', value: money(paidTotal), tone: 'good', pct: (paidTotal + owing) > 0 ? (paidTotal / (paidTotal + owing)) * 100 : 0 },
    { label: 'Declared Cost', value: money(declaredTotal), tone: undefined, pct: 100 },
  ];

  const create = async () => {
    if (!form.supplier_name || !form.amount) { toast.error('Supplier and amount required'); return; }
    await base44.entities.SupplierPayout.create({ supplier_name: form.supplier_name, amount: Number(form.amount) || 0, lead_count: Number(form.lead_count) || 0, status: form.status, paid_amount: form.status === 'paid' ? Number(form.amount) || 0 : 0 });
    qc.invalidateQueries({ queryKey: ['supplier-payouts'] });
    setOpen(false); setForm({ supplier_name: '', amount: '', lead_count: '', status: 'draft' });
    toast.success('Payout created');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map((s, i) => <StatChip key={s.label} {...s} i={i} />)}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv('supplier_payouts', [
          { key: 'name', label: 'Supplier' }, { key: 'declaredCost', label: 'Declared Cost' }, { key: 'spend', label: 'Ad Spend' }, { key: 'trueCost', label: 'True Cost' }, { key: 'issued', label: 'Issued' }, { key: 'paid', label: 'Paid' }, { key: 'owing', label: 'Owing' },
        ], rows)}><Download className="w-3.5 h-3.5" /> Export</Button>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> Record Payout</Button>
      </div>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12px]">
          <thead><THead cols={['Supplier', 'Declared Cost', 'Ad Spend', 'True Cost', 'Payouts Issued', 'Paid', 'Owing']} alignRight={[1, 2, 3, 4, 5, 6]} /></thead>
          <tbody className="divide-y divide-border/60">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
              <div>No supplier costs or payouts yet.</div>
              <button onClick={() => setOpen(true)} className="text-primary text-[12px] mt-1.5 hover:underline">Record a payout</button>
            </td></tr>}
            {rows.map((r, i) => (
              <motion.tr key={r.name} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                <td className="px-4 py-2.5 text-foreground">{r.name}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{money(r.declaredCost)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{money(r.spend)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">{money(r.trueCost)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.issued)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums status-sold">{money(r.paid)}</td>
                <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${r.owing > 0 ? 'status-unsold' : 'text-muted-foreground'}`}>{money(r.owing)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>

      {rows.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <span>
            True cost is {money(declaredTotal + rows.reduce((a, r) => a + r.spend, 0))} once ad spend is folded in.
            {owing > 0 ? ` ${money(owing)} is still owed to suppliers across ${rows.filter(r => r.owing > 0).length} account${rows.filter(r => r.owing > 0).length !== 1 ? 's' : ''}.` : ' All issued payouts are fully paid.'}
          </span>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[400px]">
          <DialogHeader><DialogTitle>Record Supplier Payout</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Supplier *</Label>
              <Select value={form.supplier_name} onValueChange={v => setForm(p => ({ ...p, supplier_name: v }))}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[12px]">Amount *</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Lead Count</Label><Input type="number" value={form.lead_count} onChange={e => setForm(p => ({ ...p, lead_count: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            </div>
            <div>
              <Label className="text-[12px]">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="issued">Issued</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}