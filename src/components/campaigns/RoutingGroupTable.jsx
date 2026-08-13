import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  GripVertical, ChevronUp, ChevronDown, MoreVertical, Pencil, Pause, Play, Trash2, Wand2,
} from 'lucide-react';
import { destinationLabel, isLegacyMember } from '@/lib/campaigns/memberDestination';

const money = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '--' : `$${Number(v).toFixed(2)}`);

// One routing group's ordered member table. Rows show the DESTINATION name as
// the primary text and the BUYER name as muted secondary text (this removes the
// apparent duplicate buyer rows). Drag ordering + up/down. Round Robin and
// Weighted groups expose an editable Weight column. All writes go through the
// callbacks; this component holds no persistence logic.
export default function RoutingGroupTable({
  members, buyerName, subById, method, showWeight,
  onReorder, onMove, onEdit, onToggle, onRemove, onWeight, onConvert,
}) {
  const [dragIndex, setDragIndex] = useState(null);

  const rows = useMemo(
    () => [...members].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
    [members],
  );

  const onDrop = (targetIdx) => {
    if (dragIndex == null || dragIndex === targetIdx) { setDragIndex(null); return; }
    onReorder(dragIndex, targetIdx);
    setDragIndex(null);
  };

  const payoutFor = (m) => (m.fixed_price != null && m.fixed_price !== '' ? m.fixed_price : m.reserve_price);

  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="px-3 py-2.5 font-medium w-28">Order</th>
            <th className="px-3 py-2.5 font-medium min-w-[220px]">Delivery</th>
            {showWeight && <th className="px-3 py-2.5 font-medium w-28 text-right">Weight</th>}
            <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Payout</th>
            <th className="px-3 py-2.5 font-medium text-right">Status</th>
            <th className="px-3 py-2.5 font-medium w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 && (
            <tr><td colSpan={showWeight ? 6 : 5} className="px-3 py-8 text-center text-muted-foreground">No deliveries in this group yet. Use Add delivery.</td></tr>
          )}
          {rows.map((m, i) => {
            const active = m.active !== false;
            const legacy = isLegacyMember(m);
            const dest = destinationLabel(m, subById);
            const buyer = buyerName[m.buyer_id] || m.buyer_id || '--';
            return (
              <tr
                key={m.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                className={`hover:bg-accent/30 ${dragIndex === i ? 'opacity-50' : ''}`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <GripVertical className="w-4 h-4 text-muted-foreground/60 cursor-grab shrink-0" />
                    <div className="flex flex-col">
                      <button onClick={() => onMove(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => onMove(i, 1)} disabled={i === rows.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground w-5 text-right">{m.priority ?? i + 1}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-[hsl(var(--chart-5))]' : 'bg-muted-foreground'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-foreground">{dest}</span>
                        {legacy && <Badge variant="outline" className="text-[10px] border-border text-muted-foreground shrink-0">Legacy config</Badge>}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{buyer}</div>
                    </div>
                  </div>
                </td>
                {showWeight && (
                  <td className="px-3 py-2.5 text-right">
                    <Input
                      type="number" min="1" step="1"
                      value={m.weight ?? 1}
                      onChange={(e) => onWeight(m, e.target.value)}
                      className="h-8 w-20 ml-auto text-right font-mono tabular-nums bg-background"
                    />
                  </td>
                )}
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{money(payoutFor(m))}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`} />
                    {active ? 'on' : 'off'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(m)} className="gap-2"><Pencil className="w-3.5 h-3.5" />Edit configuration</DropdownMenuItem>
                      {legacy && <DropdownMenuItem onSelect={() => onConvert(m)} className="gap-2"><Wand2 className="w-3.5 h-3.5" />Convert to delivery</DropdownMenuItem>}
                      <DropdownMenuItem onSelect={() => onToggle(m)} className="gap-2">
                        {active ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Enable</>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onRemove(m)} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="w-3.5 h-3.5" />Remove</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}