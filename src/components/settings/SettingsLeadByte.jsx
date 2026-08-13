import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import JsonViewer from '@/components/shared/JsonViewer';
import { testLeadByteConnector } from '@/functions/testLeadByteConnector';
import DeliveryLogsTab from '@/components/settings/DeliveryLogsTab';
import { buildDefaultActualPayload } from '@/components/settings/ActualPayloadEditor';
import { HighlightedPayloadEditor } from '@/components/settings/HighlightedPayloadEditor';
import TokenReferencePanel from '@/components/settings/TokenReferencePanel';
import ConnectorFilterPanel from '@/components/settings/ConnectorFilterPanel';
import { buildTriggerOptions, statusLabelFor } from '@/lib/leadStatus';
import { verticalColor, triggerTagClass, TAG_NEUTRAL, statusTextClass } from '@/lib/tagColors';
import { countConditions, normalizeConditionTree } from '@/lib/conditionGroups';
import { Plus, Save, Play, Loader2, Trash2, ChevronDown, ChevronRight, ArrowDownUp } from 'lucide-react';
import { toast } from 'sonner';
import ImportExportDialog from '@/components/shared/ImportExportDialog';
import { motion } from 'framer-motion';
import { Panel, rise } from '@/components/campaigns/campaignTable';
import { verticalFilterOptions } from '@/lib/verticalOptions';

const DEFAULT_TEST_PAYLOAD = {
  campid: "LEGAL-MVA-USA",
  email: "maakelsmuf1@eee.com",
  firstname: "Maakel",
  lastname: "Smuf",
  geo_city: "HI",
  geo_state: "HI",
  geo_zip: "90210",
  country: "USA",
  zip: "90233",
  ipaddress: "10.10.10.10",
  phone1: "4249449001",
  source: "Facebook",
  c1: "s1",
  c2: "s2",
  c3: "s3",
  sid: "LOL",
  supplier_sid: "LOL",
  ssid: "MVA-CA",
  optinurl: "https://quiz.checkacase.com/s/v2",
  accident_state: "HI",
  accident_date: "Within 7 Days",
  incident_date: "08/12/2024",
  accident_type: "Auto",
  accident_details: "test lead",
  injured: "Yes",
  injury_type: "Broken Bones",
  type_of_injury: "",
  treatment: "Yes",
  treatment_type: "Hospital",
  treatment_time: "Within 7 Days",
  fault: "No",
  attorney: "No",
  has_attorney: "",
  insurance: "Yes",
  police_report: "Yes",
  phone_verified: "Exact Match",
  phone_verified_2: "Exact Match",
  trustedform_url: "https://cert.trustedform.com/98d21e64fd8dd2b87ca81548eeb479802f79ce77",
  jornaya_token: "123123698769",
  supplier_brand: "CAC",
  tier: "3",
  vertical: "MVA",
  client_type: "Law Firm",
  ef_transaction_id: "132",
  user_agent: "",
  utm_source: "Facebook",
  utm_campaign: "camp",
  utm_medium: "med",
  utm_content: "contentq",
  utm_terms: "terms",
  utm_ad_label: "Ad Labal"
};

const TOKEN_STATIC_DEFAULTS = {
  firstname: 'Maakel', first_name: 'Maakel',
  lastname: 'Smuf', last_name: 'Smuf',
  email: 'test@example.com',
  phone1: '4249442024', mobile: '4249442024', phone: '4249442024', phone_number: '4249442024',
  zip: '90210', zipcode: '90210',
  ip_address: '5.5.5.5', ipaddress: '5.5.5.5',
  city: 'Beverly Hills', geoip_city: 'Beverly Hills',
  state: 'CA', geoip_state: 'CA', accident_state: 'CA',
  country: 'USA', geoip_country: 'USA',
  accident_type: 'Auto',
  accident_date: 'Within 7 Days', incident_date: '06/12/2025',
  injured: 'Yes', injury_type: 'Broken Bones', treatment: 'Yes', treatment_type: 'Hospital',
  fault: 'No', attorney: 'No', insurance: 'Yes', police_report: 'Yes',
  source: 'Facebook', supplier_brand: 'CAC', brand: 'CAC',
  sid: 'LOL', supplier_sid: 'LOL', ssid: 'MVA-CA',
  optin_url: 'https://quiz.checkacase.com/s/v2', optinurl: 'https://quiz.checkacase.com/s/v2',
  trustedform_url: 'https://cert.trustedform.com/1895fa40605aa17b06e36b639cb8cb7b3aba00',
  jornaya_token: '123123698769',
  user_agent: 'Mozilla/5.0 (Test) AppleWebKit/537.36',
  utm_source: 'Facebook', utm_campaign: 'camp', utm_medium: 'med',
  phone_verified: 'Exact Match', hlr_status: 'Exact Match', hlr_score: '95',
  lead_id: '999', event_time: String(Math.floor(Date.now() / 1000)),
};

