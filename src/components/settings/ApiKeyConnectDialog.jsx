import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, Plug, Save, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// Reusable "connect via API key" dialog. Stores credentials in IntegrationConfig(name)
// and calls an optional verify function ({ ...fields, verify_only:true }) on connect.
// fields: [{ key, label, placeholder, secret, optional, help }]
export default function ApiKeyConnectDialog({ open, onOpenChange, name, title, description, fields, verifyFn, syncFn, syncLabel = 'Sync Now' }) {
  const qc = useQueryClient();
  const [values, setValues] = useState({});
  const [cfg, setCfg] = useState(null);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const list = await base44.entities.IntegrationConfig.filter({ name });
        const record = list[0] || null;
        setCfg(record);
        let parsed = {};
        try { parsed = JSON.parse(record?.config || '{}'); } catch { parsed = {}; }
        setMeta(parsed);
        // Prefill only non-secret fields (never re-expose stored secrets).
        const init = {};
        fields.forEach(f => { if (!f.secret) init[f.key] = parsed[f.key] || ''; else init[f.key] = ''; });
        setValues(init);
      } catch { setCfg(null); setMeta({}); }
      setLoading(false);
    })();
  }, [open, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const connected = !!cfg;

  const save = async () => {
    const missing = fields.filter(f => !f.optional && !String(values[f.key] || '').trim());
    if (missing.length) { toast.error(`${missing[0].label} is required`); return; }
    setSaving(true);
    try {
      // Verify credentials first if a verify function is provided.
      if (verifyFn) {
        const res = await verifyFn({ ...values, verify_only: true });
        const d = res?.data || {};
        if (!d.success) { toast.error(d.error || `Could not verify ${title}`); setSaving(false); return; }
      }
      // Merge with existing config so we keep secrets already stored if left blank.
      const nextConfig = { ...meta };
      fields.forEach(f => {
        const v = String(values[f.key] || '').trim();
        if (v) nextConfig[f.key] = v;
      });
      const payload = JSON.stringify(nextConfig);
      if (cfg?.id) await base44.entities.IntegrationConfig.update(cfg.id, { config: payload });
      else await base44.entities.IntegrationConfig.create({ name, config: payload });
      toast.success(`${title} connected`);
      qc.invalidateQueries({ queryKey: ['integration-status'] });
      onOpenChange(false);
      if (syncFn) { setSyncing(true); try { await syncFn({}); qc.invalidateQueries({ queryKey: ['bank-txns'] }); } catch { /* non-blocking */ } setSyncing(false); }
    } catch (e) {
      toast.error(e?.response?.data?.error || `Failed to connect ${title}`);
    }
    setSaving(false);
  };

  const runSync = async () => {
    if (!syncFn) return;
    setSyncing(true);
    try {
      const res = await syncFn({});
      const d = res?.data || {};
      if (d.success) toast.success(`${title} synced${d.ingested != null ? ` (${d.ingested} new)` : ''}`);
      else toast.error(d.error || 'Sync failed');
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Sync failed'); }
    setSyncing(false);
  };

  const disconnect = async () => {
    if (!cfg?.id) return;
    setSaving(true);
    try {
      await base44.entities.IntegrationConfig.delete(cfg.id);
      toast.success(`${title} disconnected`);
      qc.invalidateQueries({ queryKey: ['integration-status'] });
      onOpenChange(false);
    } catch { toast.error('Failed to disconnect'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{connected ? `Manage ${title}` : `Connect ${title}`}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-6 text-center text-muted-foreground text-[13px]">Loading...</div>
        ) : (
          <div className="space-y-3">
            {connected && (
              <div className="flex items-center gap-2 text-[12px]">
                <CheckCircle2 className="w-4 h-4 status-sold" /><span className="status-sold font-medium">Connected</span>
                {meta.last_synced_at && <span className="text-muted-foreground">· last synced {new Date(meta.last_synced_at).toLocaleString()}</span>}
              </div>
            )}
            {fields.map(f => (
              <div key={f.key}>
                <Label className="text-[12px]">{f.label}{f.optional ? ' (optional)' : ''}</Label>
                <Input
                  value={values[f.key] || ''}
                  onChange={e => setValues(p => ({ ...p, [f.key]: e.target.value }))}
                  type={f.secret ? 'password' : 'text'}
                  placeholder={connected && f.secret ? 'Leave blank to keep current' : f.placeholder}
                  className="mt-1 bg-background font-mono text-[12px]"
                />
                {f.help && <p className="text-[11px] text-muted-foreground mt-1.5">{f.help}</p>}
              </div>
            ))}
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          {connected && (
            <>
              <Button variant="ghost" className="text-destructive gap-1.5 mr-auto" onClick={disconnect} disabled={saving}><Trash2 className="w-3.5 h-3.5" /> Disconnect</Button>
              {syncFn && <Button variant="outline" className="gap-1.5" onClick={runSync} disabled={syncing}><RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncLabel}</Button>}
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {connected ? <><Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Update'}</> : <><Plug className="w-3.5 h-3.5" /> {saving ? 'Connecting...' : 'Connect'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}