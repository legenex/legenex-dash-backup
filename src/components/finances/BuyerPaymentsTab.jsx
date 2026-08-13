import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { isWithinInterval } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { money } from '@/lib/reportMetrics';
import { downloadCsv } from '@/lib/csv';
import { Panel, THead, rise } from '@/components/finances/financeAtoms';
import { StatChip } from '@/components/finances/financeUi';

export default function BuyerPaymentsTab({ buyers, win }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ buyer_id: '', amount: '', method: 'manual', paid_date: new Date().toISOString().slice(0, 10) });

  const { data: allPayments = [] } = useQuery({ queryKey: ['buyer-payments'], queryFn: () => base44.entities.BuyerPayment.list('-paid_date', 500) });
  const { data: invoices = [] } = useQuery({ queryKey: ['all-invoices'], queryFn: () => base44.entities.Invoice.list('-created_date', 500) });
  const payments = useMemo(() => (win ? allPayments.filter(p => p.paid_date && isWithinInterval(new Date(p.paid_date), { start: win.start, end: win.end })) : allPayments), [allPayments, win]);

  const n = (v) => { const x = Number(v); return isNaN(x) ? 0 : x; };
  const received = payments.reduce((a, p) => a + n(p.amount), 0);
  const nowMonth = new Date().toISOString().slice(0, 7);
  const thisMonth = payments.filter(p => String(p.paid_date || '').slice(0, 7) === nowMonth).reduce((a, p) => a + n(p.amount), 0);

  // Avg days to pay: for payments linked to an invoice, paid_date minus invoice created_date.
  const invById = Object.fromEntries(invoices.map(i => [i.id, i]));
  const dayGaps = payments
    .map(p => { const inv = p.invoice_id ? invById[p.invoice_id] : null; if (!inv?.created_date || !p.paid_date) return null; const d = (new Date(p.paid_date) - new Date(inv.created_date)) / 86400000; return d >= 0 ? d : null; })
    .filter(v => v != null);
  const avgDays = dayGaps.length ? Math.round(dayGaps.reduce((a, d) => a + d, 0) / dayGaps.length) : null;

  const stats = [
    { label: 'Received', value: money(received), tone: 'good', pct: received > 0 ? 100 : 0 },
    { label: 'This Month', value: money(thisMonth), tone: 'good', pct: received > 0 ? (thisMonth / received) * 100 : 0 },
    { label: 'Avg Days To Pay', value: avgDays == null ? '--' : `${avgDays}d`, tone: avgDays != null && avgDays <= 30 ? 'good' : 'warn', pct: avgDays == null ? 0 : Math.min(100, (avgDays / 60) * 100) },
  ];

  const create = async () => {
    if (!form.buyer_id || !form.amount) { toast.error('Buyer and amount required'); return; }
    const b = buyers.find(x => x.id === form.buyer_id);
    await base44.entities.BuyerPayment.create({ buyer_id: form.buyer_id, buyer_name: b?.company_name || '', amount: Number(form.amount) || 0, method: form.method, paid_date: form.paid_date });
    qc.invalidateQueries({ queryKey: ['buyer-payments'] });
    setOpen(false); setForm({ buyer_id: '', amount: '', method: 'manual', paid_date: new Date().toISOString().slice(0, 10) });
    toast.success('Payment recorded');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map((s, i) => <StatChip key={s.label} {...s} i={i} />)}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv('buyer_payments', [
          { key: 'buyer_name', label: 'Buyer' }, { key: 'amount', label: 'Amount' }, { key: 'method', label: 'Method' }, { key: 'paid_date', label: 'Date' },
        ], payments)}><Download className="w-3.5 h-3.5" /> Export</Button>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> Record Payment</Button>
      </div>
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12px]">
          <thead><THead cols={['Buyer', 'Method', 'Date', 'Amount']} alignRight={[3]} /></thead>
          <tbody className="divide-y divide-border/60">
            {payments.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
              <div>No payments recorded yet.</div>
              <button onClick={() => setOpen(true)} className="text-primary text-[12px] mt-1.5 hover:underline">Record a payment</button>
            </td></tr>}
            {payments.map((p, i) => (
              <motion.tr key={p.id} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                <td className="px-4 py-2.5 text-foreground">{p.buyer_name || '-'}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{p.method}</Badge></td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{p.paid_date}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums status-sold">{money(p.amount)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>

      {payments.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <span>
            {money(received)} received across {payments.length} payment{payments.length !== 1 ? 's' : ''}
            {avgDays != null ? `, averaging ${avgDays} days from invoice to payment.` : '.'}
            {avgDays != null && avgDays > 30 ? ' Buyers are paying slower than Net 30, consider tightening terms.' : ''}
          </span>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[400px]">
          <DialogHeader><DialogTitle>Record Buyer Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Buyer *</Label>
              <Select value={form.buyer_id} onValueChange={v => setForm(p => ({ ...p, buyer_id: v }))}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select buyer" /></SelectTrigger>
                <SelectContent>{buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[12px]">Amount *</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Date</Label><Input type="date" value={form.paid_date} onChange={e => setForm(p => ({ ...p, paid_date: e.target.value }))} className="mt-1 bg-background text-[12px]" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}