// Build a static test payload from the delivery's payload template:
// every {{token}} is replaced with a sensible static value so the user
// can edit real values. Falls back to DEFAULT_TEST_PAYLOAD when no template.
function buildTestPayloadFromTemplate(templateStr) {
  try {
    const obj = JSON.parse(templateStr || '{}');
    if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
      return JSON.stringify(DEFAULT_TEST_PAYLOAD, null, 2);
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.startsWith('{{') && v.endsWith('}}')) {
        const token = v.slice(2, -2).split('|')[0].trim();
        out[k] = TOKEN_STATIC_DEFAULTS[token] ?? DEFAULT_TEST_PAYLOAD[token] ?? DEFAULT_TEST_PAYLOAD[k] ?? 'test_value';
      } else {
        out[k] = v;
      }
    }
    return JSON.stringify(out, null, 2);
  } catch {
    return JSON.stringify(DEFAULT_TEST_PAYLOAD, null, 2);
  }
}

const HLR_TOKENS = ['phone_verified', 'hlr_status', 'hlr_score', 'country_code'];
const FINAL_STATUSES = ['Sold', 'Unsold', 'Queued', 'Error'];
const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];
const VALUE_LESS_OPS = ['is_empty', 'is_not_empty'];
const FIELD_PATH_OPTIONS = [
  { value: 'records[0].status', label: 'records[0].status' },
  { value: 'records[0].rejection_id', label: 'records[0].rejection_id' },
  { value: 'records[0].id', label: 'records[0].id' },
  { value: 'records[0].queue_id', label: 'records[0].queue_id' },
  { value: 'records[0].valid', label: 'records[0].valid' },
  { value: 'records[0].error', label: 'records[0].error' },
  { value: 'status', label: 'status' },
  { value: 'success', label: 'success' },
  { value: 'error', label: 'error' },
  { value: 'lead_id', label: 'lead_id' },
];

const KIND_OPTIONS = [
  { value: 'leadbyte', label: 'Leadbyte' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'data', label: 'Data' },
  { value: 'generic_http', label: 'Webhook' },
];

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

function parseHeaderRows(val) {
  if (!val) return [{ key: 'Content-Type', value: 'application/json' }];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      return Object.entries(parsed).map(([key, value]) => ({ key, value }));
    } catch { return [{ key: 'Content-Type', value: 'application/json' }]; }
  }
  if (Array.isArray(val)) return val;
  return Object.entries(val).map(([key, value]) => ({ key, value }));
}



