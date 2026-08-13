import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Save, Trash2, ArrowDownUp } from 'lucide-react';
import { toast } from 'sonner';
import { brandColor } from '@/lib/tagColors';
import ImportExportDialog from '@/components/shared/ImportExportDialog';
import { TableShell, Row, Tag, EmptyRow } from '@/components/campaigns/campaignTable';

const B_TEMPLATE = '1.5fr 0.7fr 1.6fr 0.8fr 0.7fr 0.8fr 1.2fr';

const DEFAULT_FORM = {
  brand_name: '', brand_code: '', website_url: '', optin_url: '',
  supplier_names: [], facebook_pages_text: '', instagram_accounts_text: '', active: true,
};

function parseArr(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

function textToArr(t) {
  return String(t || '').split(',').map(s => s.trim()).filter(Boolean);
}

export default function CampaignBrands() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [ioOpen, setIoOpen] = useState(false);

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => base44.entities.Brand.list('-created_date'),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const openCreate = () => { setForm(DEFAULT_FORM); setEditingId(null); setModal(true); };

  const openEdit = (brand) => {
    setForm({
      brand_name: brand.brand_name || '',
      brand_code: brand.brand_code || '',
      website_url: brand.website_url || '',
      optin_url: brand.optin_url || '',
      supplier_names: parseArr(brand.supplier_names),
      facebook_pages_text: parseArr(brand.facebook_pages).join(', '),
      instagram_accounts_text: parseArr(brand.instagram_accounts).join(', '),
      active: brand.active ?? true,
    });
    setEditingId(brand.id);
    setModal(true);
  };

  const save = async () => {
    const payload = {
      brand_name: form.brand_name,
      brand_code: form.brand_code,
      website_url: form.website_url,
      optin_url: form.optin_url,
      supplier_names: JSON.stringify(form.supplier_names || []),
      facebook_pages: JSON.stringify(textToArr(form.facebook_pages_text)),
      instagram_accounts: JSON.stringify(textToArr(form.instagram_accounts_text)),
      active: form.active,
    };
    if (editingId) {
      await base44.entities.Brand.update(editingId, payload);
      toast.success('Brand updated');
    } else {
      await base44.entities.Brand.create(payload);
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
      <div className="flex justify-end gap-2 mb-4">
        <Button size="sm" variant="outline" onClick={() => setIoOpen(true)} className="gap-1.5"><ArrowDownUp className="w-4 h-4" /> Import / Export Fields</Button>
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Create Brand</Button>
      </div>

      <ImportExportDialog
        open={ioOpen}
        onOpenChange={setIoOpen}
        entityName="Brand"
        records={brands}
        matchKey="brand_name"
        labelKey="brand_name"
        exportPrefix="brands"
        queryKeys={[['brands']]}
        title="Import / Export Brands"
      />

      <TableShell head={['Brand Name', 'Code', 'Website', 'Suppliers', 'FB / IG', 'Status', 'Actions']} template={B_TEMPLATE}>
        {brands.length === 0 && <EmptyRow>No brands yet</EmptyRow>}
        {brands.map((b, i) => {
          const fb = parseArr(b.facebook_pages).length;
          const ig = parseArr(b.instagram_accounts).length;
          return (
            <Row key={b.id} template={B_TEMPLATE} i={i}>
              <span className="text-[13px] font-semibold text-foreground truncate">{b.brand_name}</span>
              <span><Badge className={`text-[10px] font-mono ${brandColor(b.brand_code).badge}`}>{b.brand_code}</Badge></span>
              <span className="font-mono text-[11px] text-muted-foreground truncate">{b.website_url || '-'}</span>
              <span className="text-right font-mono text-[12px] text-muted-foreground">{parseArr(b.supplier_names).length || 0}</span>
              <span className="text-right font-mono text-[12px] text-muted-foreground">{fb} / {ig}</span>
              <span><Tag tone={b.active ? 'green' : 'slate'}>{b.active ? 'Active' : 'Inactive'}</Tag></span>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(b)} className="h-7 text-[11px] px-2">Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(b)} className="h-7 text-[11px] px-2 text-muted-foreground">{b.active ? 'Deactivate' : 'Activate'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(b)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
              </span>
            </Row>
          );
        })}
      </TableShell>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete brand?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete "{deleteTarget?.brand_name}". This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={modal} onOpenChange={(v) => { if (!v) setModal(false); }}>
        <DialogContent className="bg-popover border-border max-w-[520px]">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Brand' : 'New Brand'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[12px]">Brand Name *</Label><Input value={form.brand_name} onChange={e => setForm(p => ({ ...p, brand_name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Brand Code *</Label><Input value={form.brand_code} onChange={e => setForm(p => ({ ...p, brand_code: e.target.value }))} placeholder="e.g. CAC" className="mt-1 bg-background font-mono text-[12px]" /></div>
            </div>
            <div><Label className="text-[12px]">Website URL</Label><Input value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            <div><Label className="text-[12px]">Optin URL</Label><Input value={form.optin_url} onChange={e => setForm(p => ({ ...p, optin_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            <div>
              <Label className="text-[12px]">Linked Suppliers</Label>
              <MultiSelect
                value={form.supplier_names}
                onValueChange={v => setForm(p => ({ ...p, supplier_names: v }))}
                className="mt-1 bg-background"
                placeholder="Select suppliers…"
                options={suppliers.map(s => ({ value: s.name, label: s.name }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[12px]">Facebook Pages</Label><Input value={form.facebook_pages_text} onChange={e => setForm(p => ({ ...p, facebook_pages_text: e.target.value }))} placeholder="comma separated" className="mt-1 bg-background text-[12px]" /></div>
              <div><Label className="text-[12px]">Instagram Accounts</Label><Input value={form.instagram_accounts_text} onChange={e => setForm(p => ({ ...p, instagram_accounts_text: e.target.value }))} placeholder="comma separated" className="mt-1 bg-background text-[12px]" /></div>
            </div>
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