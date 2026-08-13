import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Save, Loader2, FolderOpen, CheckCircle2, ShieldAlert, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

// Config for the Google Picker. These three values are browser-side public
// identifiers, not secrets: the API key is origin restricted and the client ID
// is sent to Google on every sign in. No token is stored, because the Picker
// mints a short-lived one per use and the sheet is read server side through the
// existing Sheets connector.
export function useGooglePickerConfig() {
  return useQuery({
    queryKey: ['google-picker-config'],
    queryFn: async () => {
      const rows = await base44.entities.IntegrationConfig.filter({ name: 'google_picker' });
      const row = (rows || [])[0];
      if (!row) return { client_id: '', api_key: '', app_id: '' };
      try { return JSON.parse(row.config || '{}'); } catch { return { client_id: '', api_key: '', app_id: '' }; }
    },
  });
}

export default function GooglePickerSettings({ open, onOpenChange }) {
  const qc = useQueryClient();
  const { data: saved } = useGooglePickerConfig();
  const [form, setForm] = useState({ client_id: '', api_key: '', app_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && saved) setForm({ client_id: saved.client_id || '', api_key: saved.api_key || '', app_id: saved.app_id || '' });
  }, [open, saved]);

  const save = async () => {
    if (!form.client_id.trim() || !form.api_key.trim()) {
      toast.error('Client ID and API key are both required');
      return;
    }
    setSaving(true);
    try {
      const payload = JSON.stringify({
        client_id: form.client_id.trim(), api_key: form.api_key.trim(), app_id: form.app_id.trim(),
      });
      const rows = await base44.entities.IntegrationConfig.filter({ name: 'google_picker' });
      if ((rows || [])[0]) await base44.entities.IntegrationConfig.update(rows[0].id, { config: payload });
      else await base44.entities.IntegrationConfig.create({ name: 'google_picker', config: payload });
      qc.invalidateQueries({ queryKey: ['google-picker-config'] });
      toast.success('Picker configured');
      onOpenChange(false);
    } catch {
      toast.error('Could not save the picker settings');
    }
    setSaving(false);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[560px] max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderOpen className="w-4 h-4 text-primary" /> Browse my Drive</DialogTitle>
          <DialogDescription>
            Google's own file browser, opened against your live Google session. It needs only the non restricted drive.file scope, so there is no verification wall.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-[12px] font-medium text-foreground mb-2">One time setup in Google Cloud</div>
            <ol className="text-[12px] text-muted-foreground space-y-1.5 list-decimal pl-4 leading-relaxed">
              <li>Create or open a project at console.cloud.google.com.</li>
              <li>Enable the Google Picker API and the Google Drive API.</li>
              <li>Under Credentials, create an API key. Restrict it to the Picker and Drive APIs, and to this origin.</li>
              <li>Create an OAuth client ID of type Web application, with this authorised JavaScript origin: <code className="font-mono text-foreground break-all">{origin}</code></li>
              <li>On the OAuth consent screen, add the drive.file scope and add yourself as a test user. Testing mode is enough, no verification needed.</li>
              <li>The App ID below is the project number from the project dashboard.</li>
            </ol>
          </div>

          <div>
            <Label className="text-[12px]">OAuth Client ID *</Label>
            <Input
              value={form.client_id}
              onChange={(e) => setForm((p) => ({ ...p, client_id: e.target.value }))}
              placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
              className="mt-1 bg-background font-mono text-[12px]"
            />
          </div>
          <div>
            <Label className="text-[12px]">API Key *</Label>
            <Input
              value={form.api_key}
              onChange={(e) => setForm((p) => ({ ...p, api_key: e.target.value }))}
              placeholder="AIza..."
              className="mt-1 bg-background font-mono text-[12px]"
            />
          </div>
          <div>
            <Label className="text-[12px]">App ID (project number)</Label>
            <Input
              value={form.app_id}
              onChange={(e) => setForm((p) => ({ ...p, app_id: e.target.value }))}
              placeholder="Optional but recommended, e.g. 000000000000"
              className="mt-1 bg-background font-mono text-[12px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Small status line plus a configure button, for the sheets panel header.
export function GooglePickerStatus({ onConfigure }) {
  const { data: cfg } = useGooglePickerConfig();
  const ready = !!(cfg?.client_id && cfg?.api_key);
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[11px] inline-flex items-center gap-1 font-medium ${ready ? 'status-sold' : 'text-muted-foreground'}`}>
        {ready ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
        {ready ? 'Drive browsing ready' : 'Drive browsing not set up'}
      </span>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onConfigure}>
        <Settings2 className="w-3.5 h-3.5" /> {ready ? 'Edit' : 'Set up'}
      </Button>
    </div>
  );
}
