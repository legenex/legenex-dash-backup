import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsWebhooks() {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);

  const { data: webhooks = [] } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => base44.entities.Webhook.list(),
  });

  const openNew = () => {
    setForm({ name: '', url: '', secret: '', events: '["lead.sold","lead.unsold","lead.error"]', enabled: true, headers: '{}' });
    setEditOpen(true);
  };

  const openEdit = (wh) => {
    setForm({ ...wh });
    setEditOpen(true);
  };

  const save = async () => {
    if (form.id) {
      await base44.entities.Webhook.update(form.id, form);
    } else {
      await base44.entities.Webhook.create(form);
    }
    toast.success('Webhook saved');
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ['webhooks'] });
  };

  const deleteWh = async (id) => {
    await base44.entities.Webhook.delete(id);
    toast.success('Webhook deleted');
    qc.invalidateQueries({ queryKey: ['webhooks'] });
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openNew} className="gap-1.5"><Plus className="w-4 h-4" /> Add Webhook</Button>
      </div>

      <div className="space-y-3">
        {webhooks.length === 0 && <div className="text-center py-8 text-muted-foreground text-[13px]">No webhooks configured</div>}
        {webhooks.map(wh => (
          <div key={wh.id} className="bg-card border border-border rounded-[10px] p-4 flex items-center justify-between">
            <div>
              <div className="text-[14px] font-medium text-foreground">{wh.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground mt-1 truncate max-w-[400px]">{wh.url}</div>
              <div className="flex gap-1.5 mt-2">
                {(typeof wh.events === 'string' ? JSON.parse(wh.events) : wh.events || []).map(ev => (
                  <Badge key={ev} variant="outline" className="text-[10px] font-mono">{ev}</Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={wh.enabled ? 'status-sold bg-status-sold' : 'text-muted-foreground'}>
                {wh.enabled ? 'Active' : 'Disabled'}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => openEdit(wh)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => deleteWh(wh.id)} className="text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-popover border-border max-w-[450px]">
          <DialogHeader><DialogTitle>{form?.id ? 'Edit Webhook' : 'New Webhook'}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4">
              <div><Label className="text-[12px]">Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">URL</Label><Input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">HMAC Secret (optional)</Label><Input value={form.secret || ''} onChange={e => setForm(p => ({ ...p, secret: e.target.value }))} className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Events (JSON array)</Label><Input value={form.events} onChange={e => setForm(p => ({ ...p, events: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Custom Headers (JSON)</Label><Input value={form.headers || '{}'} onChange={e => setForm(p => ({ ...p, headers: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div className="flex items-center gap-2"><Switch checked={form.enabled} onCheckedChange={v => setForm(p => ({ ...p, enabled: v }))} /><Label className="text-[12px]">Enabled</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}