export default function SettingsLeadByte() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [headerRows, setHeaderRows] = useState([]);
  const [testResult, setTestResult] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [savingTestPayload, setSavingTestPayload] = useState(false);
  const [testPayloadStr, setTestPayloadStr] = useState(JSON.stringify(DEFAULT_TEST_PAYLOAD, null, 2));
  const [testLeadExpanded, setTestLeadExpanded] = useState(false);
  // Default to 'connectors' so list view always shows content
  const [activeTab, setActiveTab] = useState('connectors');
  const [connectorSubTab, setConnectorSubTab] = useState('connector');
  const [verticalFilter, setVerticalFilter] = useState('all');
  const [ioOpen, setIoOpen] = useState(false);

  const [editingMapping, setEditingMapping] = useState(null);
  const [savingMapping, setSavingMapping] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: connectors = [] } = useQuery({
    queryKey: ['lb-connectors-all'],
    queryFn: () => base44.entities.LeadByteConnector.list(),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => base44.entities.Brand.list(),
  });
  const brandOptions = brands.map(b => b.brand_name).filter(Boolean);

  const { data: verticalList = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list(),
  });
  const verticalFilterOpts = verticalFilterOptions(verticalList);
  const supplierOptions = suppliers.map(s => ({ value: s.name, label: s.name }));
  const supplierTypeOptions = [
    { value: 'Internal', label: 'Internal' },
    { value: 'External', label: 'External' },
    { value: 'Calls', label: 'Calls' },
  ];

  const { data: responseMappings = [], refetch: refetchMappings } = useQuery({
    queryKey: ['response-mappings'],
    queryFn: () => base44.entities.ResponseMapping.list('sort_order', 50),
  });

  const openEdit = (conn) => {
    // Migrate pass-through connectors to template (Actual Payload) mode by default,
    // since the Actual Payload now reproduces pass-through output. Pre-fill the
    // payload_template if it's empty so the user sees the current outbound shape.
    const mode = conn.forwarding_mode || 'template';
    let payloadTemplate = conn.payload_template;
    if (!payloadTemplate || mode === 'pass-through') {
      payloadTemplate = buildDefaultActualPayload(customFields);
    }
    setEditing({ ...conn, forwarding_mode: 'template', payload_template: payloadTemplate, kind: conn.kind || 'leadbyte', triggers: conn.triggers || '["on_received"]' });
    setHeaderRows(parseHeaderRows(conn.headers));
    setTestResult(null);
    setTestPayloadStr(conn.test_payload_last_used || buildTestPayloadFromTemplate(payloadTemplate));
    setTestLeadExpanded(false);
    setConnectorSubTab('connector');
  };

  const saveTestPayload = async (payloadStr) => {
    if (!editing?.id) return;
    await base44.entities.LeadByteConnector.update(editing.id, { test_payload_last_used: payloadStr });
    setEditing(p => ({ ...p, test_payload_last_used: payloadStr }));
  };

  const openCreate = () => {
    setEditing({
      api_name: '', target_url: '', http_method: 'POST',
      content_type: 'application/json', headers: '[]',
      payload_template: buildDefaultActualPayload(customFields), enabled: true, is_default: false,
      forwarding_mode: 'template',
      filter_brands: '[]', filter_verticals: '[]', filter_suppliers: '[]', filter_supplier_types: '[]', filter_routes: '[]', filter_conditions: '[]',
      kind: 'leadbyte', triggers: '["on_received"]',
    });
    setHeaderRows([{ key: 'X_KEY', value: '' }, { key: 'Content-Type', value: 'application/json' }]);
    setTestResult(null);
    setTestPayloadStr(buildTestPayloadFromTemplate(buildDefaultActualPayload(customFields)));
    setConnectorSubTab('connector');
  };

  const saveConnector = async () => {
    const data = { ...editing, headers: JSON.stringify(headerRows), test_payload_last_used: testPayloadStr };
    if (editing.id) {
      await base44.entities.LeadByteConnector.update(editing.id, data);
    } else {
      const created = await base44.entities.LeadByteConnector.create(data);
      // Persist the edited test payload against the newly created connector too
      await base44.entities.LeadByteConnector.update(created.id, { test_payload_last_used: testPayloadStr });
    }
    toast.success('Connector saved');
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['lb-connectors-all'] });
  };

  const sendTestLead = async () => {
    setSendingTest(true);
    setTestResult(null);
    let parsed;
    try {
      parsed = JSON.parse(testPayloadStr);
    } catch {
      toast.error('Invalid JSON in payload');
      setSendingTest(false);
      return;
    }
    await saveTestPayload(testPayloadStr);
    const resp = await testLeadByteConnector({ connector_id: editing.id, test_payload: parsed });
    const data = resp.data;
    setTestResult(data);
    if (data?.error) {
      toast.error(data.error);
    } else {
      toast.success('Test lead sent');
    }
    setSendingTest(false);
  };

  const addHeaderRow = () => setHeaderRows(p => [...p, { key: '', value: '' }]);
  const removeHeaderRow = (i) => setHeaderRows(p => p.filter((_, idx) => idx !== i));
  const updateHeaderRow = (i, field, val) => setHeaderRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const setF = (key, val) => setEditing(p => ({ ...p, [key]: val }));

  const toggleArrayValue = (field, value) => {
    const arr = parseJsonArray(editing[field]);
    const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
    setF(field, JSON.stringify(next));
  };

  const toggleEnabled = async (conn) => {
    await base44.entities.LeadByteConnector.update(conn.id, { enabled: !conn.enabled });
    qc.invalidateQueries({ queryKey: ['lb-connectors-all'] });
  };

  const deleteConnector = async (id) => {
    await base44.entities.LeadByteConnector.delete(id);
    toast.success('Delivery deleted');
    qc.invalidateQueries({ queryKey: ['lb-connectors-all'] });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteConnector(deleteTarget.id);
    setDeleteTarget(null);
  };

  const duplicateConnector = async (conn) => {
    const { id, created_date, updated_date, created_by_id, ...rest } = conn;
    await base44.entities.LeadByteConnector.create({
      ...rest,
      api_name: `${conn.api_name} (Copy)`,
      enabled: false,
      is_default: false,
    });
    toast.success('Delivery duplicated (disabled)');
    qc.invalidateQueries({ queryKey: ['lb-connectors-all'] });
  };

  const saveMapping = async () => {
    if (!editingMapping) return;
    setSavingMapping(true);
    try {
      const data = {
        field_path: editingMapping.field_path || 'records[0].status',
        operator: editingMapping.operator || 'contains',
        lb_status: editingMapping.lb_status || '',
        response_label: editingMapping.response_label,
        final_status: editingMapping.final_status,
        sort_order: editingMapping.sort_order || 0,
        is_fallback: editingMapping.is_fallback || false,
      };
      if (editingMapping.id) {
        await base44.entities.ResponseMapping.update(editingMapping.id, data);
      } else {
        await base44.entities.ResponseMapping.create(data);
      }
      toast.success('Mapping saved');
      setEditingMapping(null);
      refetchMappings();
    } catch (e) {
      toast.error('Failed to save');
    }
    setSavingMapping(false);
  };

  const deleteMapping = async (id) => {
    await base44.entities.ResponseMapping.delete(id);
    refetchMappings();
    toast.success('Deleted');
  };

  const seedDefaultMappings = async () => {
    const defaults = [
      { field_path: 'records[0].status', operator: 'contains', lb_status: 'Approved', response_label: 'Sold', final_status: 'Sold', sort_order: 0, is_fallback: false },
      { field_path: 'records[0].status', operator: 'contains', lb_status: 'Rejected', response_label: 'Unsold', final_status: 'Unsold', sort_order: 1, is_fallback: false },
      { field_path: 'records[0].status', operator: 'is_not_empty', lb_status: '', response_label: 'Error', final_status: 'Error', sort_order: 99, is_fallback: true },
    ];
    for (const d of defaults) await base44.entities.ResponseMapping.create(d);
    refetchMappings();
    toast.success('Default mappings seeded');
  };

  const fieldTokens = customFields.map(f => f.field_name);
  const triggerOptions = buildTriggerOptions(customFields);

  // ── Connector edit view ──────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="sticky top-0 z-30 flex items-center justify-between bg-background/95 backdrop-blur-sm border-b border-border py-3">
            <h3 className="text-[15px] font-semibold text-foreground">{editing.id ? 'Edit Delivery' : 'New Delivery'}</h3>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveConnector} className="gap-1.5"><Save className="w-4 h-4" /> Save</Button>
            </div>
          </div>

          <div className="sticky top-[57px] z-20 flex gap-1 border-b border-border bg-background/95 backdrop-blur-sm">
            {[{ k: 'connector', l: 'Delivery Config' }, { k: 'responses', l: 'Response Builder' }].map(({ k, l }) => (
              <button key={k} onClick={() => setConnectorSubTab(k)}
                className={`px-4 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px
                  ${connectorSubTab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {l}
              </button>
            ))}
          </div>

          {connectorSubTab === 'connector' && (
            <>
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-[12px]">Name</Label><Input value={editing.api_name || ''} onChange={e => setEditing(p => ({ ...p, api_name: e.target.value }))} className="mt-1 bg-background" /></div>
                    <div>
                      <Label className="text-[12px]">Delivery Type</Label>
                      <SearchableSelect
                        value={editing.kind || 'leadbyte'}
                        onValueChange={v => setEditing(p => ({ ...p, kind: v }))}
                        className="mt-1 bg-background"
                        options={KIND_OPTIONS}
                      />
                    </div>
                    <div>
                      <Label className="text-[12px]">Vertical</Label>
                      <SearchableSelect
                        value={(parseJsonArray(editing.filter_verticals)[0] || '')}
                        onValueChange={v => setF('filter_verticals', v ? JSON.stringify([v]) : '[]')}
                        className="mt-1 bg-background"
                        placeholder="All verticals"
                        options={[{ value: '', label: 'All verticals' }, ...verticalFilterOpts]}
                      />
                    </div>
                  </div>
                  <div><Label className="text-[12px]">Endpoint URL</Label><Input value={editing.target_url || ''} onChange={e => setEditing(p => ({ ...p, target_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[12px]">HTTP Method</Label>
                      <SearchableSelect
                        value={editing.http_method || 'POST'}
                        onValueChange={v => setEditing(p => ({ ...p, http_method: v }))}
                        className="mt-1 bg-background"
                        options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]}
                      />
                    </div>
                    <div>
                      <Label className="text-[12px]">Content-Type</Label>
                      <SearchableSelect
                        value={editing.content_type || 'application/json'}
                        onValueChange={v => setEditing(p => ({ ...p, content_type: v }))}
                        className="mt-1 bg-background"
                        options={[
                          { value: 'application/json', label: 'application/json' },
                          { value: 'application/x-www-form-urlencoded', label: 'application/x-www-form-urlencoded' },
                        ]}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-3">
                  <div className="text-[13px] font-semibold text-foreground">Triggers</div>
                  <p className="text-[11px] text-muted-foreground">When should this delivery fire? Default deliveries always forward on Qualified. Trigger options come from the Lead Status system field.</p>
                  <div className="flex flex-wrap gap-2">
                    {triggerOptions.map(t => {
                      const active = parseJsonArray(editing.triggers).includes(t.value);
                      return (
                        <button key={t.value} onClick={() => toggleArrayValue('triggers', t.value)}
                          className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors ${active ? 'bg-primary/20 text-primary border-primary/40' : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <ConnectorFilterPanel
                editing={editing}
                onFieldChange={setF}
                brandOptions={brandOptions}
                supplierOptions={supplierOptions}
                supplierTypeOptions={supplierTypeOptions}
                customFields={customFields}
              />

              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-[13px]">Headers</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-[1fr_1fr_36px] gap-2 text-[11px] text-muted-foreground font-medium px-1">
                    <span>Header Name</span><span>Value</span><span />
                  </div>
                  {headerRows.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2 items-start">
                      <Input value={row.key} onChange={e => updateHeaderRow(i, 'key', e.target.value)} placeholder="e.g. X-API-KEY" className="bg-background font-mono text-[12px] h-10" />
                      <Input value={row.value} onChange={e => updateHeaderRow(i, 'value', e.target.value)} placeholder="Value" className="bg-background font-mono text-[12px] h-10" />
                      <Button variant="ghost" size="sm" onClick={() => removeHeaderRow(i)} className="h-10 w-9 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addHeaderRow} className="gap-1.5 mt-1"><Plus className="w-3.5 h-3.5" /> Add Header</Button>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-[13px]">Payload Template</CardTitle></CardHeader>
                <CardContent>
                  <HighlightedPayloadEditor
                    value={editing.payload_template || '{}'}
                    onChange={v => setEditing(p => ({ ...p, payload_template: v }))}
                    minHeight={360}
                  />
                </CardContent>
              </Card>

              {/* Test Lead Collapsible Section */}
              <Collapsible open={testLeadExpanded} onOpenChange={setTestLeadExpanded} className="bg-card border border-border rounded-lg">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors rounded-lg">
                    <div className="flex items-center gap-2">
                      {testLeadExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-[13px] font-medium text-foreground">Send Test Lead</span>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4 pt-2 space-y-4">
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                    <span className="text-foreground font-semibold">Test Payload = sample INBOUND lead.</span> This is different from the <span className="text-foreground font-semibold">Payload Template</span> (the OUTBOUND definition). The test resolves the Payload's <code className="bg-muted px-1 rounded text-primary">{'{{token}}'}</code> placeholders against this sample inbound lead, then posts the result directly to <code className="bg-muted px-1 rounded text-primary font-mono">{editing.target_url}</code>. No HLR is run and no gateway lead is created.
                  </div>

                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground">Test Payload (sample inbound lead)</Label>
                    <Textarea
                      value={testPayloadStr}
                      onChange={e => setTestPayloadStr(e.target.value)}
                      className="bg-background font-mono text-[11px] min-h-[300px] leading-relaxed mt-1"
                    />
                    <div className="flex items-center gap-2 mt-2">
                       <Button size="sm" variant="outline" onClick={() => {
                         const last = editing.test_payload_last_used;
                         if (last) {
                           setTestPayloadStr(last);
                         } else {
                           setTestPayloadStr(buildTestPayloadFromTemplate(editing.payload_template));
                         }
                       }}>
                         Reset to Last Sent
                       </Button>
                       <Button size="sm" variant="secondary" disabled={savingTestPayload || !editing.id} onClick={async () => {
                         try { JSON.parse(testPayloadStr); } catch { toast.error('Invalid JSON - fix before saving'); return; }
                         setSavingTestPayload(true);
                         await saveTestPayload(testPayloadStr);
                         toast.success('Test payload saved');
                         setSavingTestPayload(false);
                       }} className="gap-1.5">
                         {savingTestPayload ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                         Save Test Payload
                       </Button>
                     </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={sendTestLead} disabled={sendingTest || !editing.id} className="gap-1.5">
                      {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Send Test Lead
                    </Button>
                    <Button onClick={saveConnector} variant="destructive" className="gap-1.5">
                      <Save className="w-4 h-4" /> Save
                    </Button>
                  </div>
                  {!editing.id && <p className="text-[11px] text-muted-foreground">Save the connector first to enable testing.</p>}

                  {testResult && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-foreground">Result</span>
                        {testResult.http_status && (
                          <Badge className={testResult.http_status < 300 ? 'bg-status-sold text-green-400' : 'bg-status-error text-red-400'}>
                            HTTP {testResult.http_status}
                          </Badge>
                        )}
                        {testResult.error && <Badge className="bg-status-error text-red-400">Error</Badge>}
                      </div>
                      <div className="grid gap-3">
                        {testResult.request_body && <JsonViewer data={testResult.request_body} title={`Request Sent to ${(() => { try { return new URL(editing.target_url).host; } catch { return 'Delivery'; } })()}`} />}
                        {testResult.lb_response && <JsonViewer data={testResult.lb_response} title="Response" />}
                        {testResult.error && <JsonViewer data={{ error: testResult.error }} title="Error" />}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {connectorSubTab === 'responses' && <ResponseBuilderPanel mappings={responseMappings} onSave={saveMapping} onDelete={deleteMapping} onSeed={seedDefaultMappings} editingMapping={editingMapping} setEditingMapping={setEditingMapping} savingMapping={savingMapping} />}
        </div>

        {/* Token reference */}
        <div>
          <Card className="bg-card border-border sticky top-4">
            <CardHeader className="pb-2"><CardTitle className="text-[13px]">Token Reference</CardTitle></CardHeader>
            <CardContent className="max-h-[70vh] overflow-y-auto">
              <TokenReferencePanel customFields={customFields} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="sticky top-0 z-30 flex gap-1 border-b border-border bg-background/95 backdrop-blur-sm py-2">
        {[{ k: 'connectors', l: 'Deliveries' }, { k: 'responses', l: 'Response Builder' }, { k: 'logs', l: 'Delivery Logs' }].map(({ k, l }) => (
          <button key={k} onClick={() => setActiveTab(k)}
            className={`px-4 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px
              ${activeTab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {l}
          </button>
        ))}
      </div>

      {activeTab === 'connectors' && (
        <div>
          <div className="sticky top-[49px] z-20 flex justify-between items-center gap-3 bg-background/95 backdrop-blur-sm border-b border-border py-3">
            <div className="flex items-center gap-2">
              <Label className="text-[12px] whitespace-nowrap">Vertical</Label>
              <SearchableSelect
                value={verticalFilter}
                onValueChange={setVerticalFilter}
                className="w-[200px] bg-background"
                options={[{ value: 'all', label: 'All Verticals' }, ...verticalFilterOpts]}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setIoOpen(true)} className="gap-1.5"><ArrowDownUp className="w-4 h-4" /> Import / Export</Button>
              <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Add Delivery</Button>
            </div>
          </div>

          <ImportExportDialog
            open={ioOpen}
            onOpenChange={setIoOpen}
            entityName="LeadByteConnector"
            records={connectors}
            matchKey="api_name"
            labelKey="api_name"
            exportPrefix="deliveries"
            queryKeys={[['lb-connectors-all']]}
            title="Import / Export Deliveries"
          />
          <div className="space-y-3">
            {[...connectors].filter(conn => {
              if (verticalFilter === 'all') return true;
              const vs = parseJsonArray(conn.filter_verticals);
              return vs.length === 0 || vs.includes(verticalFilter);
            }).sort((a, b) => {
              const aLb = (a.kind || 'leadbyte') === 'leadbyte';
              const bLb = (b.kind || 'leadbyte') === 'leadbyte';
              if (aLb && !bLb) return -1;
              if (!aLb && bLb) return 1;
              return 0;
            }).map((conn, i) => {
              const triggers = parseJsonArray(conn.triggers);
              const brands = parseJsonArray(conn.filter_brands);
              const verticals = parseJsonArray(conn.filter_verticals);
              const conditionCount = countConditions(normalizeConditionTree(conn.filter_conditions));
              return (
              <motion.div key={conn.id} variants={rise} initial="hidden" animate="show" custom={i}>
                <Panel className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-foreground">{conn.api_name}</span>
                      <span className="tag-neutral border border-border px-2 py-0.5 rounded-md text-[10.5px] font-medium tracking-wide">{KIND_OPTIONS.find(k => k.value === (conn.kind || 'leadbyte'))?.label || 'Leadbyte'}</span>
                      {verticals.length > 0 ? (
                        (() => {
                          const vc = verticalColor(verticals[0]);
                          return (
                            <Badge className={`text-[10px] font-semibold inline-flex items-center gap-1 ${vc.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${vc.dot}`} />
                              {verticals.map(code => verticalList.find(v => v.code === code)?.name || code).join(', ')}
                            </Badge>
                          );
                        })()
                      ) : (
                        <span className="tag-neutral border border-border px-2 py-0.5 rounded-md text-[10.5px] font-medium tracking-wide">All Verticals</span>
                      )}
                    </div>
                    <code className="block font-mono text-[11.5px] text-muted-foreground/70 truncate mt-1">{conn.target_url}</code>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {triggers.map(t => <Badge key={t} className={`text-[9px] ${triggerTagClass(t)}`}>{statusLabelFor(t)}</Badge>)}
                      {conn.is_default && <Badge className={`text-[9px] ${TAG_NEUTRAL}`}>Default</Badge>}
                      {brands.length > 0 && <Badge className={`text-[9px] ${TAG_NEUTRAL}`}>Brands: {brands.join(', ')}</Badge>}
                      {conditionCount > 0 && <Badge className={`text-[9px] ${TAG_NEUTRAL}`}>{conditionCount} condition(s)</Badge>}
                      {triggers.length === 0 && brands.length === 0 && conditionCount === 0 && <Badge className={`text-[9px] ${TAG_NEUTRAL}`}>All leads</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 md:justify-end flex-wrap">
                    <Badge variant="outline" className={conn.enabled ? 'status-sold bg-status-sold' : 'text-muted-foreground'}>
                      {conn.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(conn)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicateConnector(conn)} className="text-[11px]">Duplicate</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleEnabled(conn)} className="text-[11px]">
                      {conn.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(conn)} className="h-7 w-7 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </Panel>
              </motion.div>
              );
            })}
            {connectors.length === 0 && <div className="text-center py-10 text-muted-foreground text-[13px]">No connectors configured</div>}
          </div>
        </div>
      )}

      {activeTab === 'responses' && (
        <ResponseBuilderPanel
          mappings={responseMappings}
          onSave={saveMapping}
          onDelete={deleteMapping}
          onSeed={seedDefaultMappings}
          editingMapping={editingMapping}
          setEditingMapping={setEditingMapping}
          savingMapping={savingMapping}
        />
      )}

      {activeTab === 'logs' && <DeliveryLogsTab />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.api_name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Response Builder panel (shared between list + connector edit view) ─────
function ResponseBuilderPanel({ mappings, onSave, onDelete, onSeed, editingMapping, setEditingMapping, savingMapping }) {
  const newMapping = () => setEditingMapping({
    field_path: 'records[0].status', operator: 'contains', lb_status: '',
    response_label: '', final_status: 'Sold', sort_order: mappings.length, is_fallback: false,
  });

  const operatorLabel = (op) => OPERATORS.find(o => o.value === op)?.label || op;
  const needsValue = (op) => !VALUE_LESS_OPS.includes(op);

  return (
    <div className="space-y-4">
      <div className="text-[13px] text-muted-foreground leading-relaxed bg-card border border-border rounded-lg p-4">
        <p className="font-medium text-foreground mb-1">Response Builder - Operator Rules</p>
        <p>Rules are evaluated in sort order. The <strong>first matching rule</strong> wins. The fallback rule matches anything not caught above. The matched rule's Response Label is returned to the supplier as <code className="bg-muted px-1 rounded text-primary text-[11px]">{`{ "Response": "..." }`}</code>.</p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-6">#</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Field Path</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Operator</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Response Label</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-3 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mappings.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground text-[13px]">
                No rules yet.{' '}
                <button onClick={onSeed} className="text-primary underline">Seed defaults</button>
              </td></tr>
            )}
            {mappings.map((m, idx) => (
              <tr key={m.id} className={`hover:bg-accent/30 transition-colors ${m.is_fallback ? 'bg-muted/20' : ''}`}>
                <td className="px-3 py-3 text-muted-foreground text-[11px]">{m.sort_order ?? idx}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-primary">{m.field_path || 'records[0].status'}</td>
                <td className="px-3 py-3 text-[12px] text-foreground">{operatorLabel(m.operator || 'contains')}</td>
                <td className="px-3 py-3 font-mono text-[12px] text-muted-foreground">
                  {m.is_fallback ? <Badge className="bg-primary/10 text-primary text-[10px]">Fallback</Badge> : (m.lb_status || '-')}
                </td>
                <td className="px-3 py-3 text-foreground font-medium">{m.response_label}</td>
                <td className="px-3 py-3"><span className={`font-medium ${statusTextClass(m.final_status)}`}>{m.final_status}</span></td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setEditingMapping({ ...m })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(m.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {editingMapping ? (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px]">{editingMapping.id ? 'Edit Rule' : 'New Rule'}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[12px]">Field Path</Label>
                <SearchableSelect
                  value={editingMapping.field_path || 'records[0].status'}
                  onValueChange={v => setEditingMapping(p => ({ ...p, field_path: v }))}
                  className="mt-1 bg-background font-mono text-[12px]"
                  options={FIELD_PATH_OPTIONS}
                />
              </div>
              <div>
                <Label className="text-[12px]">Operator</Label>
                <SearchableSelect
                  value={editingMapping.operator || 'contains'}
                  onValueChange={v => setEditingMapping(p => ({ ...p, operator: v }))}
                  className="mt-1 bg-background"
                  options={OPERATORS.map(o => ({ value: o.value, label: o.label }))}
                />
              </div>
              <div>
                <Label className="text-[12px]">Value {VALUE_LESS_OPS.includes(editingMapping.operator) && <span className="text-muted-foreground">(not needed)</span>}</Label>
                <Input value={editingMapping.lb_status || ''} onChange={e => setEditingMapping(p => ({ ...p, lb_status: e.target.value }))} disabled={VALUE_LESS_OPS.includes(editingMapping.operator)} placeholder="e.g. Approved" className="mt-1 bg-background font-mono text-[12px] disabled:opacity-50" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[12px]">Response Label</Label>
                <Input value={editingMapping.response_label || ''} onChange={e => setEditingMapping(p => ({ ...p, response_label: e.target.value }))} placeholder="e.g. Sold" className="mt-1 bg-background" />
              </div>
              <div>
                <Label className="text-[12px]">Final Status</Label>
                <SearchableSelect
                  value={editingMapping.final_status || 'Sold'}
                  onValueChange={v => setEditingMapping(p => ({ ...p, final_status: v }))}
                  className="mt-1 bg-background"
                  options={FINAL_STATUSES.map(s => ({ value: s, label: s }))}
                />
              </div>
              <div>
                <Label className="text-[12px]">Sort Order</Label>
                <Input type="number" value={editingMapping.sort_order ?? 0} onChange={e => setEditingMapping(p => ({ ...p, sort_order: Number(e.target.value) }))} className="mt-1 bg-background" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={!!editingMapping.is_fallback} onCheckedChange={v => setEditingMapping(p => ({ ...p, is_fallback: v }))} />
              <Label className="text-[12px]">Fallback (matches anything not caught above)</Label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setEditingMapping(null)}>Cancel</Button>
              <Button size="sm" onClick={onSave} disabled={savingMapping || !editingMapping.response_label}>
                {savingMapping ? 'Saving…' : 'Save Rule'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={newMapping}>
            <Plus className="w-3.5 h-3.5" /> Add Rule
          </Button>
          {mappings.length === 0 && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={onSeed}>
              Seed default rules
            </Button>
          )}
        </div>
      )}
    </div>
  );
}