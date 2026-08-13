import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, X, Save, Shield, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_IGNORE = [
  'key', 'api_key', 'apikey', 'x_key', 'x-api-key',
  'authorization', 'auth', 'bearer', 'token',
  'secret', 'password', 'sig', 'signature',
];

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function SettingsIgnoreList() {
  const qc = useQueryClient();
  const [entries, setEntries] = useState([]);
  const [newEntry, setNewEntry] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || null;
    },
  });

  useEffect(() => {
    if (settings) {
      setEnabled(settings.adaptive_fields_enabled !== false);
      const list = parseJsonArray(settings.adaptive_fields_ignore_list);
      setEntries(list.length > 0 ? list : [...DEFAULT_IGNORE]);
    } else {
      setEntries([...DEFAULT_IGNORE]);
    }
  }, [settings]);

  const addEntry = () => {
    const val = newEntry.trim().toLowerCase();
    if (!val) return;
    if (entries.map(e => e.toLowerCase()).includes(val)) {
      toast.error('Already in ignore list');
      return;
    }
    setEntries([...entries, val]);
    setNewEntry('');
  };

  const removeEntry = (idx) => {
    setEntries(entries.filter((_, i) => i !== idx));
  };

  const resetToDefaults = () => setEntries([...DEFAULT_IGNORE]);

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        adaptive_fields_enabled: enabled,
        adaptive_fields_ignore_list: JSON.stringify(entries),
      };
      if (settings) {
        await base44.entities.AppSettings.update(settings.id, data);
      } else {
        await base44.entities.AppSettings.create(data);
      }
      qc.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('Adaptive fields settings saved');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-[14px] font-semibold text-foreground">Adaptive Fields</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-[12px] text-muted-foreground">{enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Inbound keys matching this list are never auto-cataloged or forwarded. Deleted fields are added here automatically so they never regenerate.
        </p>
        <div className="flex flex-wrap gap-2">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-1 bg-muted border border-border rounded-md pl-2.5 pr-1 py-1">
              <span className="font-mono text-[11px] text-foreground">{entry}</span>
              <button onClick={() => removeEntry(idx)} className="text-muted-foreground hover:text-destructive ml-1">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newEntry}
            onChange={e => setNewEntry(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
            placeholder="Add field name to ignore..."
            className="bg-background font-mono text-[12px] flex-1"
          />
          <Button size="sm" variant="outline" onClick={addEntry} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add</Button>
        </div>
        <div className="flex justify-between items-center">
          <Button size="sm" variant="ghost" onClick={resetToDefaults} className="gap-1.5 text-[11px]"><RotateCcw className="w-3 h-3" /> Reset to defaults</Button>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5"><Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}