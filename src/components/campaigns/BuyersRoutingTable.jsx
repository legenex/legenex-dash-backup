import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  GripVertical, ChevronUp, ChevronDown, Search, Columns3, MoreVertical, Pencil, Pause, Play, Trash2,
} from 'lucide-react';

const money = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '--' : `$${Number(v).toFixed(2)}`);

// Buyers routing table columns. `key` doubles as the metric accessor; live
// per-buyer metrics are not computed here (layout/wiring only) so unknown
// metrics show --. Payout reads the RouteMember fixed_price.
const COLUMNS = [
  { key: 'cap', label: 'Cap' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'leads_14d', label: 'Leads 14D' },
  { key: 'payout', label: 'Payout', money: true },
  { key: 'cpl', label: 'CPL', money: true },
  { key: 'revenue', label: 'Revenue', money: true },
  { key: 'billing', label: 'Billing' },
];

export default function BuyersRoutingTable({
  members, buyerName, onReorder, onMove, onEdit, onToggle, onRemove,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dragIndex, setDragIndex] = useState(null);
  const [visibleCols, setVisibleCols] = useState(COLUMNS.map((c) => c.key));

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const name = (m.destination_name || buyerName[m.buyer_id] || m.buyer_id || '').toLowerCase();
      if (q && !name.includes(q)) return false;
      if (statusFilter === 'active' && m.active === false) return false;
      if (statusFilter === 'paused' && m.active !== false) return false;
      return true;
    });
  }, [members, buyerName, search, statusFilter]);

  const cols = COLUMNS.filter((c) => visibleCols.includes(c.key));

  const onDrop = (targetIdx) => {
    if (dragIndex == null || dragIndex === targetIdx) { setDragIndex(null); return; }
    onReorder(dragIndex, targetIdx);
    setDragIndex(null);
  };

  const payoutFor = (m) => (m.fixed_price != null && m.fixed_price !== '' ? m.fixed_price : m.reserve_price);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyers" className="pl-8 h-9 bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 bg-background text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5"><Columns3 className="w-4 h-4" />Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              {COLUMNS.map((c) => (
                <DropdownMenuItem key={c.key} onSelect={(e) => { e.preventDefault(); setVisibleCols((prev) => prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]); }} className="gap-2">
                  <span className={`w-3.5 h-3.5 rounded-sm border ${visibleCols.includes(c.key) ? 'bg-primary border-primary' : 'border-border'}`} />
                  {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="px-3 py-2.5 font-medium w-28">Order</th>
              <th className="px-3 py-2.5 font-medium min-w-[180px]">Buyer</th>
              {cols.map((c) => <th key={c.key} className="px-3 py-2.5 font-medium whitespace-nowrap text-right">{c.label}</th>)}
              <th className="px-3 py-2.5 font-medium w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 3} className="px-3 py-10 text-center text-muted-foreground">No buyers linked to this campaign's vertical yet. Link a buyer to this vertical in Operations.</td></tr>
            )}
            {rows.map((m, i) => {
              const active = m.active !== false;
              const name = m.destination_name || buyerName[m.buyer_id] || m.buyer_id || '--';
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
                      <span className="truncate">{name}</span>
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {c.key === 'payout' ? money(payoutFor(m)) : c.money ? money(m[c.key]) : (m[c.key] ?? '--')}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onEdit(m)} className="gap-2"><Pencil className="w-3.5 h-3.5" />Edit Configuration</DropdownMenuItem>
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
    </div>
  );
}