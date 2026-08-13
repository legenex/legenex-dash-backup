import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { money } from '@/lib/reportMetrics';

// Invoices and Auto Recharge for one buyer.
//
// Both of these previously existed only on the standalone /buyers/:id page.
// That page now redirects into Operations, so without this card the redirect
// would quietly drop two working features. Ported here rather than left behind,
// and restyled onto the design tokens instead of the old page's raw markup.
export default function BuyerBillingCard({ buyer }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: '', lead_count: '', notes: '' });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', buyer.id],
    queryFn: () => base44.entities.Invoice.filter({ buyer_id: buyer.id }, '-created_date'),
  });

  const setAutoRecharge = async (v) => {
    try {
      await base44.entities.Buyer.update(buyer.id, { auto_recharge: v });
      qc.invalidateQueries({ queryKey: ['op-buyers'] });
      toast.success(v ? 'Auto recharge on' : 'Auto recharge off');
    } catch (e) {
      toast.error('Could not update auto recharge: ' + (e?.message || 'error'));
    }
  };

  const createInvoice = async () => {
    setSaving(true);
    try {
      // Invoice numbers are per buyer and derived from the current count, which
      // is how the previous page did it. Kept identical so numbering does not
      // jump or collide with invoices created before the move.
      const next = invoices.length + 1;
      await base44.entities.Invoice.create({
        buyer_id: buyer.id,
        invoice_number: `INV-${String(next).padStart(4, '0')}`,
        amount: Number(form.amount) || 0,
        lead_count: Number(form.lead_count) || 0,
        status: 'draft',
        notes: form.notes,
      });
      qc.invalidateQueries({ queryKey: ['invoices', buyer.id] });
      setOpen(false);
      setForm({ amount: '', lead_count: '', notes: '' });
      toast.success('Invoice created');
    } catch (e) {
      toast.error('Could not create invoice: ' + (e?.message || 'error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <p className="text-[13px] font-semibold text-foreground">Invoices</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" />Create invoice
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5 mb-4">
        <div>
          <p className="text-[13px] text-foreground">Auto recharge</p>
          <p className="text-[12px] text-muted-foreground">Top the wallet up automatically when it falls below the minimum balance.</p>
        </div>
        <Switch checked={!!buyer.auto_recharge} onCheckedChange={setAutoRecharge} />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-4 py-8 justify-center text-[13px] text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />Loading invoices
        </div>
      ) : invoices.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <FileText className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">No invoices yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 font-medium">Invoice</th>
                <th className="text-left py-2 font-medium">Amount</th>
                <th className="text-left py-2 font-medium">Leads</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border hover:bg-accent">
                  <td className="py-2.5 font-mono text-[12px] text-foreground">{inv.invoice_number}</td>
                  <td className="py-2.5 font-mono tabular-nums text-[12px] text-foreground">{money(inv.amount)}</td>
                  <td className="py-2.5 font-mono tabular-nums text-[12px] text-muted-foreground">{inv.lead_count || 0}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground capitalize">
                      {inv.status || 'draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[420px]">
          <DialogHeader><DialogTitle>Create invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[12px] font-medium">Amount ($)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                className="mt-1 font-mono text-[12px]"
              />
            </div>
            <div>
              <Label className="text-[12px] font-medium">Lead count</Label>
              <Input
                type="number"
                value={form.lead_count}
                onChange={(e) => setForm((p) => ({ ...p, lead_count: e.target.value }))}
                className="mt-1 font-mono text-[12px]"
              />
            </div>
            <div>
              <Label className="text-[12px] font-medium">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="mt-1 text-[12px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="gap-1.5" onClick={createInvoice} disabled={!form.amount || saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}Create invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
