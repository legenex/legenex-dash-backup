import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import {
  TypedJsonField, FiltersEditor, CapsEditor, ScheduleEditor,
  cleanFilters, cleanCaps, cleanSchedule,
} from '@/components/distribution/memberFieldEditors';

const PRICE_MODES = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'rule', label: 'Rule based' },
  { value: 'auction', label: 'Auction' },
];

function blankMember() {
  return {
    buyer_id: '',
    destination_id: '',
    active: true,
    priority: 1,
    weight: 1,
    price_mode: 'fixed',
    fixed_price: '',
    reserve_price: '',
    filters: {},
    caps: {},
    schedule: {},
  };
}

function fromMember(m) {
  return {
    buyer_id: m.buyer_id || '',
    destination_id: m.destination_id || '',
    active: m.active !== false,
    priority: m.priority ?? 1,
    weight: m.weight ?? 1,
    price_mode: m.price_mode || 'fixed',
    fixed_price: m.fixed_price ?? '',
    reserve_price: m.reserve_price ?? '',
    filters: m.filters && typeof m.filters === 'object' ? m.filters : {},
    caps: m.caps && typeof m.caps === 'object' ? m.caps : {},
    schedule: m.schedule && typeof m.schedule === 'object' ? m.schedule : {},
  };
}

// Add or edit a single RouteMember. Typed sub-editors are the primary UI; each
// filters/caps/schedule card carries its own Advanced JSON toggle. Writes go
// straight to the RouteMember entity via create/update.
export default function RouteMemberEditor({ open, onOpenChange, group, member }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(blankMember);
  const [saving, setSaving] = useState(false);

  const { data: buyers = [] } = useQuery({
    queryKey: ['buyers'],
    queryFn: () => base44.entities.Buyer.list('-created_date', 500),
  });
  const { data: connectors = [] } = useQuery({
    queryKey: ['leadbyteConnectors'],
    queryFn: () => base44.entities.LeadByteConnector.list(),
  });

  useEffect(() => {
    if (open) setForm(member ? fromMember(member) : blankMember());
  }, [open, member]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const buyerOptions = buyers.map((b) => ({ value: b.id, label: b.company_name || b.id }));
  const destOptions = connectors.map((c) => ({ value: c.id, label: c.name || c.id }));

  const save = async () => {
    if (!form.buyer_id) { toast.error('Select a buyer first'); return; }
    setSaving(true);
    try {
      const payload = {
        route_group_id: group.id,
        buyer_id: form.buyer_id,
        destination_id: form.destination_id || null,
        active: !!form.active,
        priority: Number(form.priority) || 0,
        weight: Number(form.weight) || 0,
        price_mode: form.price_mode,
        fixed_price: form.fixed_price === '' ? null : Number(form.fixed_price),
        reserve_price: form.reserve_price === '' ? null : Number(form.reserve_price),
        filters: cleanFilters(form.filters),
        caps: cleanCaps(form.caps),
        schedule: cleanSchedule(form.schedule),
      };
      if (member?.id) {
        await base44.entities.RouteMember.update(member.id, payload);
        toast.success('Member updated');
      } else {
        await base44.entities.RouteMember.create(payload);
        toast.success('Member added');
      }
      qc.invalidateQueries({ queryKey: ['routeMembers'] });
      onOpenChange(false);
    } catch (e) {
      toast.error('Save failed: ' + (e?.message || 'error'));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[720px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member?.id ? 'Edit member' : 'Add member'}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Route group {group?.name}. Typed editors are primary; use Advanced JSON on any field for raw edits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Delivery */}
          <div className="rounded-[10px] border border-border bg-card p-5 space-y-4">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Buyer and delivery</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px] font-medium">Buyer</Label>
                <SearchableSelect
                  value={form.buyer_id}
                  onValueChange={(v) => set({ buyer_id: v })}
                  options={buyerOptions}
                  placeholder="Select a buyer"
                  className="mt-1 bg-background"
                />
              </div>
              <div>
                <Label className="text-[12px] font-medium">Delivery</Label>
                <SearchableSelect
                  value={form.destination_id}
                  onValueChange={(v) => set({ destination_id: v })}
                  options={[{ value: '', label: 'None' }, ...destOptions]}
                  placeholder="Select a delivery"
                  className="mt-1 bg-background"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
              <div>
                <Label htmlFor="mem-priority" className="text-[12px] font-medium">Priority</Label>
                <Input
                  id="mem-priority"
                  type="number"
                  value={form.priority}
                  onChange={(e) => set({ priority: e.target.value })}
                  className="mt-1 bg-background font-mono text-[12px]"
                />
              </div>
              <div>
                <Label htmlFor="mem-weight" className="text-[12px] font-medium">Weight</Label>
                <Input
                  id="mem-weight"
                  type="number"
                  value={form.weight}
                  onChange={(e) => set({ weight: e.target.value })}
                  className="mt-1 bg-background font-mono text-[12px]"
                />
              </div>
              <div className="flex items-center gap-2 pb-1.5">
                <Switch id="mem-active" checked={form.active} onCheckedChange={(v) => set({ active: v })} />
                <Label htmlFor="mem-active" className="text-[13px]">Active</Label>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-[10px] border border-border bg-card p-5 space-y-4">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Pricing</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-[12px] font-medium">Price mode</Label>
                <Select value={form.price_mode} onValueChange={(v) => set({ price_mode: v })}>
                  <SelectTrigger className="mt-1 bg-background" aria-label="Price mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICE_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="mem-fixed" className="text-[12px] font-medium">Fixed price ($)</Label>
                <Input
                  id="mem-fixed"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.fixed_price}
                  onChange={(e) => set({ fixed_price: e.target.value })}
                  disabled={form.price_mode !== 'fixed'}
                  placeholder="0.00"
                  className="mt-1 bg-background font-mono text-[12px]"
                />
              </div>
              <div>
                <Label htmlFor="mem-reserve" className="text-[12px] font-medium">Reserve price ($)</Label>
                <Input
                  id="mem-reserve"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.reserve_price}
                  onChange={(e) => set({ reserve_price: e.target.value })}
                  placeholder="0.00"
                  className="mt-1 bg-background font-mono text-[12px]"
                />
              </div>
            </div>
          </div>

          {/* Filters */}
          <TypedJsonField
            id="member-filters"
            title="Filters"
            description="Lead attributes this member accepts. Leave a field empty to allow all."
            value={form.filters}
            onChange={(v) => set({ filters: v })}
          >
            <FiltersEditor value={form.filters} onChange={(v) => set({ filters: v })} />
          </TypedJsonField>

          {/* Caps */}
          <TypedJsonField
            id="member-caps"
            title="Caps"
            description="Volume limits. Leave a field empty for no cap."
            value={form.caps}
            onChange={(v) => set({ caps: v })}
          >
            <CapsEditor value={form.caps} onChange={(v) => set({ caps: v })} />
          </TypedJsonField>

          {/* Schedule */}
          <TypedJsonField
            id="member-schedule"
            title="Schedule"
            description="Delivery window. With no days selected the member is always eligible."
            value={form.schedule}
            onChange={(v) => set({ schedule: v })}
          >
            <ScheduleEditor value={form.schedule} onChange={(v) => set({ schedule: v })} />
          </TypedJsonField>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.buyer_id} className="gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {member?.id ? 'Save member' : 'Add member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
