import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { brandColor } from '@/lib/tagColors';

const DEFAULT_FORM = {
  brand_name: '', brand_code: '', website_url: '', optin_url: '', active: true,
};

export default function SettingsBrands() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => base44.entities.Brand.list('-created_date'),
  });

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setModal(true);
  };

  const openEdit = (brand) => {
    setForm({
      brand_name: brand.brand_name || '',
      brand_code: brand.brand_code || '',
      website_url: brand.website_url || '',
      optin_url: brand.optin_url || '',
      active: brand.active ?? true,
    });
    setEditingId(brand.id);
    setModal(true);
  };

  const save = async () => {
    if (editingId) {
      await base44.entities.Brand.update(editingId, form);
      toast.success('Brand updated');
    } else {
      await base44.entities.Brand.create(form);
      toast.success('Brand created');
    }
    qc.invalidateQueries({ queryKey: ['brands'] });
    setModal(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.Brand.delete(deleteTarget.id);
    qc.invalidateQueries({ queryKey: ['brands'] });
    toast.success('Brand deleted');
    setDeleteTarget(null);
  };

  const toggleActive = async (brand) => {
    await base44.entities.Brand.update(brand.id, { active: !brand.active });
    qc.invalidateQueries({ queryKey: ['brands'] });
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Add Brand</Button>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Brand Name', 'Brand Code', 'Website', 'Optin URL', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {brands.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No brands yet</td></tr>
            )}
            {brands.map(b => (
              <tr key={b.id} className="hover:bg-accent/40 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{b.brand_name}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] font-mono ${brandColor(b.brand_code).badge}`}>{b.brand_code}</Badge></td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">{b.website_url || '-'}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">{b.optin_url || '-'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={`text-[9px] ${b.active ? 'status-sold bg-status-sold' : 'text-muted-foreground'}`}>
                    {b.active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(b)} className="h-7 text-[11px] px-2">Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(b)} className="h-7 text-[11px] px-2 text-muted-foreground">
                      {b.active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(b)} className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Delete Brand"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete brand?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.brand_name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={modal} onOpenChange={(v) => { if (!v) setModal(false); }}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Brand' : 'New Brand'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[12px]">Brand Name *</Label><Input value={form.brand_name} onChange={e => setForm(p => ({ ...p, brand_name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Brand Code *</Label><Input value={form.brand_code} onChange={e => setForm(p => ({ ...p, brand_code: e.target.value }))} placeholder="e.g. CAC" className="mt-1 bg-background font-mono text-[12px]" /></div>
            </div>
            <div><Label className="text-[12px]">Website URL</Label><Input value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            <div><Label className="text-[12px]">Optin URL</Label><Input value={form.optin_url} onChange={e => setForm(p => ({ ...p, optin_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} /><Label className="text-[12px]">Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.brand_name || !form.brand_code} className="gap-1.5"><Save className="w-4 h-4" /> {editingId ? 'Save Changes' : 'Create Brand'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}