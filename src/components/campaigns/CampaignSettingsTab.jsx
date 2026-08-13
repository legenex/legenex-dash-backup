import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';

// Delivery method maps to Campaign.send_mode (existing enum).
const DELIVERY_METHODS = [
  { value: 'direct_post', label: 'Direct Post' },
  { value: 'ping_post', label: 'Ping Post' },
  { value: 'both', label: 'Both' },
];

// Campaign settings. Name/vertical -> Campaign fields. Delivery method ->
// Campaign.send_mode. The routing method now lives on the Routing tab, so it is
// not duplicated here. All existing fields; no schema changes, no
// routing/engine/billing logic touched.
export default function CampaignSettingsTab({ campaign }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: verticalList = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list('sort_order'),
  });

  const [name, setName] = useState(campaign.name || '');
  const [vertical, setVertical] = useState(campaign.vertical || '');
  const [sendMode, setSendMode] = useState(campaign.send_mode || 'direct_post');

  useEffect(() => {
    setName(campaign.name || '');
    setVertical(campaign.vertical || '');
    setSendMode(campaign.send_mode || 'direct_post');
  }, [campaign.id, campaign.name, campaign.vertical, campaign.send_mode]);

  async function save() {
    setSaving(true);
    try {
      await base44.entities.Campaign.update(campaign.id, { name, vertical, send_mode: sendMode });
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign settings saved');
    } catch (e) { toast.error('Save failed: ' + (e?.message || 'error')); } finally { setSaving(false); }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-[12px] font-medium">Campaign name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-background h-9" />
          </div>
          <div>
            <Label className="text-[12px] font-medium">Vertical</Label>
            <Select value={vertical} onValueChange={setVertical}>
              <SelectTrigger className="mt-1 bg-background h-9"><SelectValue placeholder="Select vertical" /></SelectTrigger>
              <SelectContent>
                {verticalList.map((v) => <SelectItem key={v.id} value={v.code}>{v.name} ({v.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Distribution</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-[12px] font-medium">Delivery method</Label>
            <Select value={sendMode} onValueChange={setSendMode}>
              <SelectTrigger className="mt-1 bg-background h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{DELIVERY_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          The routing method (Waterfall, Round Robin, Hybrid) is set on the Routing tab.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || !name} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save Settings
        </Button>
      </div>
    </div>
  );
}