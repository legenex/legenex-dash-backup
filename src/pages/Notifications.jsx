import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ToolsShell from '@/components/tools/ToolsShell';
import { Toggle, Tag } from '@/components/tools/toolsUi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, BellOff, AlertTriangle, Clock, TrendingDown, Layers, Mail, Slack, Webhook, CheckCircle2 } from 'lucide-react';
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

// AI-suggested rule templates. Toggling one on creates a NotificationRule.
const SUGGESTIONS = [
  {
    key: 'delivery_failure', name: 'Delivery failure', icon: AlertTriangle,
    description: 'Any delivery POST returns a non-200 response.',
    channel: 'Slack', channelKey: 'slack',
    rule: { name: 'Delivery failure', condition_type: 'leadbyte_non_success', threshold_count: 1, window_minutes: 5, channels: '["slack"]', recipients: '[]' },
  },
  {
    key: 'supplier_silence', name: 'Supplier silence', icon: Clock,
    description: 'No leads received for 6+ hours during business hours.',
    channel: 'Email', channelKey: 'email',
    rule: { name: 'Supplier silence', condition_type: 'errors_same_stage', threshold_count: 1, window_minutes: 360, channels: '["email"]', recipients: '[]' },
  },
  {
    key: 'rejection_spike', name: 'Buyer rejection spike', icon: TrendingDown,
    description: 'Rejection rate over 20% across the last 25 leads.',
    channel: 'Slack', channelKey: 'slack',
    rule: { name: 'Buyer rejection spike', condition_type: 'sold_rate_below', threshold_count: 25, window_minutes: 60, channels: '["slack"]', recipients: '[]' },
  },
  {
    key: 'unsold_backlog', name: 'Unsold backlog', icon: Layers,
    description: 'Unsold queue grows beyond 10 leads.',
    channel: 'Email', channelKey: 'email',
    rule: { name: 'Unsold backlog', condition_type: 'lead_queued', threshold_count: 10, window_minutes: 60, channels: '["email"]', recipients: '[]' },
  },
];

