import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import QueueRecoveryRow from '@/components/leads/QueueRecoveryRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, RotateCcw, X, Inbox, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { processLead } from '@/functions/processLead';
import { recoverTrustedForm } from '@/functions/recoverTrustedForm';

const CERT_REGEX = /^https?:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}(\?.*)?$/;

export default function QueueRecovery() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [certs, setCerts] = useState({}); // { [leadId]: certString }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [rerunningIds, setRerunningIds] = useState(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [autoRecoveringIds, setAutoRecoveringIds] = useState(new Set());
  const [bulkAutoRunning, setBulkAutoRunning] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['queue-leads'],
    queryFn: () => base44.entities.Lead.filter({ final_status: 'Queued', archived: false }, '-created_date', 500),
  });

  const suppliers = useMemo(
    () => [...new Set(leads.map(l => l.supplier_name).filter(Boolean))],
    [leads]
  );

  const filtered = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter(l =>
      (l.first_name || '').toLowerCase().includes(q) ||
      (l.last_name || '').toLowerCase().includes(q) ||
      (l.mobile || '').includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.supplier_name || '').toLowerCase().includes(q)
    );
  }, [leads, search]);

  const filteredIds = useMemo(() => new Set(filtered.map(l => l.id)), [filtered]);
  const visibleSelectedIds = useMemo(
    () => new Set([...selectedIds].filter(id => filteredIds.has(id))),
    [selectedIds, filteredIds]
  );
  const selectedCount = visibleSelectedIds.size;
  const allVisibleSelected = filtered.length > 0 && visibleSelectedIds.size === filtered.length;
  const someVisibleSelected = visibleSelectedIds.size > 0 && !allVisibleSelected;

  // Selected leads that also have a valid cert pasted
  const rerunnableSelected = useMemo(() => {
    return filtered.filter(l => {
      if (!visibleSelectedIds.has(l.id)) return false;
      const c = (certs[l.id] || '').trim();
      return c !== '' && CERT_REGEX.test(c);
    });
  }, [filtered, visibleSelectedIds, certs]);

  const toggleAll = (checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) filtered.forEach(l => next.add(l.id));
      else filtered.forEach(l => next.delete(l.id));
      return next;
    });
  };

  const toggleOne = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const onCertChange = (leadId, value) => {
    setCerts(prev => ({ ...prev, [leadId]: value }));
  };

  // Core: patch cert into lead, then call processLead (same path as Resend)
  const assignAndRerun = async (lead, certUrl) => {
    const rawPayload = JSON.parse(lead.raw_payload || '{}');
    const mappedFields = JSON.parse(lead.mapped_fields || '{}');

    rawPayload.trustedform_url = certUrl;
    if ('trustedform_cert' in rawPayload) rawPayload.trustedform_cert = certUrl;
    mappedFields.trustedform_url = certUrl;
    if ('trustedform_cert' in mappedFields) mappedFields.trustedform_cert = certUrl;

    await base44.entities.Lead.update(lead.id, {
      raw_payload: JSON.stringify(rawPayload),
      mapped_fields: JSON.stringify(mappedFields),
      trustedform_valid: true,
    });

    const keys = await base44.entities.ApiKey.filter({ id: lead.supplier_key_id });
    const key = keys[0]?.key;
    if (!key) throw new Error('Supplier key not found');

    const resp = await processLead({ ...rawPayload, _supplier_key: key });
    return resp;
  };

  const handleRerun = async (lead) => {
    const certUrl = (certs[lead.id] || '').trim();
    if (!CERT_REGEX.test(certUrl)) {
      toast.error('Invalid TrustedForm cert URL');
      return;
    }
    setRerunningIds(prev => new Set(prev).add(lead.id));
    try {
      const resp = await assignAndRerun(lead, certUrl);
      toast.success(`Rerun result: ${resp.data?.Response || 'Submitted'}`);
      setCerts(prev => { const n = { ...prev }; delete n[lead.id]; return n; });
      qc.invalidateQueries({ queryKey: ['queue-leads'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      toast.error(`Rerun failed: ${err.message || 'Unknown error'}`);
    } finally {
      setRerunningIds(prev => { const n = new Set(prev); n.delete(lead.id); return n; });
    }
  };

  const handleBulkRerun = async () => {
    const targets = rerunnableSelected;
    if (targets.length === 0) {
      toast.error('No selected leads with a valid cert');
      return;
    }
    setBulkRunning(true);
    setProgress({ done: 0, total: targets.length });
    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const lead = targets[i];
      const certUrl = (certs[lead.id] || '').trim();
      setRerunningIds(prev => new Set(prev).add(lead.id));
      try {
        await assignAndRerun(lead, certUrl);
        okCount++;
        setCerts(prev => { const n = { ...prev }; delete n[lead.id]; return n; });
      } catch {
        failCount++;
      }
      setRerunningIds(prev => { const n = new Set(prev); n.delete(lead.id); return n; });
      setProgress({ done: i + 1, total: targets.length });
    }
    setBulkRunning(false);
    setProgress(null);
    qc.invalidateQueries({ queryKey: ['queue-leads'] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    if (failCount === 0) {
      toast.success(`Reran ${okCount} lead${okCount === 1 ? '' : 's'}`);
    } else {
      toast.error(`Reran ${okCount} ok, ${failCount} failed`);
    }
    setSelectedIds(new Set());
  };

  const handleAutoRecover = async (lead) => {
    setAutoRecoveringIds(prev => new Set(prev).add(lead.id));
    try {
      const resp = await recoverTrustedForm({ lead_id: lead.id });
      const result = resp.data?.results?.[0];
      if (result?.success) {
        // Cert found - now re-run the lead through the pipeline with the recovered cert
        await assignAndRerun(lead, result.recovered_cert_url);
        toast.success(`Cert recovered via ${result.cert_source} - lead re-processed`);
      } else {
        toast.error(result?.error || 'No cert found');
      }
      qc.invalidateQueries({ queryKey: ['queue-leads'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      toast.error(`Recovery failed: ${err.message || 'Unknown error'}`);
    } finally {
      setAutoRecoveringIds(prev => { const n = new Set(prev); n.delete(lead.id); return n; });
    }
  };

  const handleBulkAutoRecover = async () => {
    const targets = filtered.filter(l => visibleSelectedIds.has(l.id));
    if (targets.length === 0) {
      toast.error('No leads selected');
      return;
    }
    setBulkAutoRunning(true);
    setProgress({ done: 0, total: targets.length });
    let okCount = 0, failCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const lead = targets[i];
      setAutoRecoveringIds(prev => new Set(prev).add(lead.id));
      try {
        const resp = await recoverTrustedForm({ lead_id: lead.id });
        const result = resp.data?.results?.[0];
        if (result?.success) {
          await assignAndRerun(lead, result.recovered_cert_url);
          okCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
      setAutoRecoveringIds(prev => { const n = new Set(prev); n.delete(lead.id); return n; });
      setProgress({ done: i + 1, total: targets.length });
    }
    setBulkAutoRunning(false);
    setProgress(null);
    qc.invalidateQueries({ queryKey: ['queue-leads'] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    if (failCount === 0) {
      toast.success(`Auto-recovered ${okCount} lead${okCount === 1 ? '' : 's'}`);
    } else {
      toast.error(`Recovered ${okCount}, failed ${failCount}`);
    }
    setSelectedIds(new Set());
  };

  return (
    <div>
      <PageHeader
        title="Queued Leads"
        subtitle="Assign TrustedForm certs to queued leads and rerun them through the pipeline"
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, mobile, email, supplier..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="text-[12px] text-muted-foreground">{filtered.length} queued leads</div>
      </div>

      {/* Bulk toolbar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-card border border-border rounded-[10px] flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-primary/15 text-primary text-[12px] font-semibold">
              {selectedCount}
            </span>
            <span className="text-[13px] text-foreground font-medium">selected</span>
          </div>
          {progress && (
            <div className="text-[12px] text-muted-foreground font-mono">
              {progress.done}/{progress.total} reran
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            {rerunnableSelected.length} with valid cert
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkAutoRecover}
              disabled={bulkAutoRunning || selectedCount === 0}
              className="gap-1.5"
            >
              <Wand2 className={`w-3.5 h-3.5 ${bulkAutoRunning ? 'animate-spin' : ''}`} />
              {bulkAutoRunning ? 'Recovering…' : 'Auto-Recover Selected'}
            </Button>
            <Button
              size="sm"
              onClick={handleBulkRerun}
              disabled={bulkRunning || rerunnableSelected.length === 0}
              className="gap-1.5"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${bulkRunning ? 'animate-spin' : ''}`} />
              {bulkRunning ? 'Running…' : 'Assign & Rerun Selected'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="gap-1 text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 sticky top-0">
                <th className="w-[40px] px-4 py-3">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all leads"
                  />
                </th>
                {['Created', 'Supplier', 'Name', 'Mobile', 'Email', 'Queue Reason', 'TrustedForm Cert', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No queued leads
                  </td>
                </tr>
              )}
              {filtered.map(lead => (
                <QueueRecoveryRow
                  key={lead.id}
                  lead={lead}
                  isSelected={visibleSelectedIds.has(lead.id)}
                  onToggleSelect={toggleOne}
                  certValue={certs[lead.id] || ''}
                  onCertChange={onCertChange}
                  onRerun={handleRerun}
                  rerunning={rerunningIds.has(lead.id)}
                  onAutoRecover={handleAutoRecover}
                  autoRecovering={autoRecoveringIds.has(lead.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}