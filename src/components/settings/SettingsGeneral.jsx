import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Save, Building2, Shield, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, Input, Toggle } from '@/components/settings/settingsUi';

export default function SettingsGeneral() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: settingsArr = [], isSuccess } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const settings = (Array.isArray(settingsArr) ? settingsArr : [])[0] || {};
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (isSuccess && !form) {
      setForm({
        brand_name: settings.brand_name || '',
        brand_tagline: settings.brand_tagline || '',
        public_base_url: settings.public_base_url || '',
        default_fail_mode: settings.default_fail_mode || 'fail_open',
        require_trustedform_cert: settings.require_trustedform_cert ?? true,
        fb_api_version: settings.fb_api_version || 'v25.0',
        fb_api_version_auto: settings.fb_api_version_auto ?? true,
      });
    }
  }, [isSuccess]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.id) {
        await base44.entities.AppSettings.update(settings.id, form);
      } else {
        await base44.entities.AppSettings.create(form);
      }
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['app-settings'] });
    } catch (err) {
      toast.error(`Save failed: ${err.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  if (!form) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const set = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-5">
        <Panel className="p-5" i={0}>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground mb-4">
            <Building2 className="w-4 h-4 text-primary" /> Brand
          </div>
          <div className="space-y-4">
            <Input label="Brand Name" value={form.brand_name} onChange={set('brand_name')} placeholder="Legenex" />
            <Input label="Brand Tagline" value={form.brand_tagline} onChange={set('brand_tagline')} placeholder="Lead Gateway" />
          </div>
        </Panel>

        <Panel className="p-5" i={1}>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground mb-4">
            <Globe className="w-4 h-4 text-primary" /> Endpoint
          </div>
          <Input label="Public Base URL" value={form.public_base_url} onChange={set('public_base_url')} mono placeholder="https://api.legenex.com" hint="The public URL suppliers send leads to." />
        </Panel>

        <Panel className="p-5" i={2}>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground mb-4">
            <Shield className="w-4 h-4 text-primary" /> Pipeline Defaults
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Default Fail Mode</div>
              <SearchableSelect
                value={form.default_fail_mode}
                onValueChange={set('default_fail_mode')}
                className="w-full bg-background"
                options={[
                  { value: 'fail_open', label: 'Fail Open - continue without data' },
                  { value: 'fail_closed', label: 'Fail Closed - stop and error' },
                  { value: 'forward_blank', label: 'Forward Blank - send empty fields' },
                ]}
              />
              <p className="text-[11px] text-muted-foreground mt-1">What happens when an external lookup (HLR, etc.) fails.</p>
            </div>
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
              <div>
                <Label className="text-[12px]">Require TrustedForm Cert</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Leads without a valid cert are queued before delivery.</p>
              </div>
              <Toggle checked={form.require_trustedform_cert} onChange={set('require_trustedform_cert')} />
            </div>
          </div>
        </Panel>

        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <div>
        <Panel className="p-5" i={3}>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground mb-3">
            <Shield className="w-4 h-4 text-primary" /> Lead Route Reference
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">Set <code className="bg-muted px-1 rounded text-primary font-mono">lead_route</code> in the inbound payload to control routing. Matching uses a case-insensitive "contains" filter.</p>
          <div className="space-y-2">
            {[
              ['standard', 'Goes to Leadbyte (default)'],
              ['direct', 'Bypasses Leadbyte and allows all other delivery / event processing'],
              ['data', 'Allows leads to be sent to data partners'],
              ['internal', 'Sends lead to the system only. No webhooks, deliveries or conversion events fire.'],
              ['event', 'Only allows leads to be sent to Conversion Events'],
              ['queue', 'Holds lead for manual processing'],
              ['test', 'Sends test lead to system and does nothing else - sits in system for testing'],
            ].map(([val, desc]) => (
              <div key={val} className="border border-border rounded-md p-2.5">
                <div className="font-mono text-[12px] text-primary font-semibold">{val}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}