import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { metaLeadForms } from '@/functions/metaLeadForms';
import { metaLeadFormMappings } from '@/functions/metaLeadFormMappings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, Link2, Trash2, AlertTriangle, FileText } from 'lucide-react';
import { toast } from 'sonner';

// Default Meta field names for each Legenex lead field. Meta lead forms use
// stable question names for the standard questions; custom questions vary per
// form, so these are editable.
const FIELD_TARGETS = [
  { key: 'email', label: 'Email', metaDefault: 'email' },
  { key: 'mobile', label: 'Phone', metaDefault: 'phone_number' },
  { key: 'first_name', label: 'First name', metaDefault: 'first_name' },
  { key: 'last_name', label: 'Last name', metaDefault: 'last_name' },
];

function MapFormDialog({ open, onOpenChange, form, page, connectionId, existing, onSaved }) {
  const [campaignId, setCampaignId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [fieldMap, setFieldMap] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list(), enabled: open });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list(), enabled: open });

  React.useEffect(() => {
    if (!open) return;
    setCampaignId(existing?.campaign_id || '');
    setSupplierId(existing?.supplier_id || '');
    let fm = {};
    try { fm = existing?.field_map ? JSON.parse(existing.field_map) : {}; } catch { fm = {}; }
    const seeded = {};
    for (const t of FIELD_TARGETS) seeded[t.key] = fm[t.key] || t.metaDefault;
    setFieldMap(seeded);
  }, [open, existing]);

  const save = async () => {
    if (!campaignId) { toast.error('Choose a campaign'); return; }
    if (!supplierId) { toast.error('Choose a source'); return; }
    setSaving(true);
    try {
      const d = (await metaLeadFormMappings({
        action: 'save',
        form_id: form.id, form_name: form.name,
        page_id: page.id, page_name: page.name,
        connection_id: connectionId,
        campaign_id: campaignId, supplier_id: supplierId,
        field_map: fieldMap,
      })).data || {};
      if (!d.success) { toast.error(d.error || 'Could not save mapping'); setSaving(false); return; }
      toast.success('Lead form mapped');
      onSaved?.();
      onOpenChange(false);
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save mapping'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[560px] max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Map lead form</DialogTitle></DialogHeader>
        <p className="text-[12px] text-muted-foreground -mt-2">
          Map <span className="text-foreground font-medium">{form?.name}</span> to a campaign and source, and match its questions to lead fields.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select a campaign" /></SelectTrigger>
              <SelectContent>
                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.vertical ? ` (${c.vertical})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Source (attribution)</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select a source" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-[12px] font-semibold">Field mapping</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Left is the Legenex lead field, right is the Meta form question name.</p>
          <div className="space-y-1.5">
            {FIELD_TARGETS.map(t => (
              <div key={t.key} className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground w-24 shrink-0">{t.label}</span>
                <Input
                  value={fieldMap[t.key] || ''}
                  onChange={e => setFieldMap(prev => ({ ...prev, [t.key]: e.target.value }))}
                  placeholder={t.metaDefault}
                  className="h-8 bg-background text-[12px] font-mono"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-2.5 text-[11px] text-muted-foreground">
          Mapping is saved for reporting and setup. Lead ingestion from Meta is not switched on yet, so no leads are pulled or distributed from this form.
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving' : 'Save mapping'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Lead Forms tab for the Meta connector: lists the Pages and leadgen forms a
// connection can see, and lets an operator map each form to a Legenex campaign,
// a source, and a field map. Storage only; ingestion is a separate change.
export default function MetaLeadFormsTab({ connections = [], onReconnect }) {
  const qc = useQueryClient();
  const [connectionId, setConnectionId] = useState(connections[0]?.id || '');
  const [search, setSearch] = useState('');
  const [mapTarget, setMapTarget] = useState(null);

  const activeConn = connectionId || connections[0]?.id || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['meta-lead-forms', activeConn],
    queryFn: async () => (await metaLeadForms({ connection_id: activeConn })).data,
    enabled: !!activeConn,
  });

  const { data: mapData, refetch: refetchMaps } = useQuery({
    queryKey: ['meta-lead-form-mappings'],
    queryFn: async () => (await metaLeadFormMappings({ action: 'list' })).data,
  });
  const mappings = mapData?.mappings || [];
  const mapByForm = useMemo(() => {
    const m = {};
    for (const r of mappings) if (r.form_id) m[r.form_id] = r;
    return m;
  }, [mappings]);

  const pages = data?.pages || [];
  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pages;
    return pages
      .map(p => ({ ...p, forms: (p.forms || []).filter(f => `${f.name} ${p.name}`.toLowerCase().includes(q)) }))
      .filter(p => p.forms.length > 0);
  }, [pages, search]);

  const removeMapping = async (id) => {
    try {
      await metaLeadFormMappings({ action: 'delete', id });
      refetchMaps();
      qc.invalidateQueries({ queryKey: ['meta-lead-form-mappings'] });
      toast.success('Mapping removed');
    } catch { toast.error('Could not remove mapping'); }
  };

  if (!connections.length) {
    return <div className="rounded-lg border border-border bg-card p-8 text-center text-[13px] text-muted-foreground">Connect Meta first to see your lead forms.</div>;
  }

  return (
    <div className="space-y-3">
      {connections.length > 1 && (
        <div>
          <Label className="text-[11px] text-muted-foreground">Connection</Label>
          <Select value={activeConn} onValueChange={setConnectionId}>
            <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>{connections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {data && data.needs_reconnect && (
        <div className="rounded-lg border border-border bg-card p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-[12px] text-muted-foreground flex-1">
            <span className="text-foreground font-medium">Lead form access is missing.</span> {data.error}
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={onReconnect}>Reconnect</Button>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lead forms" className="pl-8 bg-background h-9" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading lead forms</div>
        ) : error ? (
          <div className="p-6 text-center text-[13px] text-destructive">Could not load lead forms.</div>
        ) : !filteredPages.length ? (
          <div className="p-8 text-center text-[13px] text-muted-foreground">{search ? 'No lead forms match your search.' : 'No lead forms found for this connection.'}</div>
        ) : filteredPages.map(p => (
          <div key={p.id}>
            <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-secondary/40">{p.name}</div>
            {p.error ? (
              <div className="px-3 py-2.5 text-[11px] text-destructive">{p.error}</div>
            ) : p.forms.map(f => {
              const m = mapByForm[f.id];
              return (
                <div key={f.id} className="border-b border-border last:border-b-0 px-3 py-2.5 flex items-center gap-3 hover:bg-accent">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-foreground truncate">{f.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {f.leads_count} lead{f.leads_count === 1 ? '' : 's'}
                      {m ? ` · ${m.campaign_name || 'campaign'} · ${m.supplier_name || 'source'}` : ''}
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[9px] uppercase shrink-0 ${f.status === 'active' ? 'status-sold' : 'text-muted-foreground'}`}>{f.status}</Badge>
                  {m && <Badge variant="outline" className="text-[9px] shrink-0">mapped</Badge>}
                  <button onClick={() => setMapTarget({ form: f, page: p })} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground shrink-0">
                    <Link2 className="w-3.5 h-3.5" /> {m ? 'Edit' : 'Map'}
                  </button>
                  {m && (
                    <button onClick={() => removeMapping(m.id)} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border bg-card p-2.5 text-[11px] text-muted-foreground">
        Mappings are stored for setup and reporting. Pulling leads from Meta is not switched on yet, so nothing is ingested or distributed from these forms.
      </div>

      <MapFormDialog
        open={!!mapTarget}
        onOpenChange={(o) => !o && setMapTarget(null)}
        form={mapTarget?.form}
        page={mapTarget?.page}
        connectionId={activeConn}
        existing={mapTarget ? mapByForm[mapTarget.form.id] : null}
        onSaved={() => { refetchMaps(); qc.invalidateQueries({ queryKey: ['meta-lead-form-mappings'] }); }}
      />
    </div>
  );
}
