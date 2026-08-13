import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { DISPOSITIONS } from '@/lib/dispositions';
import { usePortalAction } from '@/hooks/usePortalAction';

const OPTIONS = DISPOSITIONS.map(d => ({ value: d.value, label: d.value }));

// Add manual feedback for one of the buyer's leads.
export default function FeedbackDialog({ lead, open, onClose }) {
  const { run } = usePortalAction();
  const [disposition, setDisposition] = useState('');
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await run({ action: 'add_feedback', lead_id: lead.id, disposition, outcome, notes });
      toast.success('Feedback saved');
      setDisposition(''); setOutcome(''); setNotes('');
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save feedback');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-popover border-border max-w-[460px]">
        <DialogHeader><DialogTitle>Add Feedback</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-[12px] text-muted-foreground">
            {lead?.first_name} {lead?.last_name} · {lead?.mobile || lead?.email}
          </div>
          <div>
            <Label className="text-[12px]">Disposition *</Label>
            <SearchableSelect
              value={disposition}
              onValueChange={setDisposition}
              className="mt-1 bg-background"
              placeholder="Select a disposition…"
              options={OPTIONS}
            />
          </div>
          <div>
            <Label className="text-[12px]">Outcome</Label>
            <Input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="Short outcome summary" className="mt-1 bg-background text-[13px]" />
          </div>
          <div>
            <Label className="text-[12px]">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional context…" className="mt-1 bg-background text-[13px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!disposition || saving}>{saving ? 'Saving…' : 'Save Feedback'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}