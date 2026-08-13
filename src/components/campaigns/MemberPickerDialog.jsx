import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Loader2, ArrowLeft, PackageOpen } from 'lucide-react';

const buyerLabel = (b) => b?.company_name || b?.name || b?.id || 'Buyer';

// Two-step member picker: pick a Buyer, then pick one of that buyer's ACTIVE
// SubDeliveries. Sets sub_delivery_id on a NEW RouteMember. Never writes inline
// delivery_config or ping_config. The member is attached to the given group at
// the end of the ordered list.
export default function MemberPickerDialog({
  open, onOpenChange, group, existingMemberCount = 0, buyers = [],
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [buyerId, setBuyerId] = useState('');
  const [subId, setSubId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: allDeliveries = [] } = useQuery({ queryKey: ['deliveries'], queryFn: () => fetchAll((limit, skip) => base44.entities.Delivery.list('-created_date', limit, skip)) });
  const { data: allSubs = [] } = useQuery({ queryKey: ['subdeliveries'], queryFn: () => fetchAll((limit, skip) => base44.entities.SubDelivery.list('-created_date', limit, skip)) });

  const buyerDeliveries = useMemo(
    () => allDeliveries.filter((d) => d.buyer_id === buyerId && d.status === 'active'),
    [allDeliveries, buyerId],
  );
  const deliveryIds = useMemo(() => new Set(buyerDeliveries.map((d) => d.id)), [buyerDeliveries]);
  const buyerName = useMemo(() => Object.fromEntries(allDeliveries.map((d) => [d.id, d.name || 'Delivery'])), [allDeliveries]);
  const activeSubs = useMemo(
    () => allSubs
      .filter((s) => s.active !== false && deliveryIds.has(s.delivery_id))
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [allSubs, deliveryIds],
  );

  function reset() { setStep(1); setBuyerId(''); setSubId(''); }
  function close() { reset(); onOpenChange(false); }

  async function attach() {
    if (!group) { toast.error('No routing group available'); return; }
    if (!buyerId || !subId) { toast.error('Pick a buyer and a delivery'); return; }
    setSaving(true);
    try {
      await base44.entities.RouteMember.create({
        route_group_id: group.id,
        buyer_id: buyerId,
        sub_delivery_id: subId,
        active: true,
        priority: existingMemberCount + 1,
        weight: 1,
        price_mode: 'fixed',
      });
      await qc.invalidateQueries({ queryKey: ['routeMembers'] });
      await qc.invalidateQueries({ queryKey: ['routemembers'] });
      toast.success('Delivery added to routing');
      close();
    } catch (e) { toast.error('Could not add delivery: ' + (e?.message || 'error')); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="bg-popover border-border max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add a routing delivery</DialogTitle>
          <DialogDescription className="text-[12px]">
            {step === 1 ? 'Step 1 of 2: choose the buyer.' : 'Step 2 of 2: choose one of this buyer\u2019s active deliveries.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-2">
            <Label className="text-[12px] font-medium">Buyer</Label>
            <Select value={buyerId} onValueChange={(v) => { setBuyerId(v); setSubId(''); }}>
              <SelectTrigger className="bg-background h-9"><SelectValue placeholder="Select a buyer" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {buyers.map((b) => <SelectItem key={b.id} value={b.id}>{buyerLabel(b)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <Label className="text-[12px] font-medium">Delivery</Label>
            {activeSubs.length === 0 ? (
              <div className="rounded-md border border-border bg-card px-4 py-6 text-center">
                <PackageOpen className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <div className="text-[13px] text-foreground">No active deliveries for this buyer</div>
                <div className="text-[12px] text-muted-foreground mt-1">
                  Create a Delivery and an active sub-delivery in the buyer&apos;s Deliveries tab first.
                </div>
              </div>
            ) : (
              <Select value={subId} onValueChange={setSubId}>
                <SelectTrigger className="bg-background h-9"><SelectValue placeholder="Select a delivery" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {activeSubs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {(s.name || 'Delivery')}{buyerName[s.delivery_id] ? ` \u00b7 ${buyerName[s.delivery_id]}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} className="mr-auto gap-1.5">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancel</Button>
          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={!buyerId}>Next</Button>
          )}
          {step === 2 && (
            <Button onClick={attach} disabled={saving || !subId} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}Add delivery
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}