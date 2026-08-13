import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Plus, Loader2, GripVertical, Trash2, Pencil, ExternalLink, Route as RouteIcon, GitBranch, Rocket, Save,
} from 'lucide-react';
import RouteMemberEditor from '@/components/distribution/RouteMemberEditor';
import RouteGroupPublishDialog from '@/components/distribution/RouteGroupPublishDialog';
import { METHODS } from '@/components/distribution/RouteGroupEditor';

const money = (p) => (p == null || p === '' || Number.isNaN(Number(p)) ? '--' : `$${Number(p).toFixed(2)}`);

// Campaign detail: vertical + suppliers-in config, selection method, and a single
// ordered member list ACROSS buyers with drag-to-reorder priority. Campaign order
// is edited ONLY here. Members attach to the campaign's default RouteGroup, which
// is auto-created (lifecycle draft) on first configure. Publish reuses the
// existing flow (validate, one simulation, diff confirm, change reason, immutable
// version). Multi-group setups are reached via the Advanced link.
export default function CampaignDetail({ campaign }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: groups = [] } = useQuery({ queryKey: ['routeGroups'], queryFn: () => fetchAll((limit, skip) => base44.entities.RouteGroup.list('-created_date', limit, skip)) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => fetchAll((limit, skip) => base44.entities.Supplier.list('-created_date', limit, skip)) });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('-created_date', 500) });

  const campaignGroups = useMemo(
    () => groups.filter((g) => String(g.campaign_id) === String(campaign.id)).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [groups, campaign.id],
  );
  const defaultGroup = campaignGroups[0] || null;

  // Campaign config (vertical + suppliers-in) edits the Campaign record directly.
  const [vertical, setVertical] = useState(campaign.vertical || '');
  const [supplierIds, setSupplierIds] = useState(Array.isArray(campaign.supplier_ids) ? campaign.supplier_ids : []);
  const [savingCfg, setSavingCfg] = useState(false);
  useEffect(() => {
    setVertical(campaign.vertical || '');
    setSupplierIds(Array.isArray(campaign.supplier_ids) ? campaign.supplier_ids : []);
  }, [campaign.id, campaign.vertical, campaign.supplier_ids]);

  async function saveConfig() {
    setSavingCfg(true);
    try {
      await base44.entities.Campaign.update(campaign.id, { vertical, supplier_ids: supplierIds });
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign updated');
    } catch (e) { toast.error(e.message || 'Save failed'); } finally { setSavingCfg(false); }
  }

  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name || s.company_name || s.id }));
  const verticalOptions = verticals.map((v) => ({ value: v.code || v.name || v.id, label: v.name || v.code || v.id }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="text-base font-medium truncate">{campaign.name || campaign.id}</div>
          <div className="text-xs text-muted-foreground">Campaign routing configuration</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => navigate('/distribution/simulator')} className="gap-1.5"><RouteIcon className="w-4 h-4" />Simulator</Button>
          <Button asChild size="sm" variant="ghost"><Link to="/distribution/routes"><GitBranch className="w-4 h-4 mr-1" />Advanced</Link></Button>
        </div>
      </div>

      {/* Config: vertical + suppliers-in */}
      <div className="rounded-[10px] border border-border bg-card p-5 space-y-4">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign settings</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px] font-medium">Vertical</Label>
            {verticalOptions.length ? (
              <Select value={vertical} onValueChange={setVertical}>
                <SelectTrigger className="mt-1 bg-background h-9"><SelectValue placeholder="Select vertical" /></SelectTrigger>
                <SelectContent>{verticalOptions.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input value={vertical} onChange={(e) => setVertical(e.target.value)} className="mt-1 bg-background h-9" placeholder="vertical code" />
            )}
          </div>
          <div>
            <Label className="text-[12px] font-medium">Suppliers in</Label>
            <div className="mt-1">
              <MultiSelect options={supplierOptions} value={supplierIds} onValueChange={setSupplierIds} placeholder="Assign suppliers" />
            </div>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">Brands are managed on the Campaigns Setup tab. Buyer pricing and lifecycle are edited in Operations.</div>
        <div className="flex justify-end">
          <Button size="sm" onClick={saveConfig} disabled={savingCfg} className="gap-1.5">
            {savingCfg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save settings
          </Button>
        </div>
      </div>

      {/* Ordered member list across buyers */}
      <CampaignMembers campaign={campaign} defaultGroup={defaultGroup} groups={groups} />
    </div>
  );
}

