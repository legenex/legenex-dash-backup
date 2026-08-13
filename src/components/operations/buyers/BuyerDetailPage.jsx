import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Archive, Wallet, CreditCard, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BuyerStatusPill from './BuyerStatusPill';
import BuyerProfileTab from './BuyerProfileTab';
import BuyerCoverageTab from './BuyerCoverageTab';
import PortalEnablementCard from '@/components/shared/PortalEnablementCard';
import BuyerDeliveriesCard from '@/components/shared/BuyerDeliveriesCard';
import BuyerBillingCard from '@/components/operations/buyers/BuyerBillingCard';
import { billingTypeLabel } from '@/lib/billingTypes';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'leads', label: 'Leads' },
  { key: 'costs', label: 'Costs' },
];

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// Full-page buyer detail. Swapped in-place over the list by the parent page.
// The Overview tab lays the reused profile/coverage editors into a card grid;
// Leads and Costs are stubs until their data sources are wired.
export default function BuyerDetailPage({ buyer, verticals, onBack, initialTab }) {
  // initialTab lets a deep link (e.g. the redirect from the old /buyers/:id
  // URL) open straight onto the right tab. Unknown values fall back to
  // Overview rather than rendering nothing.
  const [tab, setTab] = useState(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'overview',
  );
  const verticalName = verticals.find((v) => v.code === buyer.vertical)?.name || buyer.vertical || 'No vertical';

  // Wallet transactions for this buyer (real data where present).
  const { data: walletTx = [] } = useQuery({
    queryKey: ['buyer-wallet-tx', buyer.id],
    queryFn: () => base44.entities.WalletTransaction.filter({ buyer_id: buyer.id }, '-created_date', 50),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Back to buyers"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-semibold text-foreground truncate">{buyer.company_name || 'Buyer'}</h1>
            <BuyerStatusPill status={buyer.status} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-[11px] text-muted-foreground">{buyer.buyer_code || 'No code'}</span>
            <span className="text-muted-foreground/40">|</span>
            <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{verticalName}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Archive className="w-4 h-4" /> Archive</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Buyer Profile: reuses the existing editable buyer form */}
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Buyer Profile</p>
              <BuyerProfileTab buyer={buyer} verticals={verticals} />
            </div>

            {/* Partner Portal */}
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Partner Portal</p>
              <PortalEnablementCard
                record={buyer}
                entityName="Buyer"
                contactName={buyer.contact_name}
                contactEmail={buyer.email}
                previewPath={`/portal?buyer_id=${encodeURIComponent(buyer.id)}`}
                queryKey={['op-buyers']}
                label="partner portal"
              />
            </div>
          </div>

          {/* Buyer Deliveries: sits above Wallet because routing cannot work
              until the buyer has somewhere to send leads. Same card is used in
              Lead Distribution. */}
          <BuyerDeliveriesCard buyerId={buyer.id} buyerName={buyer.company_name || buyer.name} />

          {/* Wallet & Billing + Payment Methods */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <p className="text-[13px] font-semibold text-foreground">Wallet &amp; Billing</p>
              </div>
              <div className="space-y-3 text-[13px]">
                <Row label="Balance"><span className="font-mono tabular-nums text-foreground">{money(buyer.balance)}</span></Row>
                <Row label="Billing mode"><span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">{buyer.billing_mode || 'lead_count'}</span></Row>
                <Row label="Billing type"><span className="text-muted-foreground">{billingTypeLabel(buyer.billing_type)}</span></Row>
                <Row label="Min balance"><span className="font-mono tabular-nums text-muted-foreground">{money(buyer.min_balance)}</span></Row>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <p className="text-[13px] font-semibold text-foreground">Payment Methods</p>
              </div>
              {buyer.card_last4 ? (
                <div className="flex items-center gap-2 text-[13px] text-foreground">
                  <CreditCard className="w-4 h-4 text-muted-foreground" /> Card ending {buyer.card_last4}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-[12px] text-muted-foreground mb-3">No payment method connected.</p>
                  <Button variant="outline" size="sm">Connect Stripe</Button>
                </div>
              )}
            </div>
          </div>

          {/* Wallet Transactions */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              <p className="text-[13px] font-semibold text-foreground">Wallet Transactions</p>
            </div>
            {walletTx.length === 0 ? (
              <p className="text-[12px] text-muted-foreground text-center py-4">No wallet transactions yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {walletTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 text-[13px]">
                    <div className="min-w-0">
                      <span className="text-foreground capitalize">{tx.type || tx.reason || 'Transaction'}</span>
                      <span className="text-muted-foreground/60 ml-2 text-[11px]">{new Date(tx.created_date).toLocaleDateString()}</span>
                    </div>
                    <span className={`font-mono tabular-nums ${Number(tx.amount) < 0 ? 'text-primary' : 'status-sold'}`}>{money(tx.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoices + Auto Recharge. Ported from the old standalone
              /buyers/:id page, which now redirects here, so that the redirect
              does not drop features the operator still uses. */}
          <BuyerBillingCard buyer={buyer} />
        </div>
      )}

      {tab === 'leads' && (
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Coverage &amp; Pricing</p>
          <BuyerCoverageTab buyer={buyer} verticals={verticals} />
        </div>
      )}

      {tab === 'costs' && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Receipt className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-[13px] font-medium text-foreground">Costs</p>
          <p className="text-[12px] text-muted-foreground mt-1">Cost breakdown for this buyer will appear here.</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}