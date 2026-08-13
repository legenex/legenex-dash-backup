import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import DeliveryTransportsEditor from '@/components/campaigns/DeliveryTransportsEditor';

// Create or edit ONE buyer delivery, plus the transports on its primary
// endpoint.
//
// Deliveries are buyer-owned. This dialog writes Delivery and SubDelivery
// records directly, so opening it from Operations or from a campaign edits the
// same records. It never writes routing, pricing, caps, or filters: those are
// campaign-level and stay on the RouteMember.
export default function DeliveryEditorDialog({ open, onOpenChange, buyerId, buyerName, delivery, primarySub, sheetsConnected = false, sheetOptions = [] }) {
  const qc = useQueryClient();
  const isEdit = !!delivery;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('draft');
  const [transports, setTransports] = useState('[]');

  useEffect(() => {
    if (!open) return;
    setName(delivery?.name || '');
    setStatus(delivery?.status || 'draft');
    setTransports(primarySub?.transports || '[]');
  }, [open, delivery, primarySub]);

  async function save() {
    if (!name.trim()) { toast.error('Give the delivery a name'); return; }
    if (!buyerId) { toast.error('No buyer selected'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await base44.entities.Delivery.update(delivery.id, { name: name.trim(), status });
        if (primarySub) {
          await base44.entities.SubDelivery.update(primarySub.id, { transports });
        } else {
          await base44.entities.SubDelivery.create({
            delivery_id: delivery.id, name: 'Primary', order_index: 0, active: true,
            method: 'POST', encoding: 'json', timeout_ms: 10000, transports,
          });
        }
      } else {
        const created = await base44.entities.Delivery.create({
          buyer_id: buyerId, name: name.trim(), status,
        });
        await base44.entities.SubDelivery.create({
          delivery_id: created.id, name: 'Primary', order_index: 0, active: true,
          method: 'POST', encoding: 'json', timeout_ms: 10000, transports,
        });
      }
      await qc.invalidateQueries({ queryKey: ['deliveries'] });
      await qc.invalidateQueries({ queryKey: ['subdeliveries'] });
      toast.success(isEdit ? 'Delivery saved' : 'Delivery created');
      onOpenChange(false);
    } catch (e) {
      toast.error('Could not save delivery: ' + (e?.message || 'error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[680px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit delivery' : 'Create delivery'}{buyerName ? ` for ${buyerName}` : ''}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Deliveries belong to the buyer and are managed in Operations. Changes here update the same record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
            <div className="space-y-1">
              <Label className="text-[12px] font-medium">Delivery name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Primary intake" className="h-9 bg-background" />
            </div>
            <div className="space-y-1">
              <Label className="text-[12px] font-medium">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DeliveryTransportsEditor
            value={transports}
            onChange={setTransports}
            sheetsConnected={sheetsConnected}
            sheetOptions={sheetOptions}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save delivery' : 'Create delivery'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
