import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import SectionHeader from '@/components/shared/SectionHeader';
import RouteGroupList from '@/components/distribution/RouteGroupList';
import RouteGroupEditor, { METHODS } from '@/components/distribution/RouteGroupEditor';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, GitBranch, Loader2 } from 'lucide-react';

const BLANK_GROUP = { campaign_id: '', name: '', method: 'priority', order_index: 0 };

export default function RouteGroups() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK_GROUP);

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => base44.entities.Campaign.list('-created_date', 500),
  });
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['routeGroups'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.RouteGroup.list('-created_date', limit, skip)),
  });
  const { data: allMembers = [] } = useQuery({
    queryKey: ['routeMembers', 'all'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.RouteMember.list('-created_date', limit, skip)),
  });

  const campaignName = useMemo(() => {
    const map = {};
    for (const c of campaigns) map[c.id] = c.name || c.id;
    return map;
  }, [campaigns]);

  const memberCounts = useMemo(() => {
    const map = {};
    for (const m of allMembers) map[m.route_group_id] = (map[m.route_group_id] || 0) + 1;
    return map;
  }, [allMembers]);

  const selected = useMemo(() => groups.find((g) => g.id === selectedId) || null, [groups, selectedId]);

  // Keep a valid selection as groups load or change.
  useEffect(() => {
    if (!groups.length) { setSelectedId(null); return; }
    if (!groups.some((g) => g.id === selectedId)) setSelectedId(groups[0].id);
  }, [groups, selectedId]);

  const openCreate = () => { setForm(BLANK_GROUP); setCreateOpen(true); };

  const createGroup = async () => {
    if (!form.campaign_id) { toast.error('Select a campaign first'); return; }
    if (!form.name.trim()) { toast.error('Enter a group name'); return; }
    setCreating(true);
    try {
      const res = await base44.functions.invoke('distributionConfig', {
        action: 'create_draft',
        group: {
          campaign_id: form.campaign_id,
          name: form.name.trim(),
          method: form.method,
          order_index: Number(form.order_index) || 0,
        },
      });
      const created = res?.data?.group || res?.data || {};
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
      if (created.id) setSelectedId(created.id);
      toast.success('Draft route group created');
      setCreateOpen(false);
    } catch (e) {
      toast.error('Create failed: ' + (e?.message || 'error'));
    }
    setCreating(false);
  };

  const loading = campaignsLoading || groupsLoading;

  return (
    <div>
      <SectionHeader title="Route Groups" subtitle="Configure how leads route to buyers, then validate, simulate, and publish.">
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> New route group</Button>
      </SectionHeader>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,360px)_1fr] gap-5 items-start pb-8">
        <div>
          <RouteGroupList
            groups={groups}
            campaignName={campaignName}
            memberCounts={memberCounts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
          />
        </div>

        <div>
          {loading ? (
            <div className="rounded-[10px] border border-border bg-card p-10 text-center text-[13px] text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
            </div>
          ) : selected ? (
            <RouteGroupEditor key={selected.id} group={selected} campaignName={campaignName[selected.campaign_id] || 'No campaign'} />
          ) : (
            <div className="rounded-[10px] border border-border bg-card p-12 text-center">
              <GitBranch className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <div className="text-[13px] font-medium text-foreground">Select a route group</div>
              <div className="text-[12px] text-muted-foreground mt-1">Pick a group on the left, or create a new draft to get started.</div>
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader>
            <DialogTitle>New route group</DialogTitle>
            <DialogDescription className="text-[12px]">Creates a draft. Add members, then validate, simulate, and publish.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[12px] font-medium">Campaign</Label>
              <Select value={form.campaign_id} onValueChange={(v) => setForm((f) => ({ ...f, campaign_id: v }))} disabled={campaignsLoading}>
                <SelectTrigger className="mt-1 bg-background" aria-label="Campaign">
                  <SelectValue placeholder={campaignsLoading ? 'Loading campaigns...' : 'Select a campaign'} />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name || c.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-grp-name" className="text-[12px] font-medium">Name</Label>
              <Input id="new-grp-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Priority MVA" className="mt-1 bg-background text-[13px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px] font-medium">Method</Label>
                <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}>
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
              <div>
                <Label htmlFor="new-grp-order" className="text-[12px] font-medium">Order index</Label>
                <Input id="new-grp-order" type="number" value={form.order_index} onChange={(e) => setForm((f) => ({ ...f, order_index: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createGroup} disabled={creating || !form.campaign_id || !form.name.trim()} className="gap-1.5">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
