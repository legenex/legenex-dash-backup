import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Pencil, Trash2, Save, PauseCircle, Archive, Rocket, Loader2, Users,
} from 'lucide-react';
import RouteMemberEditor from '@/components/distribution/RouteMemberEditor';
import RouteGroupPublishDialog from '@/components/distribution/RouteGroupPublishDialog';

export const METHODS = [
  { value: 'priority', label: 'Priority' },
  { value: 'weighted', label: 'Weighted' },
  { value: 'round_robin', label: 'Round robin' },
  { value: 'auction', label: 'Auction' },
  { value: 'hybrid', label: 'Hybrid' },
];

const LIFECYCLE_BADGE = {
  draft: 'bg-status-queued status-queued',
  active: 'bg-status-sold status-sold',
  paused: 'bg-status-unsold status-unsold',
  archived: 'bg-muted text-muted-foreground',
};

export function LifecycleBadge({ lifecycle }) {
  const cls = LIFECYCLE_BADGE[lifecycle] || 'bg-muted text-muted-foreground';
  return <Badge className={`${cls} border-0 text-[10px] capitalize`}>{lifecycle || 'draft'}</Badge>;
}

function fromGroup(g) {
  return {
    name: g.name || '',
    method: g.method || 'priority',
    order_index: g.order_index ?? 0,
    price_weight: g.price_weight ?? 0.5,
    priority_weight: g.priority_weight ?? 0.5,
    active: g.active !== false,
  };
}

const money = (p) => (p == null || p === '' || Number.isNaN(Number(p)) ? '--' : `$${Number(p).toFixed(2)}`);

