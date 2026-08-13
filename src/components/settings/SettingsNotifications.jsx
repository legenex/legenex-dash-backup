import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Mail, Hash, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

const conditionLabels = {
  errors_same_stage: 'N errors of the same stage within M minutes',
  hlr_unreachable: 'HLR provider unreachable',
  leadbyte_non_success: 'LeadByte returning non success',
  sold_rate_below: 'Sold rate drops below X percent over last N leads',
  api_error: 'API connector error',
  capi_failure: 'Facebook CAPI event failure',
  lead_queued: 'Lead queued at gate or by LeadByte',
  missing_fields: 'Required fields missing on inbound lead',
};

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'slack', label: 'Slack', icon: Hash },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function SettingsNotifications() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);

  const { data: rules = [] } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => base44.entities.NotificationRule.list(),
  });

  const openCreate = () => {
    setEdit({ name: '', condition_type: 'errors_same_stage', threshold_count: 5, window_minutes: 15, channels: '["email"]', recipients: '', enabled: true });
    setModal(true);
  };
  const openEdit = (r) => { setEdit({ ...r }); setModal(true); };

  const save = async () => {
    if (!edit.name?.trim()) { toast.error('Name required'); return; }
    const data = {
      ...edit,
      channels: JSON.stringify(parseJsonArray(edit.channels)),
      recipients: JSON.stringify(edit.recipients ? String(edit.recipients).split(',').map(s => s.trim()).filter(Boolean) : []),
    };
    if (edit.id) {
      await base44.entities.NotificationRule.update(edit.id, data);
      toast.success('Rule updated');
    } else {
      await base44.entities.NotificationRule.create(data);
      toast.success('Rule created');
    }
    qc.invalidateQueries({ queryKey: ['notification-rules'] });
    setModal(false);
  };

  const remove = async (id) => {
    await base44.entities.NotificationRule.delete(id);
    toast.success('Rule deleted');
    qc.invalidateQueries({ queryKey: ['notification-rules'] });
  };

  const toggleChannel = (val) => {
    const arr = parseJsonArray(edit.channels);
    const next = arr.includes(val) ? arr.filter(c => c !== val) : [...arr, val];
    setEdit(p => ({ ...p, channels: JSON.stringify(next) }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-muted-foreground max-w-2xl">
          Configure alert rules and the channels they deliver to. Email, Slack and WhatsApp channels are connected via the
          Integrations tab.
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Add Rule</Button>
      </div>

      <div className="space-y-3">
        {rules.map(r => {
          const chans = parseJsonArray(r.channels);
          const recips = parseJsonArray(r.recipients);
          return (
            <div key={r.id} className="bg-card border border-border rounded-[10px] p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 cursor-pointer" onClick={() => openEdit(r)}>
                  <div className="text-[14px] font-medium text-foreground">{r.name}</div>
                  <div className="text-[12px] text-muted-foreground mt-1">{conditionLabels[r.condition_type] || r.condition_type}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {chans.map(c => {
                      const Icon = CHANNEL_OPTIONS.find(o => o.value === c)?.icon;
                      return (
                        <Badge key={c} variant="outline" className="text-[10px] gap-1 capitalize">
                          {Icon && <Icon className="w-3 h-3" />} {c}
                        </Badge>
                      );
                    })}
                    {r.threshold_count ? <Badge variant="outline" className="text-[10px]">Threshold: {r.threshold_count}</Badge> : null}
                    {r.window_minutes ? <Badge variant="outline" className="text-[10px]">Window: {r.window_minutes}m</Badge> : null}
                    {recips.length > 0 && <Badge variant="outline" className="text-[10px]">{recips.length} recipient{recips.length !== 1 ? 's' : ''}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[12px] font-medium ${r.enabled ? 'status-sold' : 'text-muted-foreground'}`}>{r.enabled ? 'Active' : 'Disabled'}</span>
                  <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          );
        })}
        {rules.length === 0 && <div className="text-center py-8 text-muted-foreground text-[13px]">No notification rules configured</div>}
      </div>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="bg-popover border-border max-w-[500px]">
          <DialogHeader><DialogTitle>{edit?.id ? 'Edit Rule' : 'New Rule'}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div><Label className="text-[12px]">Name</Label><Input value={edit.name} onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div>
                <Label className="text-[12px]">Condition</Label>
                <Select value={edit.condition_type} onValueChange={v => setEdit(p => ({ ...p, condition_type: v }))}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(conditionLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Threshold Count</Label><Input type="number" value={edit.threshold_count ?? ''} onChange={e => setEdit(p => ({ ...p, threshold_count: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
                <div><Label className="text-[12px]">Window (minutes)</Label><Input type="number" value={edit.window_minutes ?? ''} onChange={e => setEdit(p => ({ ...p, window_minutes: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
              </div>
              <div>
                <Label className="text-[12px]">Channels</Label>
                <div className="flex flex-wrap gap-4 mt-2">
                  {CHANNEL_OPTIONS.map(c => {
                    const checked = parseJsonArray(edit.channels).includes(c.value);
                    const Icon = c.icon;
                    return (
                      <label key={c.value} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={checked} onCheckedChange={() => toggleChannel(c.value)} />
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[12px] text-foreground">{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-[12px]">Recipients (comma-separated emails / Slack channels / WhatsApp numbers)</Label>
                <Input
                  value={Array.isArray(edit.recipients) ? edit.recipients.join(', ') : (edit.recipients || '')}
                  onChange={e => setEdit(p => ({ ...p, recipients: e.target.value }))}
                  placeholder="alerts@legenex.com, #leads, +27..."
                  className="mt-1 bg-background"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={edit.enabled} onCheckedChange={v => setEdit(p => ({ ...p, enabled: v }))} />
                <Label className="text-[12px]">Enabled</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}