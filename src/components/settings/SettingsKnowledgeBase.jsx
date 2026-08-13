import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, BookOpen, FileText, StickyNote, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';

const KIND_META = {
  doc: { label: 'Document', icon: FileText },
  note: { label: 'Note', icon: StickyNote },
  glossary: { label: 'Glossary term', icon: BookOpen },
  template: { label: 'Disposition template', icon: MessageSquareText },
};

const empty = { title: '', kind: 'doc', term: '', content: '', active: true, sort_order: 0 };

export default function SettingsKnowledgeBase() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const { data: docs = [] } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: () => base44.entities.KnowledgeDoc.list('sort_order'),
  });

  const openNew = () => { setForm({ ...empty, sort_order: docs.length }); setOpen(true); };
  const openEdit = (d) => { setForm({ ...empty, ...d }); setOpen(true); };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    const { id, ...rest } = form;
    if (id) await base44.entities.KnowledgeDoc.update(id, rest);
    else await base44.entities.KnowledgeDoc.create(rest);
    qc.invalidateQueries({ queryKey: ['knowledge-docs'] });
    setOpen(false);
    toast.success('Saved');
  };

  const remove = async (d) => {
    await base44.entities.KnowledgeDoc.delete(d.id);
    qc.invalidateQueries({ queryKey: ['knowledge-docs'] });
    toast.success('Removed');
  };

  const toggle = async (d) => {
    await base44.entities.KnowledgeDoc.update(d.id, { active: !d.active });
    qc.invalidateQueries({ queryKey: ['knowledge-docs'] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-muted-foreground max-w-2xl">
          Add documents, notes, glossary terms and disposition/feedback templates. DataBot reads every active item as context when answering questions.
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" /> Add Item</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {docs.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground text-[13px] py-10 border border-dashed border-border rounded-[12px]">
            No knowledge items yet. Add docs, notes, glossary terms or templates for DataBot to use.
          </div>
        )}
        {docs.map(d => {
          const meta = KIND_META[d.kind] || KIND_META.doc;
          const Icon = meta.icon;
          return (
            <div key={d.id} className={`bg-card border border-border rounded-[12px] p-4 ${d.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4.5 h-4.5 text-primary" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(d)} className="text-[14px] font-semibold text-foreground truncate hover:underline text-left">{d.kind === 'glossary' && d.term ? d.term : d.title}</button>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">{meta.label}</Badge>
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{d.content || '—'}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Switch checked={d.active} onCheckedChange={() => toggle(d)} />
                  <button onClick={() => remove(d)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[520px]">
          <DialogHeader><DialogTitle>{form.id ? 'Edit' : 'Add'} Knowledge Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Type</Label>
              <Select value={form.kind} onValueChange={v => setForm(p => ({ ...p, kind: v }))}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.kind === 'glossary' && (
              <div><Label className="text-[12px]">Term</Label><Input value={form.term} onChange={e => setForm(p => ({ ...p, term: e.target.value }))} placeholder="e.g. CPL" className="mt-1 bg-background text-[13px]" /></div>
            )}
            <div><Label className="text-[12px]">Title</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Short title" className="mt-1 bg-background text-[13px]" /></div>
            <div><Label className="text-[12px]">{form.kind === 'glossary' ? 'Definition' : 'Content'}</Label><Textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={6} placeholder="What DataBot should know…" className="mt-1 bg-background text-[13px]" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}