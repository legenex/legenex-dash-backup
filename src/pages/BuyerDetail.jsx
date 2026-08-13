import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, ChevronLeft, ExternalLink, CreditCard, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { money } from '@/lib/partnerMetrics';

function parseArr(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function BuyerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ amount: '', lead_count: '', notes: '' });

  const { data: buyer, isLoading } = useQuery({
    queryKey: ['buyer', id],
    queryFn: () => base44.entities.Buyer.get(id),
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ['wallet-tx', id],
    queryFn: () => base44.entities.WalletTransaction.filter({ buyer_id: id }, '-created_date'),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => base44.entities.Invoice.filter({ buyer_id: id }, '-created_date'),
  });

  if (isLoading || !buyer) {
    return <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  const update = async (patch) => {
    await base44.entities.Buyer.update(buyer.id, patch);
    qc.invalidateQueries({ queryKey: ['buyer', id] });
  };

  const createInvoice = async () => {
    const num = invoices.length + 1;
    await base44.entities.Invoice.create({
      buyer_id: buyer.id,
      invoice_number: `INV-${String(num).padStart(4, '0')}`,
      amount: Number(invoiceForm.amount) || 0,
      lead_count: Number(invoiceForm.lead_count) || 0,
      status: 'draft',
      notes: invoiceForm.notes,
    });
    qc.invalidateQueries({ queryKey: ['invoices', id] });
    setInvoiceOpen(false);
    setInvoiceForm({ amount: '', lead_count: '', notes: '' });
    toast.success('Invoice created');
  };

  const Row = ({ label, value }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] text-foreground">{value || '-'}</span>
    </div>
  );

  const suppression = parseArr(buyer.suppression_lists);

  return (
    <div>
      {/* Mobile back row */}
      <div className="lg:hidden flex items-center gap-2 mb-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="tap-target flex items-center justify-center rounded-lg bg-card border border-border w-[38px] h-[38px]"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[17px] font-bold text-foreground tracking-tight truncate">{buyer.company_name}</h1>
      </div>
      <div className="lg:hidden flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${buyer.active ? 'status-sold bg-status-sold' : 'text-muted-foreground'}`}>{buyer.active ? 'Active' : 'Inactive'}</Badge>
          <Badge variant="outline" className="text-[10px]">{buyer.billing_mode === 'wallet' ? 'Wallet' : 'Lead Count'}</Badge>
          {buyer.portal_enabled && <Badge variant="outline" className="text-[10px] status-qualified bg-status-qualified">Portal On</Badge>}
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</div>
          <div className="text-[17px] font-bold text-foreground font-mono">{money(buyer.balance)}</div>
        </div>
      </div>

      <button onClick={() => navigate('/campaigns?tab=buyers')} className="hidden lg:flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Buyers
      </button>

      <div className="hidden lg:flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">{buyer.company_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={`text-[10px] ${buyer.active ? 'status-sold bg-status-sold' : 'text-muted-foreground'}`}>{buyer.active ? 'Active' : 'Inactive'}</Badge>
            <Badge variant="outline" className="text-[10px]">{buyer.billing_mode === 'wallet' ? 'Wallet' : 'Lead Count'}</Badge>
            {buyer.portal_enabled && <Badge variant="outline" className="text-[10px] status-qualified bg-status-qualified">Portal On</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Balance</div>
            <div className="text-[22px] font-bold text-foreground font-mono">{money(buyer.balance)}</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Portal & Billing</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Destination Profile</div>
            <Row label="Company Name" value={buyer.company_name} />
            <Row label="Email" value={buyer.email} />
            <Row label="Phone" value={buyer.phone} />
            <Row label="Location" value={buyer.location} />
            <Row label="Type" value={buyer.buyer_type} />
            <Row label="Vertical" value={buyer.vertical} />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-[10px] p-5">
              <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Coverage</div>
              <p className="text-[13px] text-muted-foreground">{buyer.coverage ? buyer.coverage : 'No coverage rules set. Coverage by state, zip, or county can be configured here.'}</p>
            </div>
            <div className="bg-card border border-border rounded-[10px] p-5">
              <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Suppression Lists</div>
              {suppression.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No suppression lists.</p>
              ) : (
                <div className="flex flex-wrap gap-2">{suppression.map((s, i) => <Badge key={i} variant="outline" className="text-[11px]">{s}</Badge>)}</div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-[10px] p-5">
            <Label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</Label>
            <Textarea
              defaultValue={buyer.notes || ''}
              onBlur={e => { if (e.target.value !== (buyer.notes || '')) { update({ notes: e.target.value }); toast.success('Notes saved'); } }}
              placeholder="Internal notes about this buyer…"
              className="mt-2 bg-background text-[13px] min-h-[100px]"
            />
          </div>
        </TabsContent>

        {/* PORTAL & BILLING */}
        <TabsContent value="billing" className="mt-4 space-y-6">
          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold text-foreground">Partner Portal</div>
                <p className="text-[12px] text-muted-foreground mt-1 max-w-md">Enable this buyer to log into the partner portal to view leads and billing.</p>
              </div>
              <Switch checked={!!buyer.portal_enabled} onCheckedChange={v => { update({ portal_enabled: v }); toast.success(`Portal ${v ? 'enabled' : 'disabled'}`); }} />
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!buyer.portal_enabled} onClick={() => navigate(`/portal?buyer_id=${buyer.id}`)}>
                <ExternalLink className="w-3.5 h-3.5" /> Preview Portal
              </Button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">Wallet & Billing</div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="text-[12px] mb-2 block">Billing Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: 'lead_count', l: 'Lead Count' }, { v: 'wallet', l: 'Wallet' }].map(o => (
                    <button key={o.v} type="button" onClick={() => update({ billing_mode: o.v })}
                      className={`p-2.5 rounded-lg border text-[13px] font-medium transition-all ${buyer.billing_mode === o.v ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:bg-accent/40'}`}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[12px]">Billing Model</Label>
                <Input defaultValue={buyer.billing_model || ''} onBlur={e => update({ billing_model: e.target.value })} placeholder="e.g. Net 30, Prepaid" className="mt-1 bg-background text-[13px]" />
              </div>
              <div>
                <Label className="text-[12px]">Billing Email</Label>
                <Input defaultValue={buyer.billing_email || ''} onBlur={e => update({ billing_email: e.target.value })} className="mt-1 bg-background text-[13px]" />
              </div>
              <div>
                <Label className="text-[12px]">Min Balance</Label>
                <Input type="number" defaultValue={buyer.min_balance ?? 0} onBlur={e => update({ min_balance: Number(e.target.value) || 0 })} className="mt-1 bg-background font-mono text-[12px]" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Switch checked={!!buyer.auto_recharge} onCheckedChange={v => update({ auto_recharge: v })} />
              <Label className="text-[12px]">Auto Recharge</Label>
            </div>
          </div>

          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Payment Methods</div>
            {buyer.card_last4 ? (
              <div className="flex items-center gap-2 text-[13px] text-foreground"><CreditCard className="w-4 h-4 text-muted-foreground" /> •••• {buyer.card_last4}</div>
            ) : (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info('Connect Stripe to enable card payments')}>
                <CreditCard className="w-3.5 h-3.5" /> Connect Stripe
              </Button>
            )}
          </div>

          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Wallet Transactions</div>
            </div>
            {transactions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead><tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left py-2">Type</th><th className="text-left py-2">Amount</th><th className="text-left py-2">Balance After</th><th className="text-left py-2">Description</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {transactions.map(t => (
                    <tr key={t.id}>
                      <td className="py-2"><Badge variant="outline" className="text-[10px]">{t.type}</Badge></td>
                      <td className="py-2 font-mono text-[12px]">{money(t.amount)}</td>
                      <td className="py-2 font-mono text-[12px]">{money(t.balance_after)}</td>
                      <td className="py-2 text-muted-foreground">{t.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Invoices</div>
              <Button size="sm" variant="outline" onClick={() => setInvoiceOpen(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Create Invoice</Button>
            </div>
            {invoices.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead><tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left py-2">Invoice</th><th className="text-left py-2">Amount</th><th className="text-left py-2">Leads</th><th className="text-left py-2">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="py-2 font-mono text-[12px] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-muted-foreground" />{inv.invoice_number}</td>
                      <td className="py-2 font-mono text-[12px]">{money(inv.amount)}</td>
                      <td className="py-2 font-mono text-[12px]">{inv.lead_count || 0}</td>
                      <td className="py-2"><Badge variant="outline" className="text-[10px]">{inv.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* LEADS */}
        <TabsContent value="leads" className="mt-4">
          <div className="bg-card border border-border rounded-[10px] p-8 text-center text-muted-foreground text-[13px]">
            Leads delivered to this buyer will appear here.
          </div>
        </TabsContent>

        {/* COSTS */}
        <TabsContent value="costs" className="mt-4">
          <div className="bg-card border border-border rounded-[10px] p-8 text-center text-muted-foreground text-[13px]">
            Cost breakdown per lead and per campaign will appear here.
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="bg-popover border-border max-w-[420px]">
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-[12px]">Amount ($) *</Label><Input type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm(p => ({ ...p, amount: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            <div><Label className="text-[12px]">Lead Count</Label><Input type="number" value={invoiceForm.lead_count} onChange={e => setInvoiceForm(p => ({ ...p, lead_count: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            <div><Label className="text-[12px]">Notes</Label><Textarea value={invoiceForm.notes} onChange={e => setInvoiceForm(p => ({ ...p, notes: e.target.value }))} className="mt-1 bg-background text-[12px]" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button onClick={createInvoice} disabled={!invoiceForm.amount}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}