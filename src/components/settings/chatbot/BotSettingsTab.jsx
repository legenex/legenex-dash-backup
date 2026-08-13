import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Loader2, Upload, Sparkles, Save } from 'lucide-react';
import { toast } from 'sonner';

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, affordable)' },
  { value: 'gpt-4o', label: 'GPT-4o (balanced)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (powerful)' },
  { value: 'o1-mini', label: 'o1 Mini (reasoning)' },
];

const DEFAULTS = {
  data: { bot_key: 'data', name: 'DataBot', tagline: 'Answers about your data + knowledge base', greeting: "Hi, I'm **DataBot**. Ask me about your leads, performance, and knowledge base. I only see your own account's data.", model: 'gpt-4o-mini', temperature: 0.4, max_tokens: 600, enabled: true, auto_open_seconds: 0, escalate_after_turns: 6, max_messages_per_session: 30, log_transcripts: true, instructions: '' },
  build: { bot_key: 'build', name: 'BuildBot', tagline: 'Drafts app changes for the safe build channel', greeting: "Hi, I'm **BuildBot**. Describe a change and I'll draft a ready-to-run build request.", model: 'gpt-4o-mini', temperature: 0.4, max_tokens: 600, enabled: true, auto_open_seconds: 0, escalate_after_turns: 6, max_messages_per_session: 30, log_transcripts: true, instructions: '' },
};

