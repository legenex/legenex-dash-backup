import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ChevronLeft, Copy, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supplierMetrics, money, pct } from '@/lib/partnerMetrics';
import PostingSpecs from '@/components/suppliers/PostingSpecs';
import SupplierSourcesTab from '@/components/operations/suppliers/SupplierSourcesTab';
import SupplierMetaCosts from '@/components/suppliers/SupplierMetaCosts';

function parseArr(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function SupplierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showKey, setShowKey] = useState(false);
  const TAB_VALUES = ['overview', 'sources', 'adspend', 'specs', 'portal', 'leads'];
  const rawTab = searchParams.get('tab') || 'overview';
  const activeTab = TAB_VALUES.includes(rawTab) ? rawTab : 'overview';
  const onTabChange = (v) => setSearchParams(v === 'overview' ? {} : { tab: v }, { replace: true });

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => base44.entities.Supplier.get(id),
  });
  const { data: apiKeys = [] } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => base44.entities.ApiKey.list(),
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => base44.entities.Campaign.list(),
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => base44.entities.Brand.list(),
  });
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-metrics'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.filter({ archived: false }, '-created_date', limit, skip)),
  });
  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list('sort_order', 500),
  });
  const { data: verticals = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list(),
  });
  const { data: buyers = [] } = useQuery({
    queryKey: ['buyers'],
    queryFn: () => base44.entities.Buyer.list(),
  });
  const { data: appSettingsArr = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  if (isLoading || !supplier) {
    return <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  const key = apiKeys.find(k => k.supplier_id === supplier.id || k.supplier_name === supplier.name);
  const assignedCampaigns = campaigns.filter(c => parseArr(supplier.campaign_ids).includes(c.id));
  const supplierLeads = leads.filter(l => l.supplier_name === supplier.name);
  const m = supplierMetrics(leads, supplier.name);
  const baseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';

  const updateBrand = async (brand) => {
    await base44.entities.Supplier.update(supplier.id, { brand: brand === '__none__' ? '' : brand });
    qc.invalidateQueries({ queryKey: ['supplier', id] });
    toast.success('Brand updated');
  };

  const togglePortal = async () => {
    await base44.entities.Supplier.update(supplier.id, { portal_enabled: !supplier.portal_enabled });
    qc.invalidateQueries({ queryKey: ['supplier', id] });
    toast.success(`Source portal ${!supplier.portal_enabled ? 'enabled' : 'disabled'}`);
  };

  const Row = ({ label, value }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] text-foreground">{value || '-'}</span>
    </div>
  );

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
        <h1 className="text-[17px] font-bold text-foreground tracking-tight truncate">{supplier.name}</h1>
      </div>
      <div className="lg:hidden flex items-center gap-2 mb-6">
        <Badge variant="outline" className={`text-[10px] ${supplier.active ? 'status-sold bg-status-sold' : 'text-muted-foreground'}`}>{supplier.active ? 'Active' : 'Inactive'}</Badge>
        {supplier.portal_enabled && <Badge variant="outline" className="text-[10px] status-qualified bg-status-qualified">Portal On</Badge>}
      </div>

      <button onClick={() => navigate('/campaigns?tab=suppliers')} className="hidden lg:flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Suppliers
      </button>

      <div className="hidden lg:flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">{supplier.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={`text-[10px] ${supplier.active ? 'status-sold bg-status-sold' : 'text-muted-foreground'}`}>{supplier.active ? 'Active' : 'Inactive'}</Badge>
            {supplier.portal_enabled && <Badge variant="outline" className="text-[10px] status-qualified bg-status-qualified">Portal On</Badge>}
          </div>
        </div>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Leads', value: m.total },
          { label: 'Accepted', value: m.accepted },
          { label: 'Accepted %', value: pct(m.acceptedPct) },
          { label: 'DQ', value: m.dq },
          { label: 'Revenue', value: money(m.revenue) },
          { label: 'Profit', value: money(m.profit) },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-[10px] p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
            <div className="text-[18px] font-bold text-foreground mt-1 font-mono">{s.value}</div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="adspend">Ad Spend</TabsTrigger>
          <TabsTrigger value="specs">Posting Specs</TabsTrigger>
          <TabsTrigger value="portal">Portal</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Source Profile</div>
            <Row label="Name" value={supplier.name} />
            <Row label="Email" value={supplier.email} />
            <Row label="Phone" value={supplier.phone} />
            <div className="flex items-center justify-between py-2.5 border-b border-border">
              <span className="text-[12px] text-muted-foreground">Brand</span>
              <Select value={supplier.brand || '__none__'} onValueChange={updateBrand}>
                <SelectTrigger className="h-8 w-[220px] text-[13px]">
                  <SelectValue placeholder="No brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No brand</SelectItem>
                  {brands.map(b => (
                    <SelectItem key={b.id} value={b.brand_name}>{b.brand_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-border">
              <span className="text-[12px] text-muted-foreground">API Key</span>
              {key ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-foreground">{showKey ? key.key : `${key.key_prefix}...`}</span>
                  <button onClick={() => setShowKey(v => !v)} className="text-muted-foreground hover:text-foreground">{showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                  <button onClick={() => { navigator.clipboard.writeText(key.key); toast.success('Key copied'); }} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                </div>
              ) : <span className="text-[12px] text-muted-foreground">No key</span>}
            </div>
          </div>

          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Assigned Campaigns</div>
            {assignedCampaigns.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No campaigns assigned yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignedCampaigns.map(c => <Badge key={c.id} variant="outline" className="text-[11px]">{c.name}</Badge>)}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sources" className="mt-4">
          <div className="bg-card border border-border rounded-[10px] p-5">
            <SupplierSourcesTab supplier={supplier} />
          </div>
        </TabsContent>

        <TabsContent value="adspend" className="mt-4">
          <SupplierMetaCosts supplier={supplier} />
        </TabsContent>

        <TabsContent value="specs" className="mt-4">
          <PostingSpecs
            supplier={supplier}
            apiKey={key}
            customFields={customFields}
            campaigns={campaigns}
            verticals={verticals}
            buyers={buyers}
            baseUrl={baseUrl}
          />
        </TabsContent>

        <TabsContent value="portal" className="mt-4">
          <div className="bg-card border border-border rounded-[10px] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold text-foreground">Source Portal</div>
                <p className="text-[12px] text-muted-foreground mt-1 max-w-md">When enabled, this supplier can log in to reconcile leads sent vs received.</p>
              </div>
              <Switch checked={!!supplier.portal_enabled} onCheckedChange={togglePortal} />
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!supplier.portal_enabled} onClick={() => navigate(`/supplier-portal?supplier_id=${supplier.id}`)}>
                <ExternalLink className="w-3.5 h-3.5" /> Preview Portal
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <div className="bg-card border border-border rounded-[10px] overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Lead ID', 'Name', 'Status', 'Revenue', 'Created'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {supplierLeads.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No leads from this supplier yet</td></tr>
                )}
                {supplierLeads.slice(0, 50).map(l => (
                  <tr key={l.id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-[12px]">{l.lead_id || '-'}</td>
                    <td className="px-4 py-3 text-foreground">{[l.first_name, l.last_name].filter(Boolean).join(' ') || '-'}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{l.final_status || '-'}</Badge></td>
                    <td className="px-4 py-3 font-mono text-[12px]">{money(l.revenue)}</td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground font-mono">{l.created_date ? new Date(l.created_date).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}