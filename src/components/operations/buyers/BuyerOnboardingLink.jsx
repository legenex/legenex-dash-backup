import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Send } from 'lucide-react';

// Per-buyer onboarding link surface. Mints (or reuses) the buyer's onboarding
// link on mount, then offers Copy and Send actions. Renders nothing for
// auto-created buyers or before a token is available.
export default function BuyerOnboardingLink({ buyer }) {
  const [token, setToken] = useState('');
  const [linkSentAt, setLinkSentAt] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!buyer?.id || buyer.auto_created) return;
    let cancelled = false;
    base44.functions.invoke('mintOnboardingLink', { buyer_id: buyer.id })
      .then((res) => { if (!cancelled) setToken(res?.data?.token || ''); })
      .catch(() => { /* leave token empty, do not toast */ });
    return () => { cancelled = true; };
  }, [buyer?.id]);

  const link = token ? `${window.location.origin}/apply?token=${token}` : '';

  if (!token) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    toast.success('Link copied');
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await base44.functions.invoke('sendOnboardingLink', {
        buyer_id: buyer.id,
        link_base: window.location.origin,
      });
      toast.success('Onboarding link sent to ' + (res?.data?.to || 'the buyer'));
      setLinkSentAt(res?.data?.link_sent_at || '');
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Could not send the link');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <Label className="text-[12px] text-muted-foreground">Onboarding Link</Label>
      <div className="flex items-center gap-2">
        <Input value={link} readOnly className="bg-background font-mono text-[12px]" />
        <Button variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1.5">
          <Copy className="w-3.5 h-3.5" />
          Copy
        </Button>
        <Button size="sm" onClick={send} disabled={sending} className="shrink-0 gap-1.5">
          <Send className="w-3.5 h-3.5" />
          {sending ? 'Sending...' : 'Send'}
        </Button>
      </div>
      {linkSentAt && (
        <p className="text-[11px] text-muted-foreground">
          Last sent {new Date(linkSentAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}