export default function BotSettingsTab({ botKey }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['bot-config', botKey],
    queryFn: async () => {
      const list = await base44.entities.BotConfig.filter({ bot_key: botKey });
      if (list.length) return list[0];
      return await base44.entities.BotConfig.create(DEFAULTS[botKey]);
    },
    enabled: !!botKey,
  });

  useEffect(() => { if (config) setForm(config); }, [config]);

  const setF = (k, v) => setForm(f => f ? { ...f, [k]: v } : f);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const { id, ...rest } = form;
      if (id) await base44.entities.BotConfig.update(id, rest);
      else await base44.entities.BotConfig.create(rest);
      qc.invalidateQueries({ queryKey: ['bot-config', botKey] });
      qc.invalidateQueries({ queryKey: ['bot-configs'] });
      toast.success('Bot settings saved');
    } catch (e) {
      toast.error('Failed to save: ' + (e?.message || 'Unknown error'));
    }
    setSaving(false);
  };

  // ---- Access control -------------------------------------------------------
  //
  // Roles and named people share one searchable list. Each option is prefixed
  // so the two namespaces cannot collide (a person could be called "Manager"),
  // and the prefix is stripped again when splitting back into the two stored
  // arrays.
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    staleTime: 60_000,
  });

  const ROLES = ['owner', 'admin', 'manager', 'analyst', 'viewer'];

  const accessOptions = React.useMemo(() => ([
    ...ROLES.map((r) => ({ value: `role:${r}`, label: `Role: ${r.charAt(0).toUpperCase()}${r.slice(1)}` })),
    ...users.map((u) => ({
      value: `user:${u.id}`,
      label: `${u.full_name || u.email || 'Unnamed user'}${u.email && u.full_name ? ` (${u.email})` : ''}`,
    })),
  ]), [users]);

  const accessValue = React.useMemo(() => ([
    ...(Array.isArray(form?.allowed_roles) ? form.allowed_roles : []).map((r) => `role:${r}`),
    ...(Array.isArray(form?.allowed_user_ids) ? form.allowed_user_ids : []).map((i) => `user:${i}`),
  ]), [form?.allowed_roles, form?.allowed_user_ids]);

  const onAccessChange = (next) => {
    const list = Array.isArray(next) ? next : [];
    setF('allowed_roles', list.filter((v) => v.startsWith('role:')).map((v) => v.slice(5)));
    setF('allowed_user_ids', list.filter((v) => v.startsWith('user:')).map((v) => v.slice(5)));
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setF('avatar_url', file_url);
      toast.success('Avatar uploaded');
    } catch { toast.error('Upload failed'); }
  };

  const generateAvatar = async () => {
    try {
      const { url } = await base44.integrations.Core.GenerateImage({ prompt: `Professional avatar icon for an AI assistant named ${form?.name || botKey}, modern flat design, minimalist, clean` });
      setF('avatar_url', url);
      toast.success('Avatar generated');
    } catch { toast.error('Generation failed'); }
  };

  if (!form) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="rounded-[10px] border border-border bg-card p-4 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-foreground">Bot Status</div>
          <div className="text-[12px] mt-0.5">{form.enabled ? <span className="status-sold">Active and responding</span> : <span className="status-error">Disabled</span>}</div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-muted-foreground">Enabled</Label>
          <Switch checked={form.enabled} onCheckedChange={v => setF('enabled', v)} />
        </div>
      </div>

      {/* Access control, directly under the master switch: who may use this bot
          at all is a more consequential setting than its name or tone.

          Roles and named people are one combined searchable list. Leaving it
          empty falls back to the per-user permission flag in Users and Roles,
          which is the existing behaviour, so an unconfigured bot keeps working
          for owners and admins. Enforcement is server side in the dataBot
          function; this only configures it. */}
      <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">Who can use this bot</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              {accessValue.length === 0
                ? 'Anyone whose role permits it in Users and Roles.'
                : `Restricted to ${accessValue.length} selected role${accessValue.length === 1 ? '' : 's'} or person.`}
            </div>
          </div>
          {accessValue.length > 0 && (
            <button
              type="button"
              onClick={() => { setF('allowed_roles', []); setF('allowed_user_ids', []); }}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Clear restriction
            </button>
          )}
        </div>
        <MultiSelect
          value={accessValue}
          onValueChange={onAccessChange}
          options={accessOptions}
          placeholder="Search roles and people…"
          className="w-full bg-background border-border"
        />
      </div>

      <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
        <div className="text-[13px] font-semibold text-foreground">General</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label className="text-[12px]">Bot Name</Label><Input value={form.name || ''} onChange={e => setF('name', e.target.value)} className="mt-1 bg-background" /></div>
          <div><Label className="text-[12px]">Tagline</Label><Input value={form.tagline || ''} onChange={e => setF('tagline', e.target.value)} className="mt-1 bg-background" /></div>
        </div>
        <div>
          <Label className="text-[12px]">Greeting Message</Label>
          <Textarea value={form.greeting || ''} onChange={e => setF('greeting', e.target.value)} rows={3} className="mt-1 bg-background" placeholder="Welcome message shown when the bot starts" />
        </div>
        <div>
          <Label className="text-[12px]">Avatar</Label>
          <div className="flex items-center gap-3 mt-1">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="avatar" className="w-12 h-12 rounded-full border border-border object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground text-[20px]">{(form.name || '?')[0]}</div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => document.getElementById(`avatar-upload-${botKey}`).click()}><Upload className="w-3.5 h-3.5" /> Upload</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={generateAvatar}><Sparkles className="w-3.5 h-3.5" /> Generate</Button>
              <input id={`avatar-upload-${botKey}`} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
        <div className="text-[13px] font-semibold text-foreground">Behavior</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label className="text-[12px]">Auto-open (sec, 0=never)</Label><Input type="number" value={form.auto_open_seconds ?? 0} onChange={e => setF('auto_open_seconds', Number(e.target.value))} className="mt-1 bg-background" /></div>
          <div><Label className="text-[12px]">Escalate after (turns)</Label><Input type="number" value={form.escalate_after_turns ?? 6} onChange={e => setF('escalate_after_turns', Number(e.target.value))} className="mt-1 bg-background" /></div>
          <div><Label className="text-[12px]">Max messages / session</Label><Input type="number" value={form.max_messages_per_session ?? 30} onChange={e => setF('max_messages_per_session', Number(e.target.value))} className="mt-1 bg-background" /></div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Switch checked={form.log_transcripts ?? true} onCheckedChange={v => setF('log_transcripts', v)} />
          <Label className="text-[12px] text-muted-foreground">Log full transcripts (required for KB improvement)</Label>
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
        <div className="text-[13px] font-semibold text-foreground">AI Model</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-[12px]">Model</Label>
            <Select value={form.model || 'gpt-4o-mini'} onValueChange={v => setF('model', v)}>
              <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>{MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">Temperature: {form.temperature ?? 0.4}</Label>
            <input type="range" min="0" max="1" step="0.1" value={form.temperature ?? 0.4} onChange={e => setF('temperature', Number(e.target.value))} className="w-full mt-4 accent-primary" />
          </div>
          <div><Label className="text-[12px]">Max Tokens</Label><Input type="number" value={form.max_tokens ?? 600} onChange={e => setF('max_tokens', Number(e.target.value))} className="mt-1 bg-background" /></div>
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-4 space-y-2">
        <Label className="text-[13px] font-semibold text-foreground">Bot Instructions</Label>
        <Textarea value={form.instructions || ''} onChange={e => setF('instructions', e.target.value)} rows={8} className="bg-background font-mono text-[12px]" placeholder="Full system instructions for the bot. These are prepended to every conversation." />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings</Button>
      </div>
    </div>
  );
}