import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { metaAccountCampaigns } from '@/functions/metaAccountCampaigns';
import { metaCampaignMappings } from '@/functions/metaCampaignMappings';
import { mapMetaCampaigns } from '@/functions/mapMetaCampaigns';
import { manageSupplierAdAccount } from '@/functions/manageSupplierAdAccount';
import { syncMetaSpend } from '@/functions/syncMetaSpend';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Map to Campaign: map Meta campaigns in one ad account to a Legenex Campaign
// (which carries the vertical and brand) and a Source (Supplier, cost
// attribution). Mirrors the LeadDistro "Map to Campaign" flow. Writes campaign
// level AdSpendMapping rows via mapMetaCampaigns; the chosen Campaign supplies
// vertical and brand, the Source supplies supplier attribution. The "map all
// future" option sets the account default source so every campaign, including
// ones created later, attributes to that source.
export default function MetaMapCampaignsDialog({ open, onOpenChange, account, onSaved }) {
  const qc = useQueryClient();
  const [campaignId, setCampaignId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [mapFuture, setMapFuture] = useState(false);
  const [saving, setSaving] = useState(false);

  const acctId = account?.ad_account_id;
  const connId = account?.connection_id;
  const registryId = account?.registry_id;

  const { data: legenexCampaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list(), enabled: open });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list(), enabled: open });

  const selCampaign = legenexCampaigns.find(c => c.id === campaignId) || null;
  const vertical = selCampaign?.vertical || '';
  const brand = selCampaign?.brand || '';

  const { data: campData, isLoading: loadingCamps, error: campError } = useQuery({
    queryKey: ['meta-account-campaigns', acctId],
    queryFn: async () => (await metaAccountCampaigns({ ad_account_id: acctId, connection_id: connId })).data,
    enabled: open && !!acctId && !!connId,
  });
  const campaigns = campData?.campaigns || [];

  const { data: mapData, refetch: refetchMaps } = useQuery({
    queryKey: ['meta-account-mappings', acctId],
    queryFn: async () => (await metaCampaignMappings({ action: 'list', ad_account_id: acctId })).data,
    enabled: open && !!acctId,
  });
  const existing = mapData?.mappings || [];
  const mappedIds = useMemo(() => new Set(existing.map(m => m.meta_campaign_id)), [existing]);

  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!open) { prefilledRef.current = false; return; }
    setSelected(new Set()); setSearch(''); setFilter('all'); setMapFuture(false);
    setCampaignId(''); setSupplierId(''); prefilledRef.current = false;
  }, [open, acctId]);
  // Prefill Campaign + Source from the account's existing mapping so reopening
  // shows the current attribution instead of blank fields.
  useEffect(() => {
    if (!open || prefilledRef.current) return;
    if (!existing.length && !legenexCampaigns.length) return;
    if (!existing.length) { prefilledRef.current = true; return; }
    const m = existing.find((x) => x.supplier_id) || existing[0];
    if (m?.supplier_id) setSupplierId(m.supplier_id);
    const c = legenexCampaigns.find((lc) => (m.vertical ? lc.vertical === m.vertical : true) && (m.brand ? lc.brand === m.brand : true));
    if (c) setCampaignId(c.id);
    prefilledRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, legenexCampaigns]);

  const visible = campaigns.filter(c =>
    (filter === 'all' || c.status === filter) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase())),
  );

  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllVisible = () => setSelected(prev => {
    const n = new Set(prev);
    const allOn = visible.length > 0 && visible.every(c => n.has(c.id));
    visible.forEach(c => allOn ? n.delete(c.id) : n.add(c.id));
    return n;
  });

  const canApply = !!campaignId && !!supplierId && (selected.size > 0 || mapFuture);

  const apply = async () => {
    if (!campaignId) { toast.error('Choose a campaign'); return; }
    if (!supplierId) { toast.error('Choose a source'); return; }
    if (selected.size === 0 && !mapFuture) { toast.error('Select at least one campaign, or turn on map all future'); return; }
    setSaving(true);
    try {
      if (selected.size > 0) {
        const chosen = campaigns.filter(c => selected.has(c.id)).map(c => ({ id: c.id, name: c.name }));
        const d = (await mapMetaCampaigns({
          ad_account_id: acctId, connection_id: connId,
          ad_account_name: account.ad_account_name, currency: account.currency,
          business_id: account.business_id, business_name: account.business_name, timezone_name: account.timezone_name,
          supplier_id: supplierId, vertical, brand, campaigns: chosen,
        })).data || {};
        if (d.error) { toast.error(d.error); setSaving(false); return; }
        toast.success(`Mapped ${d.mapped_total} campaign${d.mapped_total === 1 ? '' : 's'}. Syncing spend.`);
      }
      if (mapFuture && registryId) {
        await manageSupplierAdAccount({ id: registryId, action: 'reassign', supplier_id: supplierId }).catch(() => {});
        toast.success('All current and future campaigns in this account will attribute to this source.');
      }
      syncMetaSpend({ ad_account_ids: [acctId], trigger: 'manual' }).catch(() => {});
      setSelected(new Set());
      refetchMaps();
      qc.invalidateQueries({ queryKey: ['meta-ad-accounts'] });
      qc.invalidateQueries({ queryKey: ['meta-adaccounts-overview'] });
      qc.invalidateQueries({ queryKey: ['adspend'] });
      onSaved?.();
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to map campaigns'); }
    setSaving(false);
  };

  const removeMapping = async (id) => {
    try {
      await metaCampaignMappings({ action: 'delete', id });
      refetchMaps();
      qc.invalidateQueries({ queryKey: ['meta-ad-accounts'] });
      qc.invalidateQueries({ queryKey: ['meta-adaccounts-overview'] });
      onSaved?.();
    } catch { toast.error('Failed to remove'); }
  };

  const supplierName = (id) => suppliers.find(s => s.id === id)?.name || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[720px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map to Campaign</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground -mt-2">
          Map Meta ad campaigns from <span className="text-foreground font-medium">{account?.ad_account_name}</span> to a campaign and source for automatic spend syncing.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select a campaign" /></SelectTrigger>
              <SelectContent>
                {legenexCampaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">{c.name}{c.vertical ? <span className="text-muted-foreground">({c.vertical})</span> : null}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Source (cost attribution)</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select a source" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-start gap-2 rounded-md border border-border bg-card p-2.5 cursor-pointer">
          <Checkbox checked={mapFuture} onCheckedChange={(v) => setMapFuture(!!v)} className="mt-0.5" />
          <span className="text-[12px] text-foreground">
            Map all current and future campaigns in this account to this source
            <span className="block text-[11px] text-muted-foreground">New campaigns added later attribute to this source automatically. Per campaign mappings above still take priority.</span>
          </span>
        </label>

        <div className="mt-1">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <Label className="text-[12px] font-semibold">Meta Campaigns</Label>
            <div className="flex items-center gap-1.5">
              {['all', 'active', 'paused'].map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`text-[11px] px-2 py-0.5 rounded capitalize ${filter === f ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground'}`}>
                  {f}{f !== 'all' && campData?.counts ? ` ${campData.counts[f]}` : ''}
                </button>
              ))}
              <button onClick={selectAllVisible} className="text-[11px] text-primary font-medium ml-1">Select all</button>
            </div>
          </div>
          <div className="relative mb-1.5">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns" className="pl-7 h-8 bg-background text-[12px]" />
          </div>
          <div className="max-h-[30vh] overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {campError ? (
              <p className="text-[12px] status-error p-3">{campData?.error || 'Could not load campaigns. Check the connection permissions.'}</p>
            ) : loadingCamps ? (
              <p className="text-[12px] text-muted-foreground p-3 inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading campaigns\u2026</p>
            ) : visible.length === 0 ? (
              <p className="text-[12px] text-muted-foreground p-3">No campaigns match.</p>
            ) : visible.map(c => (
              <label key={c.id} className="flex items-center gap-2.5 p-2.5 hover:bg-background/60 cursor-pointer">
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <span className="text-[13px] text-foreground flex-1 truncate">{c.name}</span>
                {mappedIds.has(c.id) && <Badge variant="outline" className="text-[9px]">mapped</Badge>}
                <Badge variant="outline" className={`text-[9px] uppercase ${c.status === 'active' ? 'status-sold' : 'text-muted-foreground'}`}>{c.status}</Badge>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          <Button onClick={apply} disabled={saving || !canApply}>
            {saving ? 'Applying\u2026' : selected.size > 0 ? `Create ${selected.size} Mapping${selected.size === 1 ? '' : 's'}` : 'Set account source'}
          </Button>
        </div>

        {existing.length > 0 && (
          <div className="mt-1 pt-3 border-t border-border">
            <Label className="text-[12px] font-semibold">Existing mappings ({existing.length})</Label>
            <div className="mt-1.5 space-y-1.5 max-h-[18vh] overflow-y-auto">
              {existing.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border bg-background">
                  <div className="min-w-0">
                    <div className="text-[12px] text-foreground truncate">{m.meta_campaign_name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className="text-[9px]">Campaign</Badge>
                      <span className="text-[11px] text-muted-foreground truncate">{m.supplier_name || supplierName(m.supplier_id)}{m.vertical ? ` \u00b7 ${m.vertical}` : ''}{m.brand ? ` \u00b7 ${m.brand}` : ''}</span>
                    </div>
                  </div>
                  <button onClick={() => removeMapping(m.id)} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
