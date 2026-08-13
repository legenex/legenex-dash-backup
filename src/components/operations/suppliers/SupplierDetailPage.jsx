import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Megaphone } from 'lucide-react';
import SupplierStatusPill from './SupplierStatusPill';
import SupplierPayoutTab from './SupplierPayoutTab';
import SupplierNotificationsTab from './SupplierNotificationsTab';
import SupplierSourcesTab from './SupplierSourcesTab';
import PortalEnablementCard from '@/components/shared/PortalEnablementCard';
import PostingSpecs from '@/components/suppliers/PostingSpecs';
import SupplierMetaCosts from '@/components/suppliers/SupplierMetaCosts';

// Operations owns the supplier surface. These are the tabs that previously only
// existed on the standalone /suppliers/:id page, brought here so a supplier is
// managed in one place rather than two.
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sources', label: 'Sources' },
  { key: 'adspend', label: 'Ad Spend' },
  { key: 'specs', label: 'Posting Specs' },
  { key: 'portal', label: 'Portal' },
  { key: 'leads', label: 'Leads' },
];

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// Full-page supplier (source) detail. Swapped in-place over the list by the
// parent page. Overview lays the reused payout + notifications editors into a
// two-card grid, with the sources/campaigns list full-width below. Leads is a
// stub until its data source is wired.
export default function SupplierDetailPage({ supplier, onBack, initialTab }) {
  // initialTab lets a deep link (e.g. the redirect from the old
  // /suppliers/:id?tab=sources URL) open straight onto the right tab. Unknown
  // values fall back to Overview rather than rendering nothing.
  const [tab, setTab] = useState(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'overview',
  );

  const { data: sources = [] } = useQuery({
    queryKey: ['supplier-sources', supplier.id],
    queryFn: () => base44.entities.SupplierSource.filter({ supplier_id: supplier.id }, 'source_code', 500),
  });

  // Data the Posting Specs tab needs. Same query keys as elsewhere so these are
  // served from cache when the operator has already loaded them.
  const { data: apiKeys = [] } = useQuery({ queryKey: ['api-keys'], queryFn: () => base44.entities.ApiKey.list() });
  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list() });
  const { data: customFields = [] } = useQuery({ queryKey: ['custom-fields'], queryFn: () => base44.entities.CustomField.list('sort_order', 500) });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list() });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list() });
  const { data: appSettingsArr = [] } = useQuery({ queryKey: ['app-settings'], queryFn: () => base44.entities.AppSettings.list() });

  const apiKey = apiKeys.find((k) => k.supplier_id === supplier.id || k.supplier_name === supplier.name);
  const baseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Back to suppliers"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-semibold text-foreground truncate">{supplier.name || 'Supplier'}</h1>
            <SupplierStatusPill status={supplier.status} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-[11px] text-muted-foreground">{supplier.sid || 'No SID'}</span>
            <span className="text-muted-foreground/40">|</span>
            <span className="text-[12px] text-muted-foreground">{supplier.supplier_type || 'Unclassified'}</span>
          </div>
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
            {/* Source Profile: reuses the existing editable payout form */}
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Source Profile</p>
              <SupplierPayoutTab supplier={supplier} />
            </div>

            {/* Notifications: the alert routing editor for this source */}
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Notifications</p>
              <SupplierNotificationsTab supplier={supplier} />
            </div>
          </div>
        </div>
      )}

      {tab === 'sources' && (
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Supplier Sources</p>
          <SupplierSourcesTab supplier={supplier} />
        </div>
      )}

      {tab === 'adspend' && <SupplierMetaCosts supplier={supplier} />}

      {tab === 'specs' && (
        <PostingSpecs
          supplier={supplier}
          apiKey={apiKey}
          customFields={customFields}
          campaigns={campaigns}
          verticals={verticals}
          buyers={buyers}
          baseUrl={baseUrl}
        />
      )}

      {tab === 'portal' && (
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Source Portal</p>
          <PortalEnablementCard
            record={supplier}
            entityName="Supplier"
            contactName={supplier.contact_name}
            contactEmail={supplier.email}
            previewPath={`/supplier-portal?supplier_id=${encodeURIComponent(supplier.id)}`}
            queryKey={['op-suppliers']}
            label="source portal"
          />
        </div>
      )}

      {tab === 'leads' && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-[13px] font-medium text-foreground">Leads</p>
          <p className="text-[12px] text-muted-foreground mt-1">Leads from this source will appear here.</p>
        </div>
      )}
    </div>
  );
}