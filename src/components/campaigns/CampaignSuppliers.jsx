import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Copy, ArrowDownUp, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import ImportExportDialog from '@/components/shared/ImportExportDialog';
import { Panel, Tag } from '@/components/campaigns/campaignTable';
import { resolvePeriod } from '@/lib/periodRange';
import { money } from '@/lib/partnerMetrics';
import { supplierCostMetrics, payoutSummary } from '@/lib/supplierCost';
import SupplierSourceRows from '@/components/campaigns/SupplierSourceRows';
import SourceCreateDialog from '@/components/campaigns/SourceCreateDialog';
import RowActionsMenu from '@/components/campaigns/RowActionsMenu';

function generateKey(supplierType = '') {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let prefix = 'lgnx_ext_';
  if (supplierType === 'Internal') prefix = 'lgnx_int_';
  else if (supplierType === 'Calls') prefix = 'lgnx_cls_';
  let key = prefix;
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

const BLANK = {
  name: '', sid: '', supplier_type: '', vertical: '', payout_type: '', payout_value: null,
  email: '', landing_page_url: '', brand: [], active: true,
  payment_terms: '', payment_day_of_month: null, payment_method: '', billing_contact_email: '',
};

// Grid template shared by header + supplier rows.
const GRID = '24px 1.6fr 0.7fr 0.6fr 1fr 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr 0.7fr 0.9fr 1.1fr';
const HEADS = ['', 'Name', 'Type', 'Sources', 'Payout', 'Status', 'Leads', 'Cost', 'Revenue', 'Profit', 'CPL', 'Money Due', 'Actions'];
const NUM = new Set(['Leads', 'Cost', 'Revenue', 'Profit', 'CPL', 'Money Due', 'Sources', 'Actions']);

export default function CampaignSuppliers() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [ioOpen, setIoOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sourceDialog, setSourceDialog] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  // Metrics are all-time here; the campaign stats strip carries period context.
  const period = 'all';
  const customPeriod = { from: '', to: '' };

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date'),
  });
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-metrics'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.filter({ archived: false }, '-created_date', limit, skip)),
  });
  const { data: allSources = [] } = useQuery({
    queryKey: ['op-supplier-sources'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.SupplierSource.list('source_code', limit, skip)),
  });
  const { data: adSpend = [] } = useQuery({
    queryKey: ['ad-spend-all'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.AdSpend.list('-date', limit, skip)),
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => base44.entities.Brand.list(),
  });
  const { data: verticalList = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list(),
  });
  const verticalOptions = verticalList.map(v => ({ value: v.code, label: v.name }));

  const window = useMemo(() => resolvePeriod(period, customPeriod), [period, customPeriod]);

  const sourcesBySupplier = useMemo(() => {
    const map = {};
    for (const s of allSources) {
      if (!map[s.supplier_id]) map[s.supplier_id] = [];
      map[s.supplier_id].push(s);
    }
    return map;
  }, [allSources]);

  const metricsBySupplier = useMemo(() => {
    const now = new Date();
    const map = {};
    for (const s of suppliers) {
      map[s.id] = supplierCostMetrics(s, leads, sourcesBySupplier, adSpend, window, now);
    }
    return map;
  }, [suppliers, leads, sourcesBySupplier, adSpend, window]);

  const toggleExpand = (id) => {
    setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const openCreate = () => { setForm(BLANK); setEditId(null); setNewKey(null); setModal(true); };

  const openEdit = (s, e) => {
    e.stopPropagation();
    setForm({
      name: s.name || '', sid: s.sid || '', supplier_type: s.supplier_type || '',
      vertical: s.vertical || '', payout_type: s.payout_type || '', payout_value: s.payout_value ?? null,
      email: s.email || '', landing_page_url: s.landing_page_url || '',
      brand: s.brand ? String(s.brand).split(',').map(b => b.trim()).filter(Boolean) : [],
      active: !!s.active,
      payment_terms: s.payment_terms || '', payment_day_of_month: s.payment_day_of_month ?? null,
      payment_method: s.payment_method || '', billing_contact_email: s.billing_contact_email || '',
    });
    setEditId(s.id); setNewKey(null); setModal(true);
  };

  const cloneSupplier = async (s, e) => {
    e.stopPropagation();
    const supplier = await base44.entities.Supplier.create({
      name: `${s.name} (Copy)`, sid: s.sid, supplier_type: s.supplier_type || 'External',
      vertical: s.vertical, payout_type: s.payout_type, payout_value: s.payout_value,
      email: s.email, landing_page_url: s.landing_page_url, brand: s.brand || '',
      payment_terms: s.payment_terms, payment_day_of_month: s.payment_day_of_month,
      payment_method: s.payment_method, billing_contact_email: s.billing_contact_email,
      portal_enabled: false, active: s.active,
    });
    const key = generateKey(s.supplier_type);
    await base44.entities.ApiKey.create({
      name: supplier.name, type: 'supplier', supplier_name: supplier.name, supplier_id: supplier.id,
      vertical: s.vertical, key, key_prefix: key.substring(0, 16), active: s.active, request_count: 0,
    });
    setNewKey(key); setEditId(null); setModal(true);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success('Supplier cloned - copy the new API key now!');
  };

  const deleteSupplier = async () => {
    if (!deleteTarget) return;
    await base44.entities.Supplier.delete(deleteTarget.id);
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    toast.success('Supplier deleted');
  };

  const supplierPayload = () => ({
    name: form.name, sid: form.sid, supplier_type: form.supplier_type || 'External',
    vertical: form.vertical, payout_type: form.payout_type, payout_value: form.payout_value,
    email: form.email, landing_page_url: form.landing_page_url,
    brand: Array.isArray(form.brand) ? form.brand.join(', ') : (form.brand || ''),
    payment_terms: form.payment_terms || null,
    payment_day_of_month: form.payment_day_of_month === '' ? null : form.payment_day_of_month,
    payment_method: form.payment_method || null,
    billing_contact_email: form.billing_contact_email || null,
    active: form.active,
  });

  const saveEdit = async () => {
    await base44.entities.Supplier.update(editId, supplierPayload());
    setModal(false); setEditId(null);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    toast.success('Supplier updated');
  };

  const createSupplier = async () => {
    const supplier = await base44.entities.Supplier.create({ ...supplierPayload(), portal_enabled: false });
    const key = generateKey(form.supplier_type);
    await base44.entities.ApiKey.create({
      name: form.name, type: 'supplier', supplier_name: form.name, supplier_id: supplier.id,
      vertical: form.vertical, key, key_prefix: key.substring(0, 16), active: form.active, request_count: 0,
    });
    setNewKey(key);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success('Supplier created - copy the API key now!');
  };

  const togglePortal = async (s, e) => {
    e.stopPropagation();
    await base44.entities.Supplier.update(s.id, { portal_enabled: !s.portal_enabled });
    qc.invalidateQueries({ queryKey: ['suppliers'] });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setIoOpen(true)} className="gap-1.5"><ArrowDownUp className="w-4 h-4" /> Import / Export Fields</Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Create Supplier</Button>
        </div>
      </div>

      <ImportExportDialog
        open={ioOpen} onOpenChange={setIoOpen} entityName="Supplier" records={suppliers}
        matchKey="name" labelKey="name" exportPrefix="suppliers"
        queryKeys={[['suppliers']]} title="Import / Export Suppliers"
      />

      <Panel className="overflow-x-auto">
        <div style={{ minWidth: '1100px' }}>
          <div className="grid gap-2 px-4 py-2.5 border-b border-border/60 bg-background/40 text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70" style={{ gridTemplateColumns: GRID }}>
            {HEADS.map((h, i) => <span key={i} className={NUM.has(h) ? 'text-right' : ''}>{h}</span>)}
          </div>

          {suppliers.length === 0 && <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">No suppliers yet</div>}

          {suppliers.map((s) => {
            const m = metricsBySupplier[s.id] || { leads: 0, revenue: 0, cost: 0, profit: 0, cpl: 0, moneyDue: 0, sourceCount: 0 };
            const sources = sourcesBySupplier[s.id] || [];
            const isOpen = expanded.has(s.id);
            return (
              <div key={s.id}>
                <div className="grid gap-2 px-4 py-3 border-b border-border/60 items-center hover:bg-accent/40 transition-colors" style={{ gridTemplateColumns: GRID }}>
                  <button onClick={() => toggleExpand(s.id)} className="text-muted-foreground hover:text-foreground" aria-label={isOpen ? 'Collapse sources' : 'Expand sources'}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <span className="min-w-0 cursor-pointer" onClick={() => navigate(`/operations/suppliers?supplier=${s.id}`)}>
                    <span className="block font-medium text-foreground truncate">{s.name}</span>
                    {s.sid && <span className="block text-[11px] text-muted-foreground font-mono truncate">{s.sid}</span>}
                  </span>
                  <span><Tag tone="slate">{s.supplier_type || '-'}</Tag></span>
                  <span className="text-right font-mono text-[12px] text-foreground">{m.sourceCount}</span>
                  <span className="text-[12px] text-muted-foreground truncate">{payoutSummary(s, sources)}</span>
                  <span><Tag tone={s.active ? 'green' : 'slate'}>{s.active ? 'Active' : 'Inactive'}</Tag></span>
                  <span className="text-right font-mono text-[12px] text-foreground">{m.leads}</span>
                  <span className="text-right font-mono text-[12px] text-foreground">{money(m.cost)}</span>
                  <span className="text-right font-mono text-[12px] status-sold">{money(m.revenue)}</span>
                  <span className={`text-right font-mono text-[12px] ${m.profit >= 0 ? 'text-foreground' : 'text-primary'}`}>{money(m.profit)}</span>
                  <span className="text-right font-mono text-[12px] text-foreground">{money(m.cpl)}</span>
                  <span className="text-right font-mono text-[12px] text-foreground">{money(m.moneyDue)}</span>
                  <span className="flex items-center justify-end gap-1">
                    <span onClick={e => e.stopPropagation()} className="mr-1"><Switch checked={!!s.portal_enabled} onCheckedChange={() => {}} onClick={(e) => togglePortal(s, e)} /></span>
                    <RowActionsMenu
                      onEdit={(e) => openEdit(s, e)}
                      onClone={(e) => cloneSupplier(s, e)}
                      onDelete={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                    />
                  </span>
                </div>
                {isOpen && (
                  <div className="border-b border-border/60 bg-background/30">
                    <div className="px-6 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier Sources</div>
                    <SupplierSourceRows sources={sources} supplier={s} />
                    <div className="px-6 pb-3">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={(e) => { e.stopPropagation(); setSourceDialog({ supplier: s, source: null }); }}>
                        <Plus className="w-3.5 h-3.5" /> Create source
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <SourceCreateDialog
        open={!!sourceDialog}
        onOpenChange={(v) => { if (!v) setSourceDialog(null); }}
        supplier={sourceDialog?.supplier || null}
        source={sourceDialog?.source || null}
        existingCodes={(allSources || [])
          .filter((x) => x.supplier_id === sourceDialog?.supplier?.id)
          .map((x) => ({ id: x.id, code: x.source_code || '' }))}
      />

      <Dialog open={modal} onOpenChange={(v) => { if (!v && !newKey) setModal(false); }}>
        <DialogContent className="bg-popover border-border max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{newKey ? 'Supplier Created' : editId ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
          {newKey ? (
            <div className="space-y-4">
              <div className="bg-background border border-primary/30 rounded-lg p-4">
                <div className="text-[12px] font-semibold text-primary mb-2">API Key Generated - Copy Now</div>
                <div className="font-mono text-[12px] text-foreground break-all bg-muted/50 rounded p-3">{newKey}</div>
                <p className="text-[11px] text-muted-foreground mt-2">This key will never be shown in full again.</p>
              </div>
              <Button className="w-full gap-2" onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Copied!'); }}><Copy className="w-4 h-4" /> Copy Key</Button>
              <Button variant="ghost" className="w-full" onClick={() => setModal(false)}>Done</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1 bg-background" /></div>
                  <div><Label className="text-[12px]">SID</Label><Input value={form.sid} onChange={e => setForm(p => ({ ...p, sid: e.target.value }))} placeholder="e.g. mysup" className="mt-1 bg-background" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[12px]">Supplier Type *</Label>
                    <SearchableSelect value={form.supplier_type} onValueChange={v => setForm(p => ({ ...p, supplier_type: v }))} className="mt-1 bg-background" placeholder="Select…"
                      options={[{ value: 'Internal', label: 'Internal' }, { value: 'External', label: 'External' }, { value: 'Calls', label: 'Calls' }]} />
                  </div>
                  <div>
                    <Label className="text-[12px]">Payout Type</Label>
                    <SearchableSelect value={form.payout_type}
                      onValueChange={v => setForm(p => ({ ...p, payout_type: v, payout_value: (v === 'Flat CPL' || v === 'Revenue %' || v === 'Profit %') ? (p.payout_value ?? '') : null }))}
                      className="mt-1 bg-background" placeholder="None"
                      options={[{ value: '', label: 'None' }, { value: 'Flat CPL', label: 'Flat CPL' }, { value: 'Revenue %', label: 'Revenue %' }, { value: 'Profit %', label: 'Profit %' }, { value: 'Inbound Call', label: 'Inbound Call' }]} />
                  </div>
                </div>
                <div>
                  <Label className="text-[12px]">Vertical (optional)</Label>
                  <SearchableSelect value={form.vertical} onValueChange={v => setForm(p => ({ ...p, vertical: v }))} className="mt-1 bg-background" placeholder="Any vertical"
                    options={[{ value: '', label: 'Any vertical' }, ...verticalOptions]} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[12px]">Brand(s)</Label>
                    <MultiSelect value={form.brand} onValueChange={v => setForm(p => ({ ...p, brand: v }))} className="mt-1 bg-background" placeholder="Select brands…"
                      options={brands.map(b => ({ value: b.brand_name, label: b.brand_name }))} />
                  </div>
                  <div><Label className="text-[12px]">Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1 bg-background" /></div>
                </div>
                {(form.payout_type === 'Flat CPL' || form.payout_type === 'Revenue %' || form.payout_type === 'Profit %') && (
                  <div>
                    <Label className="text-[12px]">{form.payout_type === 'Flat CPL' ? 'Price ($)' : 'Percentage (%)'}</Label>
                    <Input type="number" step="0.01" value={form.payout_value ?? ''} onChange={e => setForm(p => ({ ...p, payout_value: e.target.value === '' ? null : Number(e.target.value) }))}
                      placeholder={form.payout_type === 'Flat CPL' ? 'e.g. 25.00' : 'e.g. 15'} className="mt-1 bg-background font-mono text-[12px]" />
                  </div>
                )}

                {/* Payment terms, drives Money Due */}
                <div className="pt-2 border-t border-border">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment Terms</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[12px]">Terms</Label>
                      <SearchableSelect value={form.payment_terms} onValueChange={v => setForm(p => ({ ...p, payment_terms: v }))} className="mt-1 bg-background" placeholder="Not set"
                        options={[{ value: '', label: 'Not set' }, { value: 'Net 7', label: 'Net 7' }, { value: 'Net 15', label: 'Net 15' }, { value: 'Net 30', label: 'Net 30' }, { value: 'Net 60', label: 'Net 60' }, { value: 'Prepaid', label: 'Prepaid' }, { value: 'Manual', label: 'Manual' }]} />
                    </div>
                    <div>
                      <Label className="text-[12px]">Payment Day of Month</Label>
                      <Input type="number" min="1" max="31" value={form.payment_day_of_month ?? ''} onChange={e => setForm(p => ({ ...p, payment_day_of_month: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="e.g. 15" className="mt-1 bg-background font-mono text-[12px]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div><Label className="text-[12px]">Payment Method</Label><Input value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} placeholder="ACH, wire, PayPal…" className="mt-1 bg-background" /></div>
                    <div><Label className="text-[12px]">Billing Contact Email</Label><Input value={form.billing_contact_email} onChange={e => setForm(p => ({ ...p, billing_contact_email: e.target.value }))} className="mt-1 bg-background" /></div>
                  </div>
                </div>

                <div><Label className="text-[12px]">Landing Page URL</Label><Input value={form.landing_page_url} onChange={e => setForm(p => ({ ...p, landing_page_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
                <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} /><Label className="text-[12px]">Active</Label></div>
                {!editId && <p className="text-[11px] text-muted-foreground">An API key is auto-generated on create. Add sources on the supplier detail page.</p>}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setModal(false); setEditId(null); }}>Cancel</Button>
                {editId ? (
                  <Button onClick={saveEdit} disabled={!form.name || !form.supplier_type}>Save Changes</Button>
                ) : (
                  <Button onClick={createSupplier} disabled={!form.name || !form.supplier_type}>Create Supplier</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete "{deleteTarget?.name}". This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSupplier} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}