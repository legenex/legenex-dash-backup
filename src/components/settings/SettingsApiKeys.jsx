import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, RefreshCw, Trash2, ShieldCheck, Terminal, Pencil, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Panel, riseIn } from '@/components/settings/settingsUi';

function generateKey(type = 'supplier', supplierType = '') {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let prefix = 'lgnx_ext_';
  if (type === 'master') prefix = 'lgnx_mst_';
  else if (supplierType === 'Internal') prefix = 'lgnx_int_';
  else if (supplierType === 'Calls') prefix = 'lgnx_cls_';
  let key = prefix;
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

function KeyRevealBox({ fullKey, onClose }) {
  return (
    <div className="space-y-4">
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="text-[13px] font-semibold text-primary">Copy your key now - it won't be shown again</span>
        </div>
        <div className="font-mono text-[12px] text-foreground break-all bg-background rounded-md p-3 border border-border mt-1">
          {fullKey}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Store this securely. After closing this dialog only the prefix will be visible.
        </p>
      </div>
      <Button className="w-full gap-2" onClick={() => { navigator.clipboard.writeText(fullKey); toast.success('Key copied!'); }}>
        <Copy className="w-4 h-4" /> Copy Key
      </Button>
      <Button variant="ghost" className="w-full" onClick={onClose}>Done</Button>
    </div>
  );
}

export default function SettingsApiKeys() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'supplier', supplier_id: '', vertical: '', active: true });
  const [editingKeyId, setEditingKeyId] = useState(null);
  const [revealKey, setRevealKey] = useState(null); // full key string to show once
  const [regenReveal, setRegenReveal] = useState(null); // { key, id }
  const [supplierCreateOpen, setSupplierCreateOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', supplier_type: 'External', sid: '', vertical: '', active: true });

  const { data: apiKeys = [] } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => base44.entities.ApiKey.list('-created_date', 200),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date', 200),
  });

  const { data: verticalList = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list(),
  });
  const verticalOptions = verticalList.map(v => ({ value: v.code, label: v.name }));

  const { data: appSettingsArr = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const baseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';
  const endpointUrl = `${baseUrl}/functions/leads`;

  const openCreate = () => {
    setForm({ name: '', type: 'supplier', supplier_id: '', vertical: '', active: true, expose_revenue: false });
    setEditingKeyId(null);
    setRevealKey(null);
    setModalOpen(true);
  };

  const openEdit = (k) => {
    setForm({
      name: k.name || '',
      type: k.type || 'supplier',
      supplier_id: k.supplier_id || '',
      vertical: k.vertical || '',
      active: k.active ?? true,
      expose_revenue: k.expose_revenue ?? false,
    });
    setEditingKeyId(k.id);
    setRevealKey(null);
    setModalOpen(true);
  };

  const handleSaveEdit = async () => {
    const supplier = form.supplier_id ? suppliers.find(s => s.id === form.supplier_id) : null;
    await base44.entities.ApiKey.update(editingKeyId, {
      name: form.name,
      type: form.type,
      supplier_id: form.type === 'master' ? '' : (supplier?.id || ''),
      supplier_name: form.type === 'master' ? 'Master' : (supplier?.name || ''),
      vertical: form.vertical,
      active: form.active,
      expose_revenue: form.expose_revenue ?? false,
    });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success('Key updated');
    setEditingKeyId(null);
    setModalOpen(false);
  };

  const handleCreateSupplier = async () => {
    const created = await base44.entities.Supplier.create({
      name: supplierForm.name,
      sid: supplierForm.sid,
      supplier_type: supplierForm.supplier_type,
      vertical: supplierForm.vertical,
      active: supplierForm.active,
    });
    await qc.invalidateQueries({ queryKey: ['suppliers'] });
    setForm(p => ({ ...p, supplier_id: created.id }));
    setSupplierCreateOpen(false);
    setSupplierForm({ name: '', supplier_type: 'External', sid: '', vertical: '', active: true });
    toast.success('Supplier created - linked to key');
  };

  const handleCreate = async () => {
    const supplier = form.supplier_id ? suppliers.find(s => s.id === form.supplier_id) : null;
    const key = generateKey(form.type, supplier?.supplier_type || '');
    await base44.entities.ApiKey.create({
      name: form.name,
      type: form.type,
      supplier_id: supplier?.id || '',
      supplier_name: supplier?.name || (form.type === 'master' ? 'Master' : ''),
      vertical: form.vertical,
      key,
      key_prefix: key.substring(0, 16),
      active: true,
      expose_revenue: form.expose_revenue ?? false,
      request_count: 0,
    });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    setRevealKey(key);
  };

  const handleRegenerate = async (k) => {
    const supplier = k.supplier_id ? suppliers.find(s => s.id === k.supplier_id) : null;
    const key = generateKey(k.type, supplier?.supplier_type || '');
    await base44.entities.ApiKey.update(k.id, {
      key,
      key_prefix: key.substring(0, 16),
      request_count: 0,
      last_used_at: null,
    });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    setRegenReveal({ key, id: k.id });
  };

  const toggleActive = async (k) => {
    await base44.entities.ApiKey.update(k.id, { active: !k.active });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success(k.active ? 'Key deactivated' : 'Key activated');
  };

  const handleDelete = async (k) => {
    await base44.entities.ApiKey.delete(k.id);
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success('Key deleted');
  };

  const curlExample = `curl -X POST ${endpointUrl} \\
  -H "X-API-KEY: lgnx_ext_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"first_name":"Jane","last_name":"Doe","mobile":"5550001234","email":"jane@example.com","zip":"90210"}'`;

  return (
    <div className="space-y-6">
      {/* Auth info panel */}
      <div className="bg-card border border-border rounded-[10px] p-5 space-y-4">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">How Suppliers Authenticate</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-foreground">HTTP Header</div>
                <code className="text-[12px] text-primary bg-primary/10 px-2 py-0.5 rounded mt-1 block">X-API-KEY: &lt;your-key&gt;</code>
                <p className="text-[11px] text-muted-foreground mt-1">Also accepted: HTTP Basic Auth (username = key, password = blank).</p>
              </div>
            </div>
            <div className="flex items-start gap-2 mt-2">
              <div className="w-4 shrink-0" />
              <div className="text-[11px] text-muted-foreground bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1.5 text-yellow-300">
                ⚠ This is the <strong>Gateway API key</strong> generated here - <strong>not</strong> the LeadByte <code className="font-mono">X_KEY</code> header configured in the LeadByte connector settings.
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Terminal className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-foreground mb-1">Endpoint</div>
                <div className="flex items-center gap-2">
                  <code className="text-[12px] text-primary bg-primary/10 px-2 py-0.5 rounded font-mono flex-1 break-all">{endpointUrl}</code>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(endpointUrl); toast.success('Copied'); }}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Example cURL</div>
          <div className="relative group">
            <pre className="bg-background border border-border rounded-lg p-3 font-mono text-[11px] text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">{curlExample}</pre>
            <Button size="sm" variant="ghost" className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => { navigator.clipboard.writeText(curlExample); toast.success('Copied'); }}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Keys table */}
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Create Key</Button>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Name', 'Type', 'Linked Supplier', 'Prefix', 'Active', 'Last Used', 'Requests', 'Created', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {apiKeys.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No API keys yet</td></tr>
            )}
            {apiKeys.map(k => (
              <tr key={k.id} className="hover:bg-accent/40 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{k.name || k.supplier_name || '-'}</td>
                <td className="px-4 py-3">
                  {k.type === 'master'
                    ? <Badge className="bg-primary/20 text-primary text-[10px] border-0">Master</Badge>
                    : <Badge className="bg-accent text-muted-foreground text-[10px] border border-border">Supplier</Badge>
                  }
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[12px]">{k.supplier_name && k.type !== 'master' ? k.supplier_name : '-'}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{k.key_prefix}…</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={k.active ? 'status-sold bg-status-sold text-[10px]' : 'text-muted-foreground text-[10px]'}>
                    {k.active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  {k.last_used_at ? format(new Date(k.last_used_at), 'MMM dd HH:mm') : '-'}
                </td>
                <td className="px-4 py-3 font-mono text-[12px]">{k.request_count || 0}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  {k.created_date ? format(new Date(k.created_date), 'MMM dd yyyy') : '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" title="Copy full key"
                      onClick={() => {
                        if (k.key) {
                          navigator.clipboard.writeText(k.key);
                          toast.success('Full API key copied');
                        } else {
                          navigator.clipboard.writeText(k.key_prefix);
                          toast.error('Full key unavailable - copied prefix only');
                        }
                      }}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" title="Regenerate"
                      onClick={() => handleRegenerate(k)}>
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" title="Edit"
                      onClick={() => openEdit(k)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground"
                      onClick={() => toggleActive(k)}>
                      {k.active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(k)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Key Modal */}
      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v && !revealKey) { setModalOpen(false); setEditingKeyId(null); } }}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{revealKey ? 'Key Created' : editingKeyId ? 'Edit API Key' : 'Create API Key'}</DialogTitle>
          </DialogHeader>

          {revealKey ? (
            <KeyRevealBox fullKey={revealKey} onClose={() => { setRevealKey(null); setModalOpen(false); }} />
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <Label className="text-[12px]">Name / Label *</Label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Acme Corp Key" className="mt-1 bg-background" />
                </div>
                <div>
                  <Label className="text-[12px]">Type</Label>
                  <SearchableSelect
                    value={form.type}
                    onValueChange={v => setForm(p => ({ ...p, type: v, supplier_id: '' }))}
                    className="mt-1 bg-background"
                    options={[
                      { value: 'master', label: 'Master - no linked supplier, leads recorded as "Master"' },
                      { value: 'supplier', label: 'Supplier - attributed to a specific supplier' },
                    ]}
                  />
                </div>
                {form.type === 'supplier' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-[12px]">Linked Supplier</Label>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1 text-primary"
                        onClick={() => setSupplierCreateOpen(true)}>
                        <UserPlus className="w-3 h-3" /> Create New Supplier
                      </Button>
                    </div>
                    <SearchableSelect
                      value={form.supplier_id}
                      onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))}
                      className="mt-1 bg-background"
                      placeholder="Select supplier…"
                      options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                    />
                  </div>
                )}
                <div>
                  <Label className="text-[12px]">Vertical (optional)</Label>
                  <SearchableSelect
                    value={form.vertical}
                    onValueChange={v => setForm(p => ({ ...p, vertical: v }))}
                    className="mt-1 bg-background"
                    placeholder="Any vertical"
                    options={[{ value: '', label: 'Any vertical' }, ...verticalOptions]}
                  />
                </div>
                {editingKeyId && (
                  <div className="flex items-center gap-2">
                    <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
                    <Label className="text-[12px]">Active</Label>
                  </div>
                )}
                {form.type === 'supplier' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Switch checked={form.expose_revenue ?? false} onCheckedChange={v => setForm(p => ({ ...p, expose_revenue: v }))} />
                      <Label className="text-[12px]">Expose revenue in supplier response</Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Per-key override. Master keys and Internal suppliers already receive revenue.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setModalOpen(false); setEditingKeyId(null); }}>Cancel</Button>
                {editingKeyId ? (
                  <Button onClick={handleSaveEdit} disabled={!form.name || (form.type === 'supplier' && !form.supplier_id)}>
                    Save Changes
                  </Button>
                ) : (
                  <Button onClick={handleCreate} disabled={!form.name || (form.type === 'supplier' && !form.supplier_id)}>
                    Generate Key
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Regenerate reveal modal */}
      <Dialog open={!!regenReveal} onOpenChange={(v) => { if (!v) setRegenReveal(null); }}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader><DialogTitle>New Key Generated</DialogTitle></DialogHeader>
          {regenReveal && (
            <KeyRevealBox fullKey={regenReveal.key} onClose={() => setRegenReveal(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Nested Create New Supplier modal */}
      <Dialog open={supplierCreateOpen} onOpenChange={setSupplierCreateOpen}>
        <DialogContent className="bg-popover border-border max-w-[460px]">
          <DialogHeader><DialogTitle>Create New Supplier</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-[12px]">Name *</Label><Input value={supplierForm.name} onChange={e => setSupplierForm(p => ({ ...p, name: e.target.value }))} className="mt-1 bg-background" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Supplier Type *</Label>
                <SearchableSelect
                  value={supplierForm.supplier_type}
                  onValueChange={v => setSupplierForm(p => ({ ...p, supplier_type: v }))}
                  className="mt-1 bg-background"
                  options={[{ value: 'Internal', label: 'Internal' }, { value: 'External', label: 'External' }, { value: 'Calls', label: 'Calls' }]}
                />
              </div>
              <div><Label className="text-[12px]">SID</Label><Input value={supplierForm.sid} onChange={e => setSupplierForm(p => ({ ...p, sid: e.target.value }))} className="mt-1 bg-background" /></div>
            </div>
            <div>
              <Label className="text-[12px]">Vertical (optional)</Label>
              <SearchableSelect
                value={supplierForm.vertical}
                onValueChange={v => setSupplierForm(p => ({ ...p, vertical: v }))}
                className="mt-1 bg-background"
                placeholder="Any vertical"
                options={[{ value: '', label: 'Any vertical' }, ...verticalOptions]}
              />
            </div>
            <div className="flex items-center gap-2"><Switch checked={supplierForm.active} onCheckedChange={v => setSupplierForm(p => ({ ...p, active: v }))} /><Label className="text-[12px]">Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSupplierCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSupplier} disabled={!supplierForm.name || !supplierForm.supplier_type}>Create Supplier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}