function CampaignMembers({ campaign, defaultGroup, groups }) {
  const qc = useQueryClient();
  const [ensuring, setEnsuring] = useState(false);
  const [group, setGroup] = useState(defaultGroup);
  const [memberOpen, setMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [order, setOrder] = useState([]);

  useEffect(() => { setGroup(defaultGroup); }, [defaultGroup]);

  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list('-created_date', 500) });
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['routeMembers', group?.id],
    queryFn: () => (group ? base44.entities.RouteMember.filter({ route_group_id: group.id }) : []),
    enabled: !!group,
  });
  const buyerName = useMemo(() => Object.fromEntries(buyers.map((b) => [b.id, b.company_name || b.name || b.id])), [buyers]);

  // Local ordering mirrors persisted priority; drag rewrites it.
  useEffect(() => {
    setOrder([...members].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)));
  }, [members]);

  async function ensureDefaultGroup() {
    setEnsuring(true);
    try {
      const res = await base44.functions.invoke('distributionConfig', {
        action: 'create_draft',
        group: { campaign_id: campaign.id, name: 'Default', method: 'priority', order_index: 0 },
      });
      const created = res?.data?.group || res?.data || {};
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
      if (created.id) setGroup(created);
      toast.success('Default route group created (draft)');
    } catch (e) { toast.error('Could not create default group: ' + (e?.message || 'error')); } finally { setEnsuring(false); }
  }

  async function persistOrder(next) {
    // Reassign contiguous priorities (1..n) and persist only the rows that changed.
    const updates = [];
    next.forEach((m, i) => { const pri = i + 1; if ((m.priority ?? null) !== pri) updates.push({ id: m.id, pri }); });
    setOrder(next.map((m, i) => ({ ...m, priority: i + 1 })));
    try {
      for (const u of updates) await base44.entities.RouteMember.update(u.id, { priority: u.pri });
      await qc.invalidateQueries({ queryKey: ['routeMembers', group.id] });
      if (updates.length) toast.success('Priority order updated');
    } catch (e) { toast.error('Reorder failed: ' + (e?.message || 'error')); }
  }

  function onDrop(targetIdx) {
    if (dragIndex == null || dragIndex === targetIdx) { setDragIndex(null); return; }
    const next = [...order];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIdx, 0, moved);
    setDragIndex(null);
    persistOrder(next);
  }

  async function updateMethod(method) {
    try {
      await base44.functions.invoke('distributionConfig', { action: 'update_draft', route_group_id: group.id, group: { method } });
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
      setGroup((g) => ({ ...g, method }));
      toast.success('Selection method updated');
    } catch (e) { toast.error('Update failed: ' + (e?.message || 'error')); }
  }

  async function deleteMember(m) {
    try {
      await base44.entities.RouteMember.delete(m.id);
      await qc.invalidateQueries({ queryKey: ['routeMembers', group.id] });
      toast.success('Member removed');
    } catch (e) { toast.error('Delete failed: ' + (e?.message || 'error')); }
    setDeleteTarget(null);
  }

  if (!group) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-8 text-center">
        <GitBranch className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
        <div className="text-[13px] font-medium">No routing configured for this campaign yet</div>
        <div className="text-[12px] text-muted-foreground mt-1 mb-3">Create the campaign's default route group to start ordering buyers.</div>
        <Button size="sm" onClick={ensureDefaultGroup} disabled={ensuring} className="gap-1.5">
          {ensuring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Configure routing
        </Button>
        {/* Other groups may still exist for advanced multi-group setups. */}
        {groups.some((g) => String(g.campaign_id) === String(campaign.id)) && (
          <div className="text-[11px] text-muted-foreground mt-3">This campaign has additional route groups. Use Advanced to manage them.</div>
        )}
      </div>
    );
  }

  const isDraft = (group.lifecycle || 'draft') === 'draft';

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Routing order ({order.length})</span>
          <div className="flex items-center gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Method</Label>
            <Select value={group.method || 'priority'} onValueChange={updateMethod}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setEditingMember(null); setMemberOpen(true); }} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Add buyer</Button>
          <Button size="sm" variant="outline" onClick={() => setPublishOpen(true)} className="gap-1.5"><Rocket className="w-3.5 h-3.5" />Publish</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-10 text-center text-[13px] text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading members...</div>
      ) : order.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No buyers in this campaign yet. Add one to start routing.</div>
      ) : (
        <div className="divide-y divide-border">
          {order.map((m, i) => (
            <div
              key={m.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className={`flex items-center gap-3 px-4 py-2.5 text-[13px] ${dragIndex === i ? 'opacity-50' : ''} hover:bg-accent/30`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/60 shrink-0 cursor-grab" aria-label="Drag to reorder" />
              <span className="w-6 text-center font-mono tabular-nums text-muted-foreground shrink-0">{i + 1}</span>
              <Link to={`/operations/buyers?buyer=${m.buyer_id}`} className="flex-1 min-w-0 truncate hover:text-primary hover:underline">
                {buyerName[m.buyer_id] || m.buyer_id || '--'}
              </Link>
              <span className="text-muted-foreground capitalize shrink-0 w-16">{m.price_mode || 'fixed'}</span>
              <span className="font-mono tabular-nums shrink-0 w-16 text-right">{money(m.fixed_price)}</span>
              {m.active !== false
                ? <Badge className="bg-status-sold status-sold border-0 text-[10px] shrink-0">Active</Badge>
                : <Badge variant="outline" className="text-[10px] shrink-0">Off</Badge>}
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingMember(m); setMemberOpen(true); }} aria-label="Edit member"><Pencil className="w-3.5 h-3.5" /></Button>
                <Button asChild size="icon" variant="ghost" className="h-7 w-7" aria-label="Open buyer routing">
                  <Link to={`/operations/buyers?buyer=${m.buyer_id}`}><ExternalLink className="w-3.5 h-3.5" /></Link>
                </Button>
                {isDraft && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(m)} aria-label="Remove member"><Trash2 className="w-3.5 h-3.5" /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
        Drag rows to set priority. Each buyer row opens that buyer's Routing tab for pricing, caps, filters, and schedule.
      </div>

      <RouteMemberEditor open={memberOpen} onOpenChange={setMemberOpen} group={group} member={editingMember} />
      <RouteGroupPublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        group={group}
        formValues={{ name: group.name, method: group.method, order_index: group.order_index || 0, price_weight: group.price_weight ?? 0.5, priority_weight: group.priority_weight ?? 0.5, active: group.active !== false }}
        memberCount={order.length}
        onPublished={() => qc.invalidateQueries({ queryKey: ['routeGroups'] })}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this buyer from the campaign?</AlertDialogTitle>
            <AlertDialogDescription>This removes {deleteTarget ? (buyerName[deleteTarget.buyer_id] || 'the buyer') : 'the member'} from the draft group. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleteTarget) deleteMember(deleteTarget); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
