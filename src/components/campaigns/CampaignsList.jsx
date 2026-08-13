import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Search, Columns3, Plus, MoreVertical, Pencil, Copy, Power, PowerOff, Trash2, Loader2, Megaphone,
} from 'lucide-react';
import { campaignMetrics, campaignCounts } from '@/lib/campaignMetrics';

const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;
const METHOD_LABEL = { direct_post: 'Direct Post', ping_post: 'Ping Post', both: 'Both' };

// Metric columns (Campaign Name + Status + Method are fixed at the front).
const COLUMNS = [
  { key: 'buyers', label: 'Buyers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'leads14d', label: 'Leads 14D' },
  { key: 'total', label: 'Total' },
  { key: 'acceptedPct', label: 'Acc %', fmt: pct },
  { key: 'duplicatePct', label: 'Duplicate %', fmt: pct },
  { key: 'dqPct', label: 'DQ %', fmt: pct },
  { key: 'returnedPct', label: 'Returned %', fmt: pct },
  { key: 'revenue', label: 'Revenue', fmt: money },
  { key: 'cost', label: 'Cost', fmt: money },
  { key: 'profit', label: 'Profit', fmt: money },
  { key: 'profitPct', label: 'Profit %', fmt: pct },
];

export default function CampaignsList({ onCreate, onOpen }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibleCols, setVisibleCols] = useState(COLUMNS.map((c) => c.key));
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list('-created_date', 500) });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('sort_order', 200) });
  const { data: leads = [] } = useQuery({ queryKey: ['leads-metrics'], queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.filter({ archived: false }, '-created_date', limit, skip)) });
  const { data: groups = [] } = useQuery({ queryKey: ['routeGroups'], queryFn: () => fetchAll((limit, skip) => base44.entities.RouteGroup.list('-created_date', limit, skip)) });
  const { data: members = [] } = useQuery({ queryKey: ['allRouteMembers'], queryFn: () => fetchAll((limit, skip) => base44.entities.RouteMember.list('-created_date', limit, skip)) });

  // Map a vertical code to its full display name (e.g. "MVA" -> "Motor Vehicle Accidents").
  const verticalName = useMemo(() => {
    const map = {};
    for (const v of verticals) { if (v.code) map[String(v.code).toLowerCase()] = v.name; }
    return (code) => map[String(code || '').toLowerCase()] || code || '--';
  }, [verticals]);

  const membersByGroup = useMemo(() => {
    const map = {};
    for (const m of members) { (map[m.route_group_id] ||= []).push(m); }
    return map;
  }, [members]);

  const rows = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    return campaigns
      .filter((c) => {
        if (q && !(c.name || '').toLowerCase().includes(q) && !(c.vertical || '').toLowerCase().includes(q) && !(c.campaign_id || '').toLowerCase().includes(q)) return false;
        if (statusFilter === 'active' && c.active === false) return false;
        if (statusFilter === 'disabled' && c.active !== false) return false;
        return true;
      })
      .map((c) => ({
        campaign: c,
        counts: campaignCounts(c, groups, membersByGroup),
        m: campaignMetrics(c, leads, now),
      }));
  }, [campaigns, leads, groups, membersByGroup, search, statusFilter]);

  const cols = COLUMNS.filter((c) => visibleCols.includes(c.key));

  async function clone(c) {
    try {
      await base44.entities.Campaign.create({
        name: `${c.name} (Copy)`, vertical: c.vertical, brand: c.brand || null,
        send_mode: c.send_mode || 'direct_post', status: 'disabled', active: false,
      });
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign cloned');
    } catch (e) { toast.error(e?.message || 'Clone failed'); }
  }

  async function toggle(c) {
    const next = c.active === false;
    try {
      await base44.entities.Campaign.update(c.id, { active: next, status: next ? 'active' : 'disabled' });
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(next ? 'Campaign enabled' : 'Campaign disabled');
    } catch (e) { toast.error(e?.message || 'Update failed'); }
  }

  async function remove(c) {
    try {
      await base44.entities.Campaign.delete(c.id);
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted');
    } catch (e) { toast.error(e?.message || 'Delete failed'); }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns" className="pl-8 h-9 bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 bg-background text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
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
          <Button size="sm" className="h-9 gap-1.5" onClick={onCreate}><Plus className="w-4 h-4" />Create Campaign</Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Campaign ID</th>
              <th className="px-3 py-2.5 font-medium min-w-[200px]">Campaign Name</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Method</th>
              {cols.map((c) => <th key={c.key} className="px-3 py-2.5 font-medium whitespace-nowrap text-right">{c.label}</th>)}
              <th className="px-3 py-2.5 font-medium w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={cols.length + 5} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={cols.length + 5} className="px-3 py-12 text-center text-muted-foreground"><Megaphone className="w-7 h-7 mx-auto mb-2 opacity-50" />No campaigns yet. Create one to configure routing.</td></tr>
            )}
            {rows.map(({ campaign: c, counts, m }) => {
              const active = c.active !== false;
              return (
                <tr key={c.id} onClick={() => onOpen(c)} className="hover:bg-accent/30 cursor-pointer">
                  <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">
                    {c.campaign_id
                      ? <span className="text-foreground">{c.campaign_id}</span>
                      : <span className="text-muted-foreground">--</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium truncate">{c.name || c.id}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{verticalName(c.vertical)}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`} />
                      {active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{METHOD_LABEL[c.send_mode] || 'Direct Post'}</td>
                  {cols.map((col) => {
                    const raw = col.key === 'buyers' ? counts.buyers : col.key === 'suppliers' ? counts.suppliers : m[col.key];
                    return (
                      <td key={col.key} className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {col.fmt ? col.fmt(raw) : (raw ?? '--')}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onOpen(c)} className="gap-2"><Pencil className="w-3.5 h-3.5" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => clone(c)} className="gap-2"><Copy className="w-3.5 h-3.5" />Clone</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggle(c)} className="gap-2">
                          {active ? <><PowerOff className="w-3.5 h-3.5" />Disable</> : <><Power className="w-3.5 h-3.5" />Enable</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setDeleteTarget(c)} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="w-3.5 h-3.5" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete "{deleteTarget?.name}". This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleteTarget) remove(deleteTarget); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}