// Editor for a single RouteGroup: settings + lifecycle actions + member list +
// the publish flow. Group field edits and lifecycle actions go through the
// distributionConfig backend function; member edits go through the entity.
export default function RouteGroupEditor({ group, campaignName }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => fromGroup(group));
  const [busy, setBusy] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { setForm(fromGroup(group)); }, [group]);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['routeMembers', group.id],
    queryFn: () => base44.entities.RouteMember.filter({ route_group_id: group.id }),
  });
  const { data: buyers = [] } = useQuery({
    queryKey: ['buyers'],
    queryFn: () => base44.entities.Buyer.list('-created_date', 500),
  });
  const buyerName = useMemo(() => {
    const map = {};
    for (const b of buyers) map[b.id] = b.company_name || b.id;
    return map;
  }, [buyers]);

  const isDraft = (group.lifecycle || 'draft') === 'draft';
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const invokeConfig = async (action, extra = {}) => {
    const res = await base44.functions.invoke('distributionConfig', {
      action,
      route_group_id: group.id,
      ...extra,
    });
    return res?.data || {};
  };

  const saveGroup = async () => {
    setBusy('save');
    try {
      await invokeConfig('update_draft', {
        group: {
          name: form.name,
          method: form.method,
          order_index: Number(form.order_index) || 0,
          price_weight: Number(form.price_weight) || 0,
          priority_weight: Number(form.priority_weight) || 0,
          active: !!form.active,
        },
      });
      qc.invalidateQueries({ queryKey: ['routeGroups'] });
      toast.success('Draft saved');
    } catch (e) {
      toast.error('Save failed: ' + (e?.message || 'error'));
    }
    setBusy('');
  };

  const pauseGroup = async () => {
    setBusy('pause');
    try {
      await invokeConfig('pause');
      qc.invalidateQueries({ queryKey: ['routeGroups'] });
      toast.success('Route group paused');
    } catch (e) {
      toast.error('Pause failed: ' + (e?.message || 'error'));
    }
    setBusy('');
  };

  const archiveGroup = async () => {
    setBusy('archive');
    try {
      await invokeConfig('archive');
      qc.invalidateQueries({ queryKey: ['routeGroups'] });
      toast.success('Route group archived');
    } catch (e) {
      toast.error('Archive failed: ' + (e?.message || 'error'));
    }
    setBusy('');
    setArchiveOpen(false);
  };

  const deleteMember = async (m) => {
    try {
      await base44.entities.RouteMember.delete(m.id);
      qc.invalidateQueries({ queryKey: ['routeMembers'] });
      toast.success('Member removed');
    } catch (e) {
      toast.error('Delete failed: ' + (e?.message || 'error'));
    }
    setDeleteTarget(null);
  };

  const openAddMember = () => { setEditingMember(null); setMemberOpen(true); };
  const openEditMember = (m) => { setEditingMember(m); setMemberOpen(true); };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-foreground truncate">{group.name || 'Untitled group'}</h2>
            <LifecycleBadge lifecycle={group.lifecycle} />
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {campaignName}
            {group.published_at ? ` · Published ${new Date(group.published_at).toLocaleString()}` : ' · Never published'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {group.lifecycle === 'active' && (
            <Button size="sm" variant="outline" onClick={pauseGroup} disabled={busy === 'pause'} className="gap-1.5">
              {busy === 'pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PauseCircle className="w-3.5 h-3.5" />}
              Pause
            </Button>
          )}
          {group.lifecycle !== 'archived' && (
            <Button size="sm" variant="outline" onClick={() => setArchiveOpen(true)} disabled={busy === 'archive'} className="gap-1.5">
              <Archive className="w-3.5 h-3.5" /> Archive
            </Button>
          )}
          <Button size="sm" onClick={() => setPublishOpen(true)} className="gap-1.5">
            <Rocket className="w-3.5 h-3.5" /> Publish
          </Button>
        </div>
      </div>

      {/* Settings */}
      <div className="rounded-[10px] border border-border bg-card p-5 space-y-4">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Group settings</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label htmlFor="grp-name" className="text-[12px] font-medium">Name</Label>
            <Input id="grp-name" value={form.name} onChange={(e) => set({ name: e.target.value })} className="mt-1 bg-background text-[13px]" />
          </div>
          <div>
            <Label htmlFor="grp-order" className="text-[12px] font-medium">Order index</Label>
            <Input id="grp-order" type="number" value={form.order_index} onChange={(e) => set({ order_index: e.target.value })} className="mt-1 bg-background font-mono text-[12px]" />
          </div>
          <div>
            <Label className="text-[12px] font-medium">Method</Label>
            <Select value={form.method} onValueChange={(v) => set({ method: v })}>
              <SelectTrigger className="mt-1 bg-background" aria-label="Method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch id="grp-active" checked={form.active} onCheckedChange={(v) => set({ active: v })} />
            <Label htmlFor="grp-active" className="text-[13px]">Active</Label>
          </div>
        </div>

        {form.method === 'hybrid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-background/40 p-3">
            <div>
              <Label htmlFor="grp-price-w" className="text-[12px] font-medium">Price weight</Label>
              <Input id="grp-price-w" type="number" step="0.1" min="0" value={form.price_weight} onChange={(e) => set({ price_weight: e.target.value })} className="mt-1 bg-background font-mono text-[12px]" />
            </div>
            <div>
              <Label htmlFor="grp-priority-w" className="text-[12px] font-medium">Priority weight</Label>
              <Input id="grp-priority-w" type="number" step="0.1" min="0" value={form.priority_weight} onChange={(e) => set({ priority_weight: e.target.value })} className="mt-1 bg-background font-mono text-[12px]" />
            </div>
            <p className="sm:col-span-2 text-[11px] text-muted-foreground">Hybrid blends price and priority. Weights apply only to the hybrid method.</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={saveGroup} disabled={busy === 'save'} className="gap-1.5">
            {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save draft
          </Button>
        </div>
      </div>

      {/* Members */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Members ({members.length})</span>
          </div>
          <Button size="sm" onClick={openAddMember} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add member</Button>
        </div>

        {membersLoading ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading members...
          </div>
        ) : members.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Users className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
            <div className="text-[13px] font-medium text-foreground">No members yet</div>
            <div className="text-[12px] text-muted-foreground mt-1">Add a buyer delivery to start routing leads through this group.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Buyer</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price mode</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Priority</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Weight</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-2.5 text-[13px] text-foreground">{buyerName[m.buyer_id] || m.buyer_id || '--'}</td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground capitalize">{m.price_mode || 'fixed'}</td>
                    <td className="px-4 py-2.5 text-[13px] text-right font-mono tabular-nums text-foreground">{m.priority ?? '--'}</td>
                    <td className="px-4 py-2.5 text-[13px] text-right font-mono tabular-nums text-foreground">{m.weight ?? '--'}</td>
                    <td className="px-4 py-2.5 text-[13px] text-right font-mono tabular-nums text-foreground">{money(m.fixed_price)}</td>
                    <td className="px-4 py-2.5">
                      {m.active !== false
                        ? <Badge className="bg-status-sold status-sold border-0 text-[10px]">Active</Badge>
                        : <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">Off</Badge>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditMember(m)} aria-label="Edit member">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {isDraft && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(m)} aria-label="Delete member">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isDraft && members.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            Members can only be deleted while the group is a draft. Published members are retained for auditability.
          </div>
        )}
      </div>

      {/* Archive confirm */}
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this route group?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              Archiving stops this group from routing new leads. The published configuration is archived, never hard deleted, so it stays available for auditing and rollback. You can create a new draft later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); archiveGroup(); }} disabled={busy === 'archive'}>
              {busy === 'archive' ? 'Archiving...' : 'Archive group'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete member confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              This removes {deleteTarget ? (buyerName[deleteTarget.buyer_id] || 'the buyer') : 'the member'} from the draft group. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleteTarget) deleteMember(deleteTarget); }}>Remove member</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RouteMemberEditor open={memberOpen} onOpenChange={setMemberOpen} group={group} member={editingMember} />

      <RouteGroupPublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        group={group}
        formValues={{ ...form, order_index: Number(form.order_index) || 0 }}
        memberCount={members.length}
        onPublished={() => qc.invalidateQueries({ queryKey: ['routeGroups'] })}
      />
    </div>
  );
}
