import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, BookOpen, FileText, StickyNote, MessageSquareText, Upload, Sparkles, FileJson, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const KIND_META = {
  doc: { label: 'Document', icon: FileText },
  note: { label: 'Note', icon: StickyNote },
  glossary: { label: 'Glossary term', icon: BookOpen },
  template: { label: 'Template', icon: MessageSquareText },
};

// Semantic status tokens, not raw palette utilities. See DESIGN-SYSTEM.md:
// raw Tailwind colours do not follow the light theme and are blocked by the
// design-token gate.
const SOURCE_BADGE = {
  file_upload: 'bg-status-duplicate status-duplicate',
  json_upload: 'bg-status-queued status-queued',
  ai_generated: 'bg-status-sold status-sold',
};

const empty = { title: '', kind: 'doc', term: '', content: '', active: true, sort_order: 0, file_url: '', source_type: 'manual' };

export default function KnowledgeBasePanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [generating, setGenerating] = useState(false);

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

  const onUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      let title = file.name;
      let content = '';
      try {
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } } },
        });
        if (result.status === 'success' && result.output) {
          title = result.output.title || title;
          content = typeof result.output.content === 'string' ? result.output.content : JSON.stringify(result.output, null, 2);
        }
      } catch { content = ''; }
      await base44.entities.KnowledgeDoc.create({ title, kind: 'doc', content, file_url, source_type: 'file_upload', active: true, sort_order: docs.length });
      qc.invalidateQueries({ queryKey: ['knowledge-docs'] });
      toast.success('File uploaded and added');
    } catch (err) {
      toast.error('Upload failed: ' + (err?.message || ''));
    }
    setUploading(false);
  };

  const onUploadJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        await base44.entities.KnowledgeDoc.create({
          title: item.title || file.name,
          kind: item.kind || 'doc',
          term: item.term || '',
          content: item.content || JSON.stringify(item, null, 2),
          source_type: 'json_upload',
          active: true,
          sort_order: docs.length,
        });
      }
      qc.invalidateQueries({ queryKey: ['knowledge-docs'] });
      toast.success(`${items.length} item(s) imported from JSON`);
    } catch (err) {
      toast.error('JSON parse failed: ' + (err?.message || ''));
    }
  };

  const onGenerate = async () => {
    if (!aiTopic.trim()) { toast.error('Enter a topic first'); return; }
    setGenerating(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a knowledge base article about: ${aiTopic}. Return a title and comprehensive content that an AI assistant can use as reference context.`,
        response_json_schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } } },
      });
      await base44.entities.KnowledgeDoc.create({
        title: res.title || aiTopic,
        kind: 'doc',
        content: res.content || '',
        source_type: 'ai_generated',
        active: true,
        sort_order: docs.length,
      });
      qc.invalidateQueries({ queryKey: ['knowledge-docs'] });
      setAiTopic('');
      toast.success('AI-generated article added');
    } catch (err) {
      toast.error('Generation failed: ' + (err?.message || ''));
    }
    setGenerating(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="text-[13px] text-muted-foreground max-w-xl">
          Both DataBot and BuildBot read every active item as context. Add manually, upload files, import JSON, or generate with AI.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => document.getElementById('kb-file-upload').click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload File
          </Button>
          <input id="kb-file-upload" type="file" accept=".csv,.xlsx,.json,.html,.png,.jpg,.jpeg,.pdf,.doc,.docx,.txt" className="hidden" onChange={onUploadFile} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => document.getElementById('kb-json-upload').click()}>
            <FileJson className="w-3.5 h-3.5" /> Import JSON
          </Button>
          <input id="kb-json-upload" type="file" accept=".json" className="hidden" onChange={onUploadJson} />
          <Button size="sm" onClick={openNew} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Item</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 rounded-[10px] border border-border bg-card p-3">
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
        <Input value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="Describe a topic to generate with AI..." className="flex-1 bg-background border-0 focus-visible:ring-0" onKeyDown={e => { if (e.key === 'Enter') onGenerate(); }} />
        <Button size="sm" onClick={onGenerate} disabled={generating} className="gap-1.5 shrink-0">{generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {docs.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground text-[13px] py-10 border border-dashed border-border rounded-[12px]">No knowledge items yet. Add docs, upload files, or generate with AI.</div>
        )}
        {docs.map(d => {
          const meta = KIND_META[d.kind] || KIND_META.doc;
          const Icon = meta.icon;
          return (
            <div key={d.id} className={`bg-card border border-border rounded-[12px] p-4 ${d.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => openEdit(d)} className="text-[14px] font-semibold text-foreground truncate hover:underline text-left">{d.kind === 'glossary' && d.term ? d.term : d.title}</button>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">{meta.label}</Badge>
                    {d.source_type && d.source_type !== 'manual' && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${SOURCE_BADGE[d.source_type] || ''}`}>{d.source_type.replace('_', ' ')}</span>
                    )}
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
                <SelectContent>{Object.entries(KIND_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.kind === 'glossary' && (
              <div><Label className="text-[12px]">Term</Label><Input value={form.term} onChange={e => setForm(p => ({ ...p, term: e.target.value }))} placeholder="e.g. CPL" className="mt-1 bg-background text-[13px]" /></div>
            )}
            <div><Label className="text-[12px]">Title</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Short title" className="mt-1 bg-background text-[13px]" /></div>
            <div><Label className="text-[12px]">{form.kind === 'glossary' ? 'Definition' : 'Content'}</Label><Textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={6} placeholder="What the chatbot should know…" className="mt-1 bg-background text-[13px]" /></div>
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