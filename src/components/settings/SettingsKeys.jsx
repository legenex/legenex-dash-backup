import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

function generateKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'lgnx_sk_';
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

export default function SettingsKeys() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(null);

  const { data: keys = [] } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => base44.entities.ApiKey.list('-created_date'),
  });

  const handleGenerate = () => {
    const key = generateKey();
    setNewKey(key);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    await base44.entities.ApiKey.create({
      supplier_name: newSupplier,
      key: newKey,
      key_prefix: newKey.substring(0, 16),
      active: true,
      request_count: 0,
    });
    toast.success('API key created');
    setCreateOpen(false);
    setNewSupplier('');
    qc.invalidateQueries({ queryKey: ['api-keys'] });
  };

  const toggleActive = async (key) => {
    await base44.entities.ApiKey.update(key.id, { active: !key.active });
    toast.success(key.active ? 'Key revoked' : 'Key activated');
    qc.invalidateQueries({ queryKey: ['api-keys'] });
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={handleGenerate} className="gap-1.5"><Plus className="w-4 h-4" /> Generate Key</Button>
      </div>

      <div className="space-y-3">
        {keys.map(k => (
          <div key={k.id} className="bg-card border border-border rounded-[10px] p-4 flex items-center justify-between">
            <div>
              <div className="text-[14px] font-medium text-foreground">{k.supplier_name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[12px] text-muted-foreground">
                  {showKey === k.id ? k.key : `${k.key_prefix}${'*'.repeat(20)}`}
                </span>
                <button onClick={() => setShowKey(showKey === k.id ? null : k.id)} className="text-muted-foreground hover:text-foreground">
                  {showKey === k.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => { navigator.clipboard.writeText(k.key); toast.success('Key copied'); }} className="text-muted-foreground hover:text-foreground">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-3 mt-2 text-[11px] text-muted-foreground">
                <span>Requests: <span className="font-mono">{k.request_count || 0}</span></span>
                {k.last_used_at && <span>Last used: {format(new Date(k.last_used_at), 'MMM dd HH:mm')}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={k.active ? 'status-sold bg-status-sold' : 'text-muted-foreground'}>
                {k.active ? 'Active' : 'Revoked'}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => toggleActive(k)}>
                {k.active ? 'Revoke' : 'Activate'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-popover border-border max-w-[450px]">
          <DialogHeader><DialogTitle>New API Key</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-[12px]">Supplier Name</Label><Input value={newSupplier} onChange={e => setNewSupplier(e.target.value)} placeholder="Supplier name" className="mt-1 bg-background" /></div>
            <div>
              <Label className="text-[12px]">Generated Key</Label>
              <div className="mt-1 p-3 bg-background rounded-lg border border-border font-mono text-[12px] text-foreground break-all">{newKey}</div>
              <p className="text-[11px] text-muted-foreground mt-1">Copy this key now. It will only show the prefix after creation.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newSupplier}>Create Key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}