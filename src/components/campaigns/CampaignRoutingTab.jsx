import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Trash2, CornerDownRight } from 'lucide-react';
import RoutingGroupTable from '@/components/campaigns/RoutingGroupTable';
import MemberPickerDialog from '@/components/campaigns/MemberPickerDialog';
import BuyerConfigModal from '@/components/campaigns/BuyerConfigModal';
import MethodTooltip from '@/components/campaigns/MethodTooltip';
import { CAMPAIGN_METHODS, GROUP_METHODS, deriveCampaignMethod } from '@/components/campaigns/routingMethods';
import { convertLegacyMember, destinationLabel } from '@/lib/campaigns/memberDestination';

// Campaign-level Routing tab. Owns the routing METHOD selector (All / Waterfall
// / Round Robin / Hybrid), group management for Hybrid, and per-group member
// tables. It never touches processLead, the engine bundle, or distribution_mode.
// It only reads/writes existing RouteGroup and RouteMember fields.
export default function CampaignRoutingTab({ campaign, method: sendMode = 'direct_post' }) {
  const qc = useQueryClient();

  const { data: allGroups = [], isLoading: groupsLoading } = useQuery({ queryKey: ['routeGroups'], queryFn: () => fetchAll((limit, skip) => base44.entities.RouteGroup.list('-created_date', limit, skip)) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => fetchAll((limit, skip) => base44.entities.Buyer.list('-created_date', limit, skip)) });
  const { data: allMembers = [], isLoading: membersLoading } = useQuery({ queryKey: ['routeMembers'], queryFn: () => fetchAll((limit, skip) => base44.entities.RouteMember.list('-created_date', limit, skip)) });
  const { data: subs = [] } = useQuery({ queryKey: ['subdeliveries'], queryFn: () => fetchAll((limit, skip) => base44.entities.SubDelivery.list('-created_date', limit, skip)) });

  const groups = useMemo(
    () => allGroups
      .filter((g) => String(g.campaign_id) === String(campaign.id) && g.lifecycle !== 'archived')
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [allGroups, campaign.id],
  );
  const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);
  const membersByGroup = useMemo(() => {
    const map = {};
    allMembers.forEach((m) => { if (groupIds.has(m.route_group_id)) (map[m.route_group_id] ||= []).push(m); });
    return map;
  }, [allMembers, groupIds]);

  const buyerName = useMemo(() => Object.fromEntries(buyers.map((b) => [b.id, b.company_name || b.name || b.id])), [buyers]);
  const subById = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s])), [subs]);

  const derived = useMemo(() => deriveCampaignMethod(groups), [groups]);
  const [busy, setBusy] = useState(false);
  const [pickerGroup, setPickerGroup] = useState(null);
  const [configMember, setConfigMember] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteGroup, setDeleteGroup] = useState(null);

  // Ensure a default group exists for single-method campaigns (Waterfall / RR).
  useEffect(() => {
    if (groupsLoading || busy) return;
    if (groups.length === 0 && campaign.id) {
      setBusy(true);
      base44.entities.RouteGroup.create({ campaign_id: campaign.id, name: 'Group 1', method: 'priority', order_index: 0, lifecycle: 'draft', active: false })
        .then(() => qc.invalidateQueries({ queryKey: ['routeGroups'] }))
        .catch((e) => toast.error('Could not set up routing: ' + (e?.message || 'error')))
        .finally(() => setBusy(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, groupsLoading, campaign.id]);

  async function selectMethod(next) {
    if (next === 'all' || next === derived) return;
    setBusy(true);
    try {
      if (next === 'waterfall' || next === 'round_robin') {
        const engineMethod = next === 'waterfall' ? 'priority' : 'round_robin';
        // Collapse to a single group: keep the first, set its method, archive the rest.
        const [keep, ...rest] = groups;
        if (keep) {
          await base44.entities.RouteGroup.update(keep.id, { method: engineMethod, name: keep.name || 'Group 1', order_index: 0 });
          for (const g of rest) await base44.entities.RouteGroup.update(g.id, { lifecycle: 'archived', active: false });
        } else {
          await base44.entities.RouteGroup.create({ campaign_id: campaign.id, name: 'Group 1', method: engineMethod, order_index: 0, lifecycle: 'draft', active: false });
        }
      } else if (next === 'hybrid') {
        // Hybrid is a STRUCTURAL shape: deriveCampaignMethod only reports hybrid
        // when more than one active group exists. Selecting Hybrid must therefore
        // create the groups that make that shape real. Leaving a single group in
        // place made the selection recompute straight back to Waterfall, so the
        // Hybrid button never stuck.
        for (let i = groups.length; i < 2; i++) {
          await base44.entities.RouteGroup.create({ campaign_id: campaign.id, name: `Group ${i + 1}`, method: 'priority', order_index: i, lifecycle: 'draft', active: false });
        }
      }
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
      toast.success('Routing method updated');
    } catch (e) { toast.error('Could not update method: ' + (e?.message || 'error')); } finally { setBusy(false); }
  }

  async function addGroup() {
    setBusy(true);
    try {
      await base44.entities.RouteGroup.create({ campaign_id: campaign.id, name: `Group ${groups.length + 1}`, method: 'priority', order_index: groups.length, lifecycle: 'draft', active: false });
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
    } catch (e) { toast.error('Could not add group: ' + (e?.message || 'error')); } finally { setBusy(false); }
  }

  async function removeGroup(g) {
    setBusy(true);
    try {
      const gm = membersByGroup[g.id] || [];
      for (const m of gm) await base44.entities.RouteMember.delete(m.id);
      await base44.entities.RouteGroup.update(g.id, { lifecycle: 'archived', active: false });
      // Renumber remaining groups.
      const remaining = groups.filter((x) => x.id !== g.id);
      for (let i = 0; i < remaining.length; i++) {
        if ((remaining[i].order_index || 0) !== i) await base44.entities.RouteGroup.update(remaining[i].id, { order_index: i });
      }
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
      await qc.invalidateQueries({ queryKey: ['routeMembers'] });
      toast.success('Group removed');
    } catch (e) { toast.error('Could not remove group: ' + (e?.message || 'error')); } finally { setBusy(false); setDeleteGroup(null); }
  }

  async function setGroupMethod(g, m) {
    try {
      await base44.entities.RouteGroup.update(g.id, { method: m });
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
    } catch (e) { toast.error('Could not update group method: ' + (e?.message || 'error')); }
  }

  async function renameGroup(g, name) {
    try {
      await base44.entities.RouteGroup.update(g.id, { name });
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
    } catch (e) { toast.error('Rename failed: ' + (e?.message || 'error')); }
  }

  async function persistOrder(groupId, next) {
    const updates = [];
    next.forEach((m, i) => { const pri = i + 1; if ((m.priority ?? null) !== pri) updates.push({ id: m.id, pri }); });
    try {
      for (const u of updates) await base44.entities.RouteMember.update(u.id, { priority: u.pri });
      await qc.invalidateQueries({ queryKey: ['routeMembers'] });
      if (updates.length) toast.success('Order updated');
    } catch (e) { toast.error('Reorder failed: ' + (e?.message || 'error')); }
  }
  const reorderIn = (groupId, list) => (from, to) => {
    const next = [...list].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    persistOrder(groupId, next);
  };
  const moveIn = (groupId, list) => (i, dir) => {
    const to = i + dir; const sorted = [...list].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    if (to < 0 || to >= sorted.length) return;
    reorderIn(groupId, list)(i, to);
  };

  async function toggleMember(m) {
    try { await base44.entities.RouteMember.update(m.id, { active: m.active === false }); await qc.invalidateQueries({ queryKey: ['routeMembers'] }); }
    catch (e) { toast.error('Update failed: ' + (e?.message || 'error')); }
  }
  async function setWeight(m, v) {
    const w = Math.max(1, Number(v) || 1);
    try { await base44.entities.RouteMember.update(m.id, { weight: w }); await qc.invalidateQueries({ queryKey: ['routeMembers'] }); }
    catch (e) { toast.error('Weight update failed: ' + (e?.message || 'error')); }
  }
  async function removeMember(m) {
    try { await base44.entities.RouteMember.delete(m.id); await qc.invalidateQueries({ queryKey: ['routeMembers'] }); toast.success('Delivery removed'); }
    catch (e) { toast.error('Delete failed: ' + (e?.message || 'error')); }
    setDeleteTarget(null);
  }
  async function convert(m) {
    try { await convertLegacyMember(m, buyerName[m.buyer_id]); await qc.invalidateQueries({ queryKey: ['routeMembers'] }); await qc.invalidateQueries({ queryKey: ['deliveries'] }); await qc.invalidateQueries({ queryKey: ['subdeliveries'] }); toast.success('Converted to a reusable delivery'); }
    catch (e) { toast.error('Convert failed: ' + (e?.message || 'error')); }
  }

  if (groupsLoading || membersLoading || (busy && groups.length === 0)) {
    return <div className="px-4 py-10 text-center text-[13px] text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading routing...</div>;
  }

  const isHybrid = derived === 'hybrid';

  return (
    <div className="space-y-5">
      {/* Method selector */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Routing method</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">How this campaign distributes leads across its deliveries.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CAMPAIGN_METHODS.map((opt) => {
              const activeOpt = derived === opt.value;
              return (
                <div key={opt.value} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={opt.disabled || busy}
                    onClick={() => selectMethod(opt.value)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                      activeOpt ? 'border-primary bg-primary/10 text-primary'
                        : opt.disabled ? 'border-border bg-card text-muted-foreground cursor-not-allowed opacity-70'
                        : 'border-border bg-card text-foreground hover:bg-accent'
                    }`}
                  >
                    {opt.label}
                    {opt.disabled && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Coming soon</span>}
                  </button>
                  <MethodTooltip text={opt.tooltip} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Groups */}
      {groups.map((g, gi) => {
        const gm = membersByGroup[g.id] || [];
        const showWeight = g.method === 'round_robin' || g.method === 'weighted';
        return (
          <div key={g.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {isHybrid ? (
                  <Input
                    defaultValue={g.name || `Group ${gi + 1}`}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) renameGroup(g, v); }}
                    className="h-8 w-48 bg-background font-medium"
                  />
                ) : (
                  <span className="text-[13px] font-semibold text-foreground">Deliveries</span>
                )}
                {isHybrid && (
                  <div className="flex items-center gap-1">
                    <Select value={g.method === 'priority' || g.method === 'weighted' || g.method === 'round_robin' ? g.method : 'priority'} onValueChange={(v) => setGroupMethod(g, v)}>
                      <SelectTrigger className="h-8 w-36 bg-background text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{GROUP_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <MethodTooltip text={(GROUP_METHODS.find((m) => m.value === g.method) || GROUP_METHODS[0]).tooltip} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPickerGroup(g)}><Plus className="w-4 h-4" />Add delivery</Button>
                {isHybrid && groups.length > 1 && (
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => setDeleteGroup(g)}><Trash2 className="w-4 h-4" />Delete group</Button>
                )}
              </div>
            </div>

            <RoutingGroupTable
              members={gm}
              buyerName={buyerName}
              subById={subById}
              method={g.method}
              showWeight={showWeight}
              onReorder={reorderIn(g.id, gm)}
              onMove={moveIn(g.id, gm)}
              onEdit={(m) => setConfigMember(m)}
              onToggle={toggleMember}
              onRemove={(m) => setDeleteTarget(m)}
              onWeight={setWeight}
              onConvert={convert}
            />

            {/* Fall-through banner between hybrid groups */}
            {isHybrid && gi < groups.length - 1 && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">
                <CornerDownRight className="w-4 h-4 shrink-0" />
                If a lead remains unsold from group {gi + 1} after each delivery has fired, it falls through to group {gi + 2}.
              </div>
            )}
          </div>
        );
      })}

      {isHybrid && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={addGroup} disabled={busy}><Plus className="w-4 h-4" />Add group</Button>
      )}

      <MemberPickerDialog
        open={!!pickerGroup}
        onOpenChange={(v) => { if (!v) setPickerGroup(null); }}
        group={pickerGroup}
        existingMemberCount={pickerGroup ? (membersByGroup[pickerGroup.id] || []).length : 0}
        buyers={buyers}
      />

      <BuyerConfigModal
        open={!!configMember}
        onOpenChange={(v) => { if (!v) setConfigMember(null); }}
        member={configMember}
        buyerName={configMember ? destinationLabel(configMember, subById) : ''}
        method={sendMode}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this delivery from routing?</AlertDialogTitle>
            <AlertDialogDescription>This removes the delivery from this campaign&apos;s routing. The buyer and its delivery configuration are not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleteTarget) removeMember(deleteTarget); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteGroup} onOpenChange={(o) => !o && setDeleteGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this group?</AlertDialogTitle>
            <AlertDialogDescription>This removes the group and its deliveries from this campaign&apos;s routing. Buyers and their deliveries are not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleteGroup) removeGroup(deleteGroup); }}>Delete group</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}