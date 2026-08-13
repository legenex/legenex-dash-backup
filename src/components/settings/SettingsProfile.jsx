import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { sendGmail } from '@/functions/sendGmail';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Save, Mail, CheckCircle2, Plug, Loader2, User as UserIcon, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, Input, Tag } from '@/components/settings/settingsUi';

export default function SettingsProfile() {
  const { user, checkUserAuth } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', timezone: 'UTC' });
  const [saving, setSaving] = useState(false);

  const [gmailFrom, setGmailFrom] = useState('');
  const [gmailLoading, setGmailLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || '',
        email: user.email || '',
        timezone: user.timezone || 'UTC',
      });
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    (async () => {
      setGmailLoading(true);
      try {
        const res = await sendGmail({});
        const d = res?.data || {};
        if (active && d.connected) setGmailFrom(d.from || '');
      } catch { /* not connected */ }
      if (active) setGmailLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ full_name: form.full_name, timezone: form.timezone });
      await checkUserAuth();
      toast.success('Profile saved');
    } catch {
      toast.error('Failed to save profile');
    }
    setSaving(false);
  };

  const connectGmail = () => { window.location.href = '/settings?tab=integrations'; };
  const disconnectGmail = () => {
    toast.message('Disconnect Gmail from Settings / Integrations, where the connection is managed.');
    window.location.href = '/settings?tab=integrations';
  };

  const role = user?.role === 'admin' ? 'Admin' : 'Member';

  return (
    <div className="max-w-2xl space-y-5">
      <Panel className="p-5" i={0}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <UserIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-foreground">{form.full_name || 'Your account'}</div>
            <div className="text-[12px] text-muted-foreground">{form.email}</div>
          </div>
          <Tag tone="primary" className="ml-auto">{role}</Tag>
        </div>

        <div className="space-y-4">
          <Input label="Name" value={form.full_name} onChange={(v) => setForm(p => ({ ...p, full_name: v }))} placeholder="Your name" />
          <Input label="Email" value={form.email} onChange={(v) => setForm(p => ({ ...p, email: v }))} placeholder="you@example.com" hint="Your sign-in email is managed by your account." />
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Timezone</div>
            <div className="h-10 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-[13px] text-muted-foreground">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>America/Regina (Saskatchewan), fixed for all reporting</span>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="p-5" i={1}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-foreground">Gmail Integration</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">Send and receive email notifications from your Gmail account.</div>
            <div className="flex items-center justify-between mt-4">
              {gmailLoading ? (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</span>
              ) : gmailFrom ? (
                <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Connected · {gmailFrom}</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Not connected</span>
              )}
              {gmailFrom ? (
                <Button size="sm" variant="outline" onClick={disconnectGmail}>Disconnect</Button>
              ) : (
                <Button size="sm" onClick={connectGmail} className="gap-1.5"><Plug className="w-3.5 h-3.5" /> Connect Gmail</Button>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}