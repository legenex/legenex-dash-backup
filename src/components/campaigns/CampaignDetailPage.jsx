import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Save, Plug, FlaskConical } from 'lucide-react';
import CampaignRoutingTab from '@/components/campaigns/CampaignRoutingTab';
import CampaignStatsStrip from '@/components/campaigns/CampaignStatsStrip';
import CampaignBuyers from '@/components/campaigns/CampaignBuyers';
import CampaignSuppliers from '@/components/campaigns/CampaignSuppliers';
import CampaignBrands from '@/components/campaigns/CampaignBrands';
import CampaignOverviewTab from '@/components/campaigns/CampaignOverviewTab';
import CampaignSettingsTab from '@/components/campaigns/CampaignSettingsTab';

function parseIds(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
}

// Full-page campaign detail. Header (back, name + vertical, status pill,
// Save/API/Test), stats strip + charts, then OVERVIEW / BUYERS / ROUTING /
// SUPPLIERS / BRANDS / SETTINGS tabs.
//
// BUYERS and ROUTING are deliberately separate. Buyers is the roster: who the
// buyers are and what deliveries each one owns. Routing is the arrangement:
// which method the campaign uses and how each delivery is grouped and ordered.
// One delivery can therefore sit in a different group from its sibling.
//
// The Routing tab (CampaignRoutingTab) owns the routing method selector,
// groups, and the member picker. All writes hit existing
// RouteMember/Campaign/RouteGroup fields, no engine or billing changes.
export default function CampaignDetailPage({ campaign, onBack }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [savingHeader, setSavingHeader] = useState(false);

  const { data: groups = [] } = useQuery({ queryKey: ['routeGroups'], queryFn: () => fetchAll((limit, skip) => base44.entities.RouteGroup.list('-created_date', limit, skip)) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list('-created_date', 500) });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('sort_order', 200) });
  const { data: leads = [] } = useQuery({ queryKey: ['leads-metrics'], queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.filter({ archived: false }, '-created_date', limit, skip)) });

  const verticalLabel = useMemo(() => {
    const code = String(campaign.vertical || '').toLowerCase();
    const v = verticals.find((x) => String(x.code || '').toLowerCase() === code);
    return v?.name || campaign.vertical || '--';
  }, [verticals, campaign.vertical]);

  const campaignGroups = useMemo(
    () => groups.filter((g) => String(g.campaign_id) === String(campaign.id)).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [groups, campaign.id],
  );
  const defaultGroup = campaignGroups[0] || null;

  const { data: allMembers = [] } = useQuery({ queryKey: ['routeMembers'], queryFn: () => fetchAll((limit, skip) => base44.entities.RouteMember.list('-created_date', limit, skip)) });

  const buyerName = useMemo(() => Object.fromEntries(buyers.map((b) => [b.id, b.company_name || b.name || b.id])), [buyers]);
  const supplierCount = useMemo(() => parseIds(campaign.supplier_ids).length, [campaign.supplier_ids]);

  // Count of routing members across this campaign's groups (for the tab badge).
  const campaignGroupIds = useMemo(() => new Set(campaignGroups.map((g) => g.id)), [campaignGroups]);
  const campaignMembers = useMemo(() => allMembers.filter((m) => campaignGroupIds.has(m.route_group_id)), [allMembers, campaignGroupIds]);
  const memberCount = campaignMembers.length;

  const active = campaign.active !== false;
  const method = campaign.send_mode || 'direct_post';

  async function saveHeader() {
    setSavingHeader(true);
    try {
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign saved');
    } finally { setSavingHeader(false); }
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'buyers', label: 'Buyers' },
    { key: 'routing', label: 'Routing', count: memberCount },
    { key: 'suppliers', label: 'Suppliers' },
    { key: 'brands', label: 'Brands' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="Back to campaigns"><ArrowLeft className="w-5 h-5" /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium truncate">{campaign.name || campaign.id}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium shrink-0 ${active ? 'status-sold' : 'text-muted-foreground'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[hsl(var(--chart-5))]' : 'bg-muted-foreground'}`} />
                {active ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{verticalLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => toast.info('API details are managed per buyer')}><Plug className="w-4 h-4" />API</Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => toast.info('Use the Payload Tester to test this campaign')}><FlaskConical className="w-4 h-4" />Test</Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={saveHeader} disabled={savingHeader}>
            {savingHeader ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
          </Button>
        </div>
      </div>

      {/* Stats strip + charts */}
      <CampaignStatsStrip campaign={campaign} leads={leads} />

      {/* Tabs */}
      <div>
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {t.count != null && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {tab === 'overview' && (
            <CampaignOverviewTab campaign={campaign} leads={leads} members={campaignMembers} buyerName={buyerName} supplierCount={supplierCount} />
          )}
          {tab === 'buyers' && <CampaignBuyers />}
          {tab === 'routing' && <CampaignRoutingTab campaign={campaign} method={method} />}
          {tab === 'suppliers' && <CampaignSuppliers />}
          {tab === 'brands' && <CampaignBrands />}
          {tab === 'settings' && <CampaignSettingsTab campaign={campaign} defaultGroup={defaultGroup} />}
        </div>
      </div>

    </div>
  );
}