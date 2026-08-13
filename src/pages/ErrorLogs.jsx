import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import JsonViewer from '@/components/shared/JsonViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Search, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Panel, riseIn } from '@/components/settings/settingsUi';

const severityColors = {
  warning: 'bg-status-unsold status-unsold',
  error: 'bg-status-error status-error',
  critical: 'bg-status-error status-error font-bold',
};

export default function ErrorLogs({ embedded = false }) {
  const [stageFilter, setStageFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [resolvedFilter, setResolvedFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const qc = useQueryClient();

  const { data: errors = [], isLoading } = useQuery({
    queryKey: ['error-logs'],
    queryFn: () => base44.entities.ErrorLog.list('-created_date', 500),
  });

  useEffect(() => {
    const unsub = base44.entities.ErrorLog.subscribe(() => {
      qc.invalidateQueries({ queryKey: ['error-logs'] });
    });
    return unsub;
  }, [qc]);

  const filtered = errors.filter(e => {
    if (stageFilter !== 'all' && e.stage !== stageFilter) return false;
    if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
    if (resolvedFilter === 'yes' && !e.resolved) return false;
    if (resolvedFilter === 'no' && e.resolved) return false;
    if (search && !(e.message || '').toLowerCase().includes(search.toLowerCase())
      && !(e.supplier_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const markResolved = async (id) => {
    await base44.entities.ErrorLog.update(id, { resolved: true });
    toast.success('Marked as resolved');
    qc.invalidateQueries({ queryKey: ['error-logs'] });
    setSelected(null);
  };

  const bulkResolveAll = async () => {
    const unresolved = filtered.filter(e => !e.resolved);
    await Promise.all(unresolved.map(e => base44.entities.ErrorLog.update(e.id, { resolved: true })));
    toast.success(`Resolved ${unresolved.length} errors`);
    qc.invalidateQueries({ queryKey: ['error-logs'] });
  };

  return (
    <div>
      {!embedded ? (
        <PageHeader title="Error Logs" subtitle="Pipeline errors and warnings">
          <Button size="sm" variant="outline" onClick={bulkResolveAll} className="gap-1.5 text-[12px]">
            <CheckCircle className="w-3.5 h-3.5" /> Resolve All Visible
          </Button>
        </PageHeader>
      ) : (
        <div className="flex justify-end mb-4">
          <Button size="sm" variant="outline" onClick={bulkResolveAll} className="gap-1.5 text-[12px]">
            <CheckCircle className="w-3.5 h-3.5" /> Resolve All Visible
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[130px] bg-card"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {['auth', 'validation', 'mapping', 'hlr', 'leadbyte', 'system'].map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[130px] bg-card"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            {['warning', 'error', 'critical'].map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
          <SelectTrigger className="w-[130px] bg-card"><SelectValue placeholder="Resolved" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="no">Unresolved</SelectItem>
            <SelectItem value="yes">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Time', 'Stage', 'Severity', 'Supplier', 'Message', 'Lead', 'Resolved'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No errors</td></tr>}
            {filtered.map((err, idx) => (
              <motion.tr key={err.id} variants={riseIn} initial="hidden" animate="show" custom={idx} className="hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => setSelected(err)}>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  {err.created_date ? format(new Date(err.created_date), 'MMM dd HH:mm:ss') : ''}
                </td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-[11px] font-mono">{err.stage}</Badge></td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${severityColors[err.severity] || ''}`}>{err.severity}</span>
                </td>
                <td className="px-4 py-3 text-secondary-foreground">{err.supplier_name || '-'}</td>
                <td className="px-4 py-3 text-foreground truncate max-w-[300px]">{err.message}</td>
                <td className="px-4 py-3">{err.lead_id ? <ExternalLink className="w-3.5 h-3.5 text-primary" /> : '-'}</td>
                <td className="px-4 py-3">{err.resolved ? <CheckCircle className="w-4 h-4 status-sold" /> : '-'}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-[600px] bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Error Detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-[11px] text-muted-foreground">Stage</div><div className="text-[13px] font-mono">{selected.stage}</div></div>
                <div><div className="text-[11px] text-muted-foreground">Severity</div><div className="text-[13px]">{selected.severity}</div></div>
                <div><div className="text-[11px] text-muted-foreground">Supplier</div><div className="text-[13px]">{selected.supplier_name || '-'}</div></div>
                <div><div className="text-[11px] text-muted-foreground">Time</div><div className="text-[13px] font-mono">{selected.created_date ? format(new Date(selected.created_date), 'PPpp') : ''}</div></div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">Message</div>
                <div className="text-[13px] text-foreground">{selected.message}</div>
              </div>
              <JsonViewer data={selected.detail} title="Detail" />
              <div className="flex gap-2">
                {!selected.resolved && (
                  <Button size="sm" onClick={() => markResolved(selected.id)} className="gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Mark Resolved
                  </Button>
                )}
                {selected.lead_id && (
                  <Link to="/leads" onClick={() => setSelected(null)}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5" /> View Lead
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}