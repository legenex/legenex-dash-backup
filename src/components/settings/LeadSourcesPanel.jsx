import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Phone, Plus, Pencil, Trash2, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import CallSourceDialog from '@/components/settings/CallSourceDialog';

// Call platform webhooks (Ringba, TrueCall). Google Sheets sources live in
// GoogleSheetsPanel, because a sheet now serves several purposes and needs its
// own surface. Both read the same LeadSource entity.
const KIND_META = {
  ringba: { label: 'Ringba' },
  truecall: { label: 'TrueCall' },
};

export default function LeadSourcesPanel() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState({ open: false, source: null, provider: 'ringba' });

  const { data: allSources = [] } = useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => (await base44.entities.LeadSource.list('-created_date', 200)) || [],
  });
  const { data: appSettingsArr = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => (await base44.entities.AppSettings.list()) || [],
  });
  const baseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';

  const sources = useMemo(
    () => (allSources || []).filter((s) => s.kind === 'ringba' || s.kind === 'truecall'),
    [allSources],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ['lead-sources'] });

  const toggleEnabled = async (s) => {
    await base44.entities.LeadSource.update(s.id, { enabled: !s.enabled });
    refresh();
  };

  const remove = async (s) => {
    await base44.entities.LeadSource.delete(s.id);
    toast.success('Source removed');
    refresh();
  };

  const copyEndpoint = (s) => {
    navigator.clipboard.writeText(`${baseUrl}/functions/callWebhook?key=${s.webhook_key}`);
    toast.success('Endpoint URL copied');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] text-muted-foreground max-w-2xl">
          Call platforms that post inbound calls to this workspace. Calls flow through the same processing pipeline as the API and LeadByte, so validation, dedup, conversion events and revenue all run.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog({ open: true, source: null, provider: 'ringba' })}>
            <Plus className="w-3.5 h-3.5" /> Ringba
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog({ open: true, source: null, provider: 'truecall' })}>
            <Plus className="w-3.5 h-3.5" /> TrueCall
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {sources.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Phone className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <div className="text-[13px] text-muted-foreground">No call platforms connected yet.</div>
          </div>
        ) : sources.map((s) => {
          const meta = KIND_META[s.kind] || { label: s.kind };
          return (
            <div key={s.id} className="border-b border-border last:border-b-0 px-4 py-3 hover:bg-accent transition-colors">
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-foreground truncate">{s.name}</span>
                    <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-primary">{meta.label}</span>
                    {!s.enabled && (
                      <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Paused</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {s.supplier_name || 'No supplier'}
                    {s.last_synced_at ? ` \u00b7 ${formatDistanceToNow(new Date(s.last_synced_at), { addSuffix: true })}` : ' \u00b7 no calls yet'}
                    {` \u00b7 ${s.ingested_count || 0} ingested`}
                  </div>
                </div>
                <Switch checked={!!s.enabled} onCheckedChange={() => toggleEnabled(s)} />
                {s.webhook_key && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent" title="Copy endpoint URL" onClick={() => copyEndpoint(s)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent" title="Edit" onClick={() => setDialog({ open: true, source: s, provider: s.kind })}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" title="Remove" onClick={() => remove(s)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <CallSourceDialog
        open={dialog.open}
        source={dialog.source}
        provider={dialog.provider}
        onOpenChange={(v) => setDialog((p) => ({ ...p, open: v }))}
        onSaved={refresh}
      />
    </div>
  );
}
