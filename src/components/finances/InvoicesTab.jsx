import React, { useRef, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { isWithinInterval } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { money } from '@/lib/reportMetrics';
import { downloadCsv } from '@/lib/csv';
import { Panel, THead, rise } from '@/components/finances/financeAtoms';
import { StatChip } from '@/components/finances/financeUi';

const SUB_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Issued' },
  { key: 'overdue', label: 'Awaiting Payment' },
  { key: 'paid', label: 'Paid' },
];

const STATUS_STYLE = {
  draft: 'text-muted-foreground', sent: 'bg-status-queued status-queued',
  overdue: 'bg-status-unsold status-unsold', paid: 'bg-status-sold status-sold', void: 'text-muted-foreground',
};

export default function InvoicesTab({ buyers, win }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ buyer_id: '', amount: '', lead_count: '', status: 'draft', period_end: '' });

  const { data: allInvoices = [] } = useQuery({ queryKey: ['all-invoices'], queryFn: () => base44.entities.Invoice.list('-created_date', 500) });
  const invoices = useMemo(() => (win ? allInvoices.filter(i => i.created_date && isWithinInterval(new Date(i.created_date), { start: win.start, end: win.end })) : allInvoices), [allInvoices, win]);

  const buyerName = (id) => buyers.find(b => b.id === id)?.company_name || '-';
  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const now = new Date();
  const n = (v) => { const x = Number(v); return isNaN(x) ? 0 : x; };
  const outstanding = invoices.filter(i => i.status !== 'paid' && i.status !== 'void').reduce((a, i) => a + n(i.amount), 0);
  const awaiting = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((a, i) => a + n(i.amount), 0);
  const overdue = invoices.filter(i => i.status !== 'paid' && i.status !== 'void' && i.period_end && new Date(i.period_end) < now).reduce((a, i) => a + n(i.amount), 0);
  const collected = invoices.filter(i => i.status === 'paid').reduce((a, i) => a + n(i.amount), 0);
  const stats = [
    { label: 'Outstanding', value: money(outstanding), tone: outstanding > 0 ? 'warn' : 'good', pct: outstanding > 0 ? 100 : 0 },
    { label: 'Awaiting Payment', value: money(awaiting), tone: 'warn', pct: outstanding > 0 ? (awaiting / outstanding) * 100 : 0 },
    { label: 'Overdue', value: money(overdue), tone: overdue > 0 ? 'risk' : 'good', pct: overdue > 0 ? 100 : 0 },
    { label: 'Collected', value: money(collected), tone: 'good', pct: (collected + outstanding) > 0 ? (collected / (collected + outstanding)) * 100 : 0 },
  ];

  const create = async () => {
    if (!form.buyer_id || !form.amount) { toast.error('Buyer and amount are required'); return; }
    const num = allInvoices.length + 1;
    await base44.entities.Invoice.create({
      buyer_id: form.buyer_id, invoice_number: `INV-${String(num).padStart(4, '0')}`,
      amount: Number(form.amount) || 0, lead_count: Number(form.lead_count) || 0, status: form.status, period_end: form.period_end || undefined,
    });
    qc.invalidateQueries({ queryKey: ['all-invoices'] });
    setOpen(false); setForm({ buyer_id: '', amount: '', lead_count: '', status: 'draft', period_end: '' });
    toast.success('Invoice created');
  };

  const importCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: {
          buyer_name: { type: 'string' }, amount: { type: 'number' }, status: { type: 'string' }, lead_count: { type: 'number' },
        } } } } },
      });
      const rows = res?.output?.rows || res?.output || [];
      let n = allInvoices.length;
      const clean = (Array.isArray(rows) ? rows : []).map(r => {
        n++;
        const b = buyers.find(x => x.company_name?.toLowerCase() === String(r.buyer_name || '').toLowerCase());
        return { buyer_id: b?.id || '', invoice_number: `INV-${String(n).padStart(4, '0')}`, amount: Number(r.amount) || 0, lead_count: Number(r.lead_count) || 0, status: r.status || 'sent' };
      }).filter(r => r.amount);
      if (clean.length) await base44.entities.Invoice.bulkCreate(clean);
      toast.success(`Imported ${clean.length} invoices`);
      qc.invalidateQueries({ queryKey: ['all-invoices'] });
    } catch { toast.error('Import failed'); }
    e.target.value = '';
  };

  const markPaid = async (inv) => {
    await base44.entities.Invoice.update(inv.id, { status: 'paid' });
    await base44.entities.BuyerPayment.create({ buyer_id: inv.buyer_id, buyer_name: buyerName(inv.buyer_id), invoice_id: inv.id, amount: inv.amount, method: 'manual', paid_date: new Date().toISOString().slice(0, 10) });
    qc.invalidateQueries({ queryKey: ['all-invoices'] });
    qc.invalidateQueries({ queryKey: ['buyer-payments'] });
    toast.success('Marked paid');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s, i) => <StatChip key={s.label} {...s} i={i} />)}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {SUB_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${filter === f.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCsv} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv('invoices', [
            { key: 'invoice_number', label: 'Invoice' }, { key: 'buyer', label: 'Buyer', value: r => buyerName(r.buyer_id) }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' },
          ], filtered)}><Download className="w-3.5 h-3.5" /> Export</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5" /> Import CSV</Button>
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> New Invoice</Button>
        </div>
      </div>

      <Panel className="overflow-hidden">
        {/* Panel clips with overflow-hidden, so without an inner scroll
            container the right-hand columns were simply unreachable on a
            narrow screen rather than scrollable. */}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12px]">
          <thead><THead cols={['Invoice', 'Buyer', 'Amount', 'Leads', 'Status', 'Action']} alignRight={[2, 3, 5]} /></thead>
          <tbody className="divide-y divide-border/60">
            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
              <div>No invoices yet.</div>
              <button onClick={() => setOpen(true)} className="text-primary text-[12px] mt-1.5 hover:underline">Create your first invoice</button>
            </td></tr>}
            {filtered.map((inv, i) => (
              <motion.tr key={inv.id} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                <td className="px-4 py-2.5 font-mono">{inv.invoice_number}</td>
                <td className="px-4 py-2.5 text-foreground">{buyerName(inv.buyer_id)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(inv.amount)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{inv.lead_count || 0}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[inv.status] || ''}`}>{inv.status}</Badge></td>
                <td className="px-4 py-2.5 text-right">{inv.status !== 'paid' && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => markPaid(inv)}>Mark Paid</Button>}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[420px]">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
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
              <div><Label className="text-[12px]">Lead Count</Label><Input type="number" value={form.lead_count} onChange={e => setForm(p => ({ ...p, lead_count: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[12px]">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="sent">Issued</SelectItem><SelectItem value="overdue">Awaiting Payment</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-[12px]">Due Date</Label><Input type="date" value={form.period_end} onChange={e => setForm(p => ({ ...p, period_end: e.target.value }))} className="mt-1 bg-background text-[12px]" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}