import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { usePortalAction } from '@/hooks/usePortalAction';

// Request a return for one of the buyer's leads.
export default function ReturnDialog({ lead, open, onClose }) {
  const { run } = usePortalAction();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await run({ action: 'request_return', lead_id: lead.id, reason });
      toast.success('Return requested');
      setReason('');
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not request return');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-popover border-border max-w-[440px]">
        <DialogHeader><DialogTitle>Request Return</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-[12px] text-muted-foreground">
            {lead?.first_name} {lead?.last_name} · {lead?.mobile || lead?.email}
          </div>
          <div>
            <Label className="text-[12px]">Reason *</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you returning this lead?" className="mt-1 bg-background text-[13px] min-h-[90px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!reason.trim() || saving}>{saving ? 'Submitting…' : 'Request Return'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}