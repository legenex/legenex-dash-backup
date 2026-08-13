import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight } from 'lucide-react';
import { IGNORE } from '@/components/settings/leadSourceFields';

// Review + edit a source column -> lead field mapping. `columns` are the source
// keys, `sample` is an object of column -> example value, `targetFields` is the
// list of selectable lead fields.
export default function MappingReviewTable({ columns, sample = {}, mapping, setMapping, targetFields }) {
  return (
    <div className="border border-border rounded-[10px] overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12px]">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground uppercase tracking-wider">
            <th className="text-left px-3 py-2.5">Source Column</th>
            <th className="text-left px-3 py-2.5">Sample</th>
            <th className="text-left px-3 py-2.5 w-[36px]"></th>
            <th className="text-left px-3 py-2.5">Maps To</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {columns.map(col => (
            <tr key={col}>
              <td className="px-3 py-2 font-mono text-foreground">{col}</td>
              <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">{String(sample[col] ?? '')}</td>
              <td className="px-3 py-2 text-muted-foreground"><ArrowRight className="w-3.5 h-3.5" /></td>
              <td className="px-3 py-2">
                <Select value={mapping[col] || IGNORE} onValueChange={v => setMapping(p => ({ ...p, [col]: v }))}>
                  <SelectTrigger className="bg-background text-[12px] h-8 w-[210px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={IGNORE}>— Ignore —</SelectItem>
                    {targetFields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}