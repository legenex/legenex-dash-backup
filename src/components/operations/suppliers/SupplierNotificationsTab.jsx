import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, Send, Loader2, Check, X } from 'lucide-react';

// A one line real test message. Sent right now to the supplier over the chosen
// channel. It carries no state change data and triggers no digest.
const TEST_BODY = 'Test message from Legenex. This confirms your notification channel is reachable. No action needed.';
const TEST_SUBJECT = 'Legenex notification test';

// Editable form over the supplier notification fields. Each channel has a Send
// test button that fires a real one off message and reports its own outcome.
export default function SupplierNotificationsTab({ supplier }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => initForm(supplier));
  const [saving, setSaving] = useState(false);
  // Per channel test state: { status: 'idle'|'pending'|'success'|'error', error }
  const [tests, setTests] = useState({ email: idle(), whatsapp: idle(), slack: idle() });

  useEffect(() => {
    setForm(initForm(supplier));
    setTests({ email: idle(), whatsapp: idle(), slack: idle() });
  }, [supplier]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const isActive = String(supplier.status || '').toLowerCase() === 'active';
  const noChannel = !form.notify_email && !form.notify_whatsapp && !form.notify_slack_channel;
  const muted = form.notify_on_state_change === false;

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Supplier.update(supplier.id, {
        notify_email: form.notify_email,
        notify_whatsapp: form.notify_whatsapp,
        notify_slack_channel: form.notify_slack_channel,
        notify_on_state_change: !!form.notify_on_state_change,
      });
      toast.success('Notifications saved');
      qc.invalidateQueries({ queryKey: ['op-suppliers'] });
    } catch (err) {
      toast.error(`Could not save notifications: ${err?.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const setTest = (channel, next) => setTests((t) => ({ ...t, [channel]: next }));

  // Fire a real test over one channel. Never writes a StateChangeEvent, never
  // sets notified_at, never enqueues a digest. It only sends one message.
  const runTest = async (channel) => {
    setTest(channel, { status: 'pending', error: '' });
    try {
      let res;
      if (channel === 'email') {
        res = await base44.functions.invoke('sendGmail', {
          to: form.notify_email, subject: TEST_SUBJECT, body: TEST_BODY,
        });
      } else if (channel === 'whatsapp') {
        res = await base44.functions.invoke('sendWhatsapp', {
          to: form.notify_whatsapp, body: TEST_BODY,
        });
      } else {
        res = await base44.functions.invoke('sendSlackTest', {
          channel: form.notify_slack_channel, body: TEST_BODY,
        });
      }
      const data = res?.data || {};
      if (data.success) {
        setTest(channel, { status: 'success', error: '' });
      } else {
        setTest(channel, { status: 'error', error: data.error || 'Send failed' });
      }
    } catch (err) {
      setTest(channel, { status: 'error', error: err?.message || 'Send failed' });
    }
  };

  return (
    <div className="space-y-5">
      {isActive && noChannel && (
        <div className="flex gap-2.5 rounded-lg border border-primary/40 bg-primary/10 p-3">
          <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground leading-relaxed">
            This supplier cannot be told when a state closes and will keep sending leads into closed states.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <div>
          <Label className="text-[13px]">State change notifications</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">Include this supplier in state coverage change digests.</p>
        </div>
        <Switch checked={!!form.notify_on_state_change} onCheckedChange={(v) => set('notify_on_state_change', v)} />
      </div>

      {muted && (
        <div className="flex gap-2.5 rounded-lg border border-[hsl(38_80%_57%)]/40 bg-status-unsold p-3">
          <AlertTriangle className="w-4 h-4 status-unsold shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground/90 leading-relaxed">
            This supplier is muted and will be skipped by state change digests even if channels are configured.
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        The test buttons below send real messages to this supplier right now.
      </p>

      <ChannelField
        label="Email"
        value={form.notify_email}
        onChange={(v) => set('notify_email', v)}
        placeholder="ops@supplier.com"
        test={tests.email}
        onTest={() => runTest('email')}
      />
      <ChannelField
        label="WhatsApp number"
        value={form.notify_whatsapp}
        onChange={(v) => set('notify_whatsapp', v)}
        placeholder="+15551234567"
        test={tests.whatsapp}
        onTest={() => runTest('whatsapp')}
      />
      <ChannelField
        label="Slack channel"
        value={form.notify_slack_channel}
        onChange={(v) => set('notify_slack_channel', v)}
        placeholder="#supplier-alerts or channel ID"
        test={tests.slack}
        onTest={() => runTest('slack')}
      />

      <div className="flex justify-end pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Notifications'}
        </Button>
      </div>
    </div>
  );
}

// One channel row: the field, a Send test button, and the per channel outcome.
function ChannelField({ label, value, onChange, placeholder, test, onTest }) {
  const empty = !value || !String(value).trim();
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-background" />
        <Button
          type="button"
          variant="outline"
          onClick={onTest}
          disabled={empty || test.status === 'pending'}
          className="shrink-0 gap-1.5"
        >
          {test.status === 'pending'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Send className="w-3.5 h-3.5" />}
          Send test
        </Button>
      </div>
      {test.status === 'success' && (
        <p className="flex items-center gap-1.5 text-[11px] status-sold">
          <Check className="w-3.5 h-3.5" /> Test sent
        </p>
      )}
      {test.status === 'error' && (
        <p className="flex items-start gap-1.5 text-[11px] text-primary">
          <X className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Test failed: {test.error}</span>
        </p>
      )}
    </div>
  );
}

function idle() { return { status: 'idle', error: '' }; }

function initForm(supplier) {
  return {
    notify_email: supplier.notify_email || '',
    notify_whatsapp: supplier.notify_whatsapp || '',
    notify_slack_channel: supplier.notify_slack_channel || '',
    notify_on_state_change: supplier.notify_on_state_change !== false,
  };
}