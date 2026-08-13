import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { verticalColor } from '@/lib/tagColors';
import { TableShell, Row, Tag, EmptyRow } from '@/components/campaigns/campaignTable';
import RowActionsMenu from '@/components/campaigns/RowActionsMenu';
import SectionHeader from '@/components/shared/SectionHeader';
import RefreshButton from '@/components/shared/RefreshButton';

const V_TEMPLATE = '1.6fr 0.7fr 2fr 0.8fr 0.5fr';

const DEFAULT_FORM = { name: '', code: '', description: '', active: true };

export default function OperationsVerticals() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: verticals = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list('sort_order'),
  });

  const openCreate = () => { setForm(DEFAULT_FORM); setEditingId(null); setModal(true); };

  const openEdit = (v) => {
    setForm({ name: v.name || '', code: v.code || '', description: v.description || '', active: v.active ?? true });
    setEditingId(v.id);
    setModal(true);
  };

  const save = async () => {
    if (editingId) {
      await base44.entities.Vertical.update(editingId, form);
      toast.success('Vertical updated');
    } else {
      await base44.entities.Vertical.create(form);
      toast.success('Vertical created');
    }
    qc.invalidateQueries({ queryKey: ['verticals'] });
    setModal(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.Vertical.delete(deleteTarget.id);
    qc.invalidateQueries({ queryKey: ['verticals'] });
    toast.success('Vertical deleted');
    setDeleteTarget(null);
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ['verticals'] });

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Verticals" subtitle="Lead categories that segment inbound leads into delivery buckets.">
        <RefreshButton onClick={refresh} />
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Create Vertical</Button>
      </SectionHeader>

      <TableShell head={['Vertical', 'Code', 'Description', 'Status', '']} template={V_TEMPLATE}>
        {verticals.length === 0 && <EmptyRow>No verticals yet</EmptyRow>}
        {verticals.map((v, i) => (
          <Row key={v.id} template={V_TEMPLATE} i={i}>
            <span className="text-[13px] font-semibold text-foreground truncate">{v.name}</span>
            <span>
              <Badge className={`text-[10px] font-mono inline-flex items-center gap-1 ${verticalColor(v.code).badge}`}><span className={`w-1.5 h-1.5 rounded-full ${verticalColor(v.code).dot}`} />{v.code}</Badge>
            </span>
            <span className="text-[12px] text-muted-foreground truncate">{v.description || '-'}</span>
            <span>
              <Tag tone={v.active ? 'green' : 'slate'}>{v.active ? 'Active' : 'Inactive'}</Tag>
            </span>
            <span className="flex items-center justify-end">
              <RowActionsMenu onEdit={() => openEdit(v)} onDelete={() => setDeleteTarget(v)} />
            </span>
          </Row>
        ))}
      </TableShell>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vertical?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}". Deliveries filtered by this vertical will no longer match it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={modal} onOpenChange={(v) => { if (!v) setModal(false); }}>
        <DialogContent className="bg-popover border-border max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Vertical' : 'New Vertical'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] text-muted-foreground leading-relaxed">
              <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <span>
                Verticals segment leads into delivery buckets. The inbound payload's <code className="bg-muted px-1 rounded text-primary font-mono">vertical</code> field is matched against Deliveries configured with this vertical. Use the <strong>Code</strong> to match the exact value suppliers send (e.g. <code className="font-mono">MVA</code>, <code className="font-mono">WC</code>, <code className="font-mono">DEBT</code>).
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[12px]">Vertical Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Motor Vehicle Accidents" className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Code *</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. MVA" className="mt-1 bg-background font-mono text-[12px]" /></div>
            </div>
            <div><Label className="text-[12px]">Description</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What this vertical covers..." className="mt-1 bg-background text-[12px]" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} /><Label className="text-[12px]">Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || !form.code} className="gap-1.5"><Save className="w-4 h-4" /> {editingId ? 'Save Changes' : 'Create Vertical'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}