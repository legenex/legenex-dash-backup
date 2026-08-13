import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, Tag, riseIn } from '@/components/settings/settingsUi';

// Field Mapping: maps inbound payload keys -> normalized lead fields (FieldMapping entity).
export default function SettingsFieldMapping() {
  const qc = useQueryClient();
  const [src, setSrc] = useState('');
  const [dst, setDst] = useState('');

  const { data: mappings = [] } = useQuery({
    queryKey: ['field-mappings'],
    queryFn: () => base44.entities.FieldMapping.list('-created_date'),
  });
  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list('sort_order'),
  });

  const add = async () => {
    if (!src.trim() || !dst.trim()) { toast.error('Enter both a source key and a target field'); return; }
    await base44.entities.FieldMapping.create({ source_field: src.trim(), target_field: dst.trim() });
    qc.invalidateQueries({ queryKey: ['field-mappings'] });
    setSrc(''); setDst('');
    toast.success('Mapping added');
  };

  const remove = async (id) => {
    await base44.entities.FieldMapping.delete(id);
    qc.invalidateQueries({ queryKey: ['field-mappings'] });
    toast.success('Mapping removed');
  };

  return (
    <div className="space-y-4">
      <div className="text-[13px] text-muted-foreground max-w-2xl">
        Map inbound payload keys to normalized lead fields. Unmapped keys fall back to their raw name (or are auto-cataloged when adaptive fields are on).
      </div>

      <Panel className="p-4" i={0}>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Source key</label>
            <Input value={src} onChange={e => setSrc(e.target.value)} placeholder="e.g. phone1" className="mt-1.5 h-10 bg-background font-mono text-[12px]" />
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground mb-3" />
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Target field</label>
            <Input value={dst} onChange={e => setDst(e.target.value)} placeholder="e.g. mobile" list="target-fields" className="mt-1.5 h-10 bg-background font-mono text-[12px]" />
            <datalist id="target-fields">
              {['first_name', 'last_name', 'email', 'mobile', ...customFields.map(f => f.field_name)].map(f => <option key={f} value={f} />)}
            </datalist>
          </div>
          <Button size="sm" onClick={add} className="gap-1.5 mb-0.5 h-10"><Plus className="w-3.5 h-3.5" /> Add</Button>
        </div>
      </Panel>

      <Panel className="overflow-hidden" i={1}>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead><tr className="border-b border-border bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            <th className="text-left px-4 py-3">Source Key</th><th className="text-left px-4 py-3"></th>
            <th className="text-left px-4 py-3">Target Field</th><th className="text-right px-4 py-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {mappings.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No field mappings yet</td></tr>}
            {mappings.map((m, idx) => (
              <motion.tr key={m.id} variants={riseIn} initial="hidden" animate="show" custom={idx} className="hover:bg-accent/40">
                <td className="px-4 py-3 font-mono text-foreground">{m.source_field}</td>
                <td className="px-4 py-3 text-muted-foreground"><ArrowRight className="w-3.5 h-3.5" /></td>
                <td className="px-4 py-3"><Tag tone="muted" className="font-mono">{m.target_field}</Tag></td>
                <td className="px-4 py-3 text-right"><button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>
    </div>
  );
}