export default function Notifications() {
  const qc = useQueryClient();
  const [ruleModal, setRuleModal] = useState(false);
  const [editRule, setEditRule] = useState(null);

  const { data: rules = [] } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => base44.entities.NotificationRule.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['notification-events'],
    queryFn: () => base44.entities.NotificationEvent.list('-created_date', 200),
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ['integration-configs'],
    queryFn: () => base44.entities.IntegrationConfig.list(),
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const sentThisMonth = events.filter(e => e.created_date && new Date(e.created_date).getTime() >= monthStart).length;
  const activeCount = rules.filter(r => r.enabled).length;

  const slackConnected = integrations.some(i => i.name === 'slack' && i.config);
  const webhookConnected = integrations.some(i => i.name === 'webhook' && i.config);

  // A suggestion is "on" if a rule with that name already exists and is enabled.
  const suggestionRule = (s) => rules.find(r => r.name === s.name);

  const toggleSuggestion = async (s, on) => {
    const existing = suggestionRule(s);
    try {
      if (on) {
        if (existing) {
          await base44.entities.NotificationRule.update(existing.id, { enabled: true });
        } else {
          await base44.entities.NotificationRule.create({ ...s.rule, enabled: true });
        }
        toast.success(`${s.name} rule enabled`);
      } else if (existing) {
        await base44.entities.NotificationRule.update(existing.id, { enabled: false });
        toast.success(`${s.name} rule disabled`);
      }
      qc.invalidateQueries({ queryKey: ['notification-rules'] });
    } catch (e) {
      toast.error('Failed: ' + (e?.message || 'Unknown error'));
    }
  };

  const enableAll = async () => {
    try {
      for (const s of SUGGESTIONS) {
        const existing = suggestionRule(s);
        if (existing) {
          if (!existing.enabled) await base44.entities.NotificationRule.update(existing.id, { enabled: true });
        } else {
          await base44.entities.NotificationRule.create({ ...s.rule, enabled: true });
        }
      }
      qc.invalidateQueries({ queryKey: ['notification-rules'] });
      toast.success('All suggested rules enabled');
    } catch (e) {
      toast.error('Failed: ' + (e?.message || 'Unknown error'));
    }
  };

  const openCreate = () => {
    setEditRule({ name: '', condition_type: 'errors_same_stage', threshold_count: 5, window_minutes: 15, channels: '["email"]', recipients: '["admin@legenex.com"]', enabled: true });
    setRuleModal(true);
  };

  const openEdit = (rule) => {
    setEditRule({ ...rule });
    setRuleModal(true);
  };

  const saveRule = async () => {
    const data = { ...editRule };
    if (editRule.id) {
      await base44.entities.NotificationRule.update(editRule.id, data);
      toast.success('Rule updated');
    } else {
      await base44.entities.NotificationRule.create(data);
      toast.success('Rule created');
    }
    qc.invalidateQueries({ queryKey: ['notification-rules'] });
    setRuleModal(false);
  };

  return (
    <ToolsShell
      title="Notifications"
      subtitle="Alert rules for failures, spikes and silence across the pipeline."
      actions={
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> New Rule</Button>
      }
    >
      {/* Top chips */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Tag tone="primary">{activeCount} active rule{activeCount !== 1 ? 's' : ''}</Tag>
        <Tag tone="neutral">{sentThisMonth} sent this month</Tag>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Active Rules */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-[10px] border border-border bg-card p-4">
            <div className="text-[13px] font-semibold text-foreground mb-3">Active Rules</div>
            {rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <BellOff className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <div className="text-[13px] font-medium text-foreground">No rules configured</div>
                <div className="text-[12px] text-muted-foreground mt-1 max-w-sm">
                  Failures, silence and rejection spikes currently go unnoticed. Add a rule or enable a suggestion below.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    className="border border-border rounded-lg p-3 flex items-center justify-between hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => openEdit(rule)}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground">{rule.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{conditionLabels[rule.condition_type] || rule.condition_type}</div>
                      <div className="flex gap-1.5 mt-1.5">
                        {rule.threshold_count ? <Badge variant="outline" className="text-[10px]">Threshold {rule.threshold_count}</Badge> : null}
                        {rule.window_minutes ? <Badge variant="outline" className="text-[10px]">{rule.window_minutes}m window</Badge> : null}
                      </div>
                    </div>
                    <div className={`text-[11px] font-medium shrink-0 ${rule.enabled ? 'status-sold' : 'text-muted-foreground'}`}>
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI-suggested rules */}
          <div className="rounded-[10px] border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-semibold text-foreground">AI-suggested rules</div>
              <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={enableAll}>Enable all</Button>
            </div>
            <div className="space-y-2">
              {SUGGESTIONS.map(s => {
                const existing = suggestionRule(s);
                const on = !!existing?.enabled;
                const Icon = s.icon;
                return (
                  <div key={s.key} className="border border-border rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">{s.name}</span>
                        <Tag tone="neutral">{s.channel}</Tag>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{s.description}</div>
                    </div>
                    <Toggle checked={on} onChange={(v) => toggleSuggestion(s, v)} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Delivery Channels */}
        <div className="lg:col-span-1">
          <div className="rounded-[10px] border border-border bg-card p-4">
            <div className="text-[13px] font-semibold text-foreground mb-3">Delivery Channels</div>
            <div className="space-y-2">
              <ChannelRow icon={Mail} name="Email" connected={true} detail="Sends via the platform mailer" />
              <ChannelRow icon={Slack} name="Slack" connected={slackConnected} detail={slackConnected ? 'Connected' : 'Connect a Slack webhook'} />
              <ChannelRow icon={Webhook} name="Webhook" connected={webhookConnected} detail={webhookConnected ? 'Connected' : 'Connect an outbound webhook'} />
            </div>
          </div>
        </div>
      </div>

      {/* Rule Modal */}
      <Dialog open={ruleModal} onOpenChange={setRuleModal}>
        <DialogContent className="bg-popover border-border max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editRule?.id ? 'Edit Rule' : 'New Rule'}</DialogTitle>
          </DialogHeader>
          {editRule && (
            <div className="space-y-4">
              <div><Label className="text-[12px]">Name</Label><Input value={editRule.name} onChange={e => setEditRule(p => ({ ...p, name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div>
                <Label className="text-[12px]">Condition Type</Label>
                <Select value={editRule.condition_type} onValueChange={v => setEditRule(p => ({ ...p, condition_type: v }))}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(conditionLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Threshold Count</Label><Input type="number" value={editRule.threshold_count || ''} onChange={e => setEditRule(p => ({ ...p, threshold_count: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
                <div><Label className="text-[12px]">Window (minutes)</Label><Input type="number" value={editRule.window_minutes || ''} onChange={e => setEditRule(p => ({ ...p, window_minutes: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
              </div>
              <div><Label className="text-[12px]">Recipients (JSON array)</Label><Input value={editRule.recipients || '[]'} onChange={e => setEditRule(p => ({ ...p, recipients: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div className="flex items-center gap-2">
                <Switch checked={editRule.enabled} onCheckedChange={v => setEditRule(p => ({ ...p, enabled: v }))} />
                <Label className="text-[12px]">Enabled</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRuleModal(false)}>Cancel</Button>
            <Button onClick={saveRule}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolsShell>
  );
}

function ChannelRow({ icon: Icon, name, connected, detail }) {
  return (
    <div className="flex items-center gap-3 border border-border rounded-lg p-3">
      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-foreground">{name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{detail}</div>
      </div>
      {connected ? (
        <span className="inline-flex items-center gap-1 text-[11px] status-sold font-medium shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" /> Connected
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground font-medium shrink-0">Connect</span>
      )}
    </div>
  );
}