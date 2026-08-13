import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Brain, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'preference', label: 'Preference' },
  { value: 'business_rule', label: 'Business Rule' },
  { value: 'data_insight', label: 'Data Insight' },
  { value: 'definition', label: 'Definition' },
  { value: 'other', label: 'Other' },
];

// Semantic status tokens, not raw palette utilities. See DESIGN-SYSTEM.md.
const categoryColor = {
  preference: 'bg-status-duplicate status-duplicate',
  business_rule: 'bg-primary/10 text-primary',
  data_insight: 'bg-status-sold status-sold',
  definition: 'bg-status-queued status-queued',
  other: 'bg-muted text-muted-foreground',
};

export default function MemoriesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fact: '', category: 'other' });

  const { data: memories = [] } = useQuery({
    queryKey: ['chat-memories'],
    queryFn: () => base44.entities.ChatMemory.filter({ active: true }, '-created_date', 100),
  });

  const save = async () => {
    if (!form.fact.trim()) { toast.error('Fact is required'); return; }
    const { id, ...rest } = form;
    if (id) await base44.entities.ChatMemory.update(id, rest);
    else await base44.entities.ChatMemory.create(rest);
    qc.invalidateQueries({ queryKey: ['chat-memories'] });
    setOpen(false);
    setForm({ fact: '', category: 'other' });
    toast.success('Memory saved');
  };

  const remove = async (m) => {
    await base44.entities.ChatMemory.delete(m.id);
    qc.invalidateQueries({ queryKey: ['chat-memories'] });
    toast.success('Memory deleted');
  };

  const openNew = () => { setForm({ fact: '', category: 'other' }); setOpen(true); };
  const openEdit = (m) => { setForm({ ...m }); setOpen(true); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-muted-foreground">Facts and preferences the bots have learned. Used as context for better, personalized answers.</div>
        <Button size="sm" onClick={openNew} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" /> Add Memory</Button>
      </div>
      {memories.length === 0 ? (
        <div className="text-center text-muted-foreground text-[13px] py-10 border border-dashed border-border rounded-[12px]">No memories yet. Add one manually or the bot will learn facts as you chat.</div>
      ) : (
        <div className="space-y-2">
          {memories.map(m => (
            <div key={m.id} className="bg-card border border-border rounded-[12px] p-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Brain className="w-4 h-4 text-primary" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-foreground">{m.fact}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${categoryColor[m.category] || categoryColor.other}`}>{(m.category || 'other').replace('_', ' ')}</span>
                  {m.times_referenced > 0 && <span className="text-[10px] text-muted-foreground">Used {m.times_referenced}x</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(m)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(m)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader><DialogTitle>{form.id ? 'Edit' : 'Add'} Memory</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Fact</Label>
              <Textarea value={form.fact} onChange={e => setForm(p => ({ ...p, fact: e.target.value }))} rows={3} placeholder="e.g. User prefers revenue figures net of IPL fees" className="mt-1 bg-background text-[13px]" />
            </div>
            <div>
              <Label className="text-[12px]">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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