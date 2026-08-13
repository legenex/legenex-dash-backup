import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ToolsShell from '@/components/tools/ToolsShell';
import { StatChip, Toggle } from '@/components/tools/toolsUi';
import JsonViewer from '@/components/shared/JsonViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Save, Phone, Mail, ChevronDown, Settings2, Download } from 'lucide-react';
import { testHlr } from '@/functions/testHlr';
import { testEmail } from '@/functions/testEmail';
import RouteSupplierFilters from '@/components/verification/RouteSupplierFilters';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadCsv } from '@/lib/csv';

const failModeDescriptions = {
  fail_open: 'Continue processing without HLR data. Lead proceeds to LeadByte with HLR fields absent.',
  fail_closed: 'Stop processing immediately. Lead is marked as Error and supplier receives error response.',
  forward_blank: 'Continue but send empty strings for all HLR passthrough fields to LeadByte.',
};

const phoneVerifiedSourceDescriptions = {
  lh_hlr_response: 'Sends the raw lh_hlr_response value (e.g. "Exact Match") as phone_verified.',
  summary_score: 'Sends the numeric summary_score (0-100) as phone_verified.',
  boolean: 'Sends "true" if Exact Match, "false" otherwise.',
};

const verdictStyles = {
  valid: 'bg-status-sold text-status-sold',
  invalid_format: 'bg-status-error text-status-error',
  disposable: 'bg-status-unsold text-status-unsold',
  no_dns_records: 'bg-status-error text-status-error',
  service_unavailable: 'bg-muted text-muted-foreground',
  unknown: 'bg-muted text-muted-foreground',
};

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

function maskLead(l) {
  const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim();
  if (l.email) {
    const [u, d] = l.email.split('@');
    return d ? `${(u || '').slice(0, 2)}***@${d}` : l.email;
  }
  if (l.mobile) return `***${String(l.mobile).slice(-4)}`;
  return name || (l.lead_id ? `#${l.lead_id}` : '-');
}

export default function Verification() {
  const qc = useQueryClient();
  const [testPhone, setTestPhone] = useState('');
  const [testFirstname, setTestFirstname] = useState('');
  const [testLastname, setTestLastname] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [testEmailInput, setTestEmailInput] = useState('');
  const [emailResult, setEmailResult] = useState(null);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  const [hlrConfigOpen, setHlrConfigOpen] = useState(false);
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);

  const { data: hlrArr = [], isLoading: isLoadingHlr } = useQuery({
    queryKey: ['hlr-settings'],
    queryFn: () => base44.entities.HlrSettings.list(),
  });
  const { data: emailArr = [] } = useQuery({
    queryKey: ['email-settings'],
    queryFn: () => base44.entities.EmailValidationSettings.list(),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.filter({ active: true }),
  });
  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });
  const { data: leads = [] } = useQuery({
    queryKey: ['verification-leads'],
    queryFn: () => base44.entities.Lead.filter({ archived: false }, '-created_date', 500),
  });

  const settings = hlrArr[0] || {};
  const emailSettings = emailArr[0] || {};
  const [form, setForm] = useState(null);
  const [emailForm, setEmailForm] = useState(null);

  const emailValidField = customFields.find(f => f.system_role === 'email_valid');
  const phoneVerifiedField = customFields.find(f => f.system_role === 'phone_verified');

  // Real verification counts from lead records.
  const hlrChecked = leads.filter(l => l.hlr_status || l.hlr_response).length;
  const hlrFailed = leads.filter(l => l.hlr_error || /fail|error|invalid|not.?found|no.?match/i.test(l.hlr_status || '')).length;
  const hlrPassed = hlrChecked - hlrFailed;
  const estSaves = hlrFailed; // failed lookups gated = wasted deliveries saved

  const emailChecked = leads.filter(l => l.email_valid === 'Yes' || l.email_valid === 'No').length;
  const emailPassed = leads.filter(l => l.email_valid === 'Yes').length;
  const emailFlagged = leads.filter(l => l.email_valid === 'No').length;
  const emailPassRate = emailChecked > 0 ? Math.round((emailPassed / emailChecked) * 100) : 0;

  // Verification log: leads that went through a check.
  const logRows = leads
    .filter(l => l.hlr_status || l.hlr_response || l.hlr_error || l.email_valid)
    .slice(0, 40);

  useEffect(() => {
    if (isLoadingHlr || form) return;
    setForm({
      provider_name: settings.provider_name || '',
      endpoint_url: settings.endpoint_url || '',
      enabled: settings.enabled ?? true,
      timeout_ms: settings.timeout_ms || 8000,
      fail_mode: settings.fail_mode || 'fail_open',
      request_field_map: settings.request_field_map || '{"mobile":"phone","first_name":"firstname","last_name":"lastname"}',
      passthrough_fields: settings.passthrough_fields || '["lh_hlr_response","summary_score","first_name_match","last_name_match","country_code"]',
      min_summary_score: settings.min_summary_score || 0,
      phone_verified_source: settings.phone_verified_source || 'lh_hlr_response',
      phone_verified_fallback: settings.phone_verified_fallback ?? 'Not Verified',
      filter_suppliers: parseJsonArray(settings.filter_suppliers),
      filter_supplier_types: parseJsonArray(settings.filter_supplier_types),
      filter_routes: parseJsonArray(settings.filter_routes),
    });
  }, [isLoadingHlr, hlrArr]);

  useEffect(() => {
    if (emailArr.length > 0 && !emailForm) {
      setEmailForm({
        enabled: emailSettings.enabled ?? true,
        filter_suppliers: parseJsonArray(emailSettings.filter_suppliers),
        filter_supplier_types: parseJsonArray(emailSettings.filter_supplier_types),
        filter_routes: parseJsonArray(emailSettings.filter_routes),
      });
    } else if (emailArr.length === 0 && !emailForm) {
      setEmailForm({ enabled: true, filter_suppliers: [], filter_supplier_types: [], filter_routes: [] });
    }
  }, [emailArr]);

  const persistHlr = async (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    const payload = {
      ...next,
      filter_suppliers: JSON.stringify(next.filter_suppliers || []),
      filter_supplier_types: JSON.stringify(next.filter_supplier_types || []),
      filter_routes: JSON.stringify(next.filter_routes || []),
    };
    try {
      if (settings.id) await base44.entities.HlrSettings.update(settings.id, payload);
      else await base44.entities.HlrSettings.create(payload);
      qc.invalidateQueries({ queryKey: ['hlr-settings'] });
    } catch (e) {
      toast.error('Failed to save: ' + (e?.message || 'Unknown error'));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      filter_suppliers: JSON.stringify(form.filter_suppliers || []),
      filter_supplier_types: JSON.stringify(form.filter_supplier_types || []),
      filter_routes: JSON.stringify(form.filter_routes || []),
    };
    try {
      if (settings.id) await base44.entities.HlrSettings.update(settings.id, payload);
      else await base44.entities.HlrSettings.create(payload);
      toast.success('HLR settings saved');
      qc.invalidateQueries({ queryKey: ['hlr-settings'] });
    } catch (e) {
      toast.error('Failed to save: ' + (e?.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const persistEmail = async (patch) => {
    const next = { ...emailForm, ...patch };
    setEmailForm(next);
    const payload = {
      enabled: next.enabled,
      filter_suppliers: JSON.stringify(next.filter_suppliers || []),
      filter_supplier_types: JSON.stringify(next.filter_supplier_types || []),
      filter_routes: JSON.stringify(next.filter_routes || []),
    };
    try {
      if (emailSettings.id) await base44.entities.EmailValidationSettings.update(emailSettings.id, payload);
      else await base44.entities.EmailValidationSettings.create(payload);
      qc.invalidateQueries({ queryKey: ['email-settings'] });
    } catch (e) {
      toast.error('Failed to save: ' + (e?.message || 'Unknown error'));
    }
  };

  const handleEmailSave = async () => {
    setEmailSaving(true);
    const payload = {
      enabled: emailForm.enabled,
      filter_suppliers: JSON.stringify(emailForm.filter_suppliers || []),
      filter_supplier_types: JSON.stringify(emailForm.filter_supplier_types || []),
      filter_routes: JSON.stringify(emailForm.filter_routes || []),
    };
    try {
      if (emailSettings.id) await base44.entities.EmailValidationSettings.update(emailSettings.id, payload);
      else await base44.entities.EmailValidationSettings.create(payload);
      toast.success('Email validation settings saved');
      qc.invalidateQueries({ queryKey: ['email-settings'] });
    } catch (e) {
      toast.error('Failed to save: ' + (e?.message || 'Unknown error'));
    }
    setEmailSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const resp = await testHlr({ phone: testPhone, firstname: testFirstname, lastname: testLastname });
    setTestResult(resp.data);
    setTesting(false);
  };

  const handleEmailTest = async () => {
    setEmailTesting(true);
    setEmailResult(null);
    try {
      const resp = await testEmail({ email: testEmailInput });
      setEmailResult(resp.data);
    } catch (e) {
      toast.error('Email validation failed');
    }
    setEmailTesting(false);
  };

  const exportLog = () => {
    downloadCsv('verification-log', [
      { label: 'Time', value: (l) => (l.created_date ? format(new Date(l.created_date), 'yyyy-MM-dd HH:mm') : '') },
      { label: 'Lead', value: (l) => maskLead(l) },
      { label: 'Check', value: (l) => (l.hlr_status || l.hlr_error || l.hlr_response ? 'HLR' : 'Email') },
      { label: 'Result', value: (l) => l.hlr_status || l.hlr_error || (l.email_valid === 'Yes' ? 'Passed' : l.email_valid === 'No' ? 'Flagged' : '') },
      { label: 'Latency', value: (l) => (l.process_time_ms ? `${l.process_time_ms}ms` : '') },
    ], logRows);
  };

  // Factual AI read.
  const aiRead = (() => {
    if (leads.length === 0) return 'No leads have flowed through verification yet. Enable a gate and process leads to see quality data.';
    const parts = [];
    if (form?.enabled) parts.push(`Phone HLR is active and has checked ${hlrChecked.toLocaleString()} leads (${hlrFailed.toLocaleString()} failed).`);
    else parts.push('Phone HLR is off, so no numbers are being verified before delivery.');
    if (emailForm?.enabled) parts.push(`Email validation is active with a ${emailPassRate}% pass rate over ${emailChecked.toLocaleString()} checks.`);
    else parts.push('Email validation is off.');
    return parts.join(' ');
  })();

  if (!form || !emailForm) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <ToolsShell
      title="Verification"
      subtitle="Phone and email quality gates protecting buyer acceptance."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Phone HLR Lookup */}
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              <div className="text-[14px] font-semibold text-foreground">Phone HLR Lookup</div>
            </div>
            <Toggle checked={form.enabled} onChange={(v) => persistHlr({ enabled: v })} />
          </div>
          <div className={`text-[12px] mt-1 ${form.enabled && settings.endpoint_url ? 'status-sold' : 'text-muted-foreground'}`}>
            {form.enabled ? (settings.endpoint_url ? `Active - ${settings.provider_name || 'provider'}` : 'Enabled, not configured') : 'Not configured'}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <StatChip label="Checked" value={hlrChecked.toLocaleString()} tone="default" i={0} />
            <StatChip label="Failed" value={hlrFailed.toLocaleString()} tone={hlrFailed > 0 ? 'warn' : 'default'} i={1} />
            <StatChip label="Est. Saves" value={estSaves.toLocaleString()} tone="good" i={2} />
          </div>

          {phoneVerifiedField && (
            <div className="flex items-center gap-2 px-3 py-2 mt-3 bg-muted/40 border border-border rounded-lg">
              <span className="text-[11px] text-muted-foreground">phone_verified field:</span>
              <Badge variant="outline" className="font-mono text-[10px]">{`{{${phoneVerifiedField.field_name}}}`}</Badge>
            </div>
          )}

          <Collapsible open={hlrConfigOpen} onOpenChange={setHlrConfigOpen} className="mt-3">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-1.5 justify-between">
                <span className="flex items-center gap-1.5"><Settings2 className="w-4 h-4" /> Configure HLR provider</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${hlrConfigOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div><Label className="text-[12px]">Provider Name</Label><Input value={form.provider_name} onChange={e => setForm(p => ({ ...p, provider_name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Endpoint URL</Label><Input value={form.endpoint_url} onChange={e => setForm(p => ({ ...p, endpoint_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Timeout (ms)</Label><Input type="number" value={form.timeout_ms} onChange={e => setForm(p => ({ ...p, timeout_ms: Number(e.target.value) }))} className="mt-1 bg-background" /></div>

              <div>
                <Label className="text-[12px]">Scope - Suppliers & Routes</Label>
                <div className="mt-2">
                  <RouteSupplierFilters
                    suppliers={suppliers}
                    filter_suppliers={form.filter_suppliers}
                    filter_supplier_types={form.filter_supplier_types}
                    filter_routes={form.filter_routes}
                    onChange={partial => setForm(p => ({ ...p, ...partial }))}
                  />
                </div>
              </div>

              <div>
                <Label className="text-[12px]">phone_verified Source</Label>
                <SearchableSelect
                  value={form.phone_verified_source}
                  onValueChange={v => setForm(p => ({ ...p, phone_verified_source: v }))}
                  className="bg-background mt-1"
                  options={[
                    { value: 'lh_hlr_response', label: 'lh_hlr_response (e.g. "Exact Match")' },
                    { value: 'summary_score', label: 'summary_score (numeric 0-100)' },
                    { value: 'boolean', label: 'boolean (true/false)' },
                  ]}
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{phoneVerifiedSourceDescriptions[form.phone_verified_source]}</p>
                <Input value={form.phone_verified_fallback} onChange={e => setForm(p => ({ ...p, phone_verified_fallback: e.target.value }))} placeholder="Not Verified" className="mt-2 bg-background" />
              </div>

              <div>
                <Label className="text-[12px]">Fail Mode</Label>
                <SearchableSelect
                  value={form.fail_mode}
                  onValueChange={v => setForm(p => ({ ...p, fail_mode: v }))}
                  className="bg-background mt-1"
                  options={[
                    { value: 'fail_open', label: 'Fail Open' },
                    { value: 'fail_closed', label: 'Fail Closed' },
                    { value: 'forward_blank', label: 'Forward Blank' },
                  ]}
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{failModeDescriptions[form.fail_mode]}</p>
              </div>

              <div>
                <Label className="text-[12px]">Request Field Map (JSON)</Label>
                <Input value={form.request_field_map} onChange={e => setForm(p => ({ ...p, request_field_map: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" />
              </div>
              <div>
                <Label className="text-[12px]">Passthrough Fields (JSON array)</Label>
                <Input value={form.passthrough_fields} onChange={e => setForm(p => ({ ...p, passthrough_fields: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" />
              </div>
              <div><Label className="text-[12px]">Min Summary Score</Label><Input type="number" value={form.min_summary_score} onChange={e => setForm(p => ({ ...p, min_summary_score: Number(e.target.value) }))} className="mt-1 bg-background" /></div>

              <Button onClick={handleSave} disabled={saving} className="gap-1.5 w-full">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
              </Button>

              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-[12px] font-medium text-foreground">Live Test Lookup</div>
                <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Phone e.g. 5402231670" className="bg-background font-mono" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={testFirstname} onChange={e => setTestFirstname(e.target.value)} placeholder="First name" className="bg-background" />
                  <Input value={testLastname} onChange={e => setTestLastname(e.target.value)} placeholder="Last name" className="bg-background" />
                </div>
                <Button onClick={handleTest} disabled={testing || !testPhone} className="gap-1.5 w-full">
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {testing ? 'Running...' : 'Run Test Lookup'}
                </Button>
                {testResult && <div className="mt-2"><JsonViewer data={testResult} title="HLR Response" /></div>}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Email Validation */}
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              <div className="text-[14px] font-semibold text-foreground">Email Validation</div>
            </div>
            <Toggle checked={emailForm.enabled} onChange={(v) => persistEmail({ enabled: v })} />
          </div>
          <div className={`text-[12px] mt-1 ${emailForm.enabled ? 'status-sold' : 'text-muted-foreground'}`}>
            {emailForm.enabled ? 'Active: syntax, MX, disposable' : 'Disabled'}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <StatChip label="Checked" value={emailChecked.toLocaleString()} tone="default" i={0} />
            <StatChip label="Passed" value={emailPassed.toLocaleString()} tone="good" i={1} />
            <StatChip label="Flagged" value={emailFlagged.toLocaleString()} tone={emailFlagged > 0 ? 'warn' : 'default'} i={2} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Pass rate</span>
              <span className="font-mono">{emailPassRate}% pass rate, sample of {emailChecked.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-border/60 overflow-hidden">
              <div className="h-full rounded-full bg-[hsl(152_65%_54%)]" style={{ width: `${emailPassRate}%` }} />
            </div>
          </div>

          {emailValidField && (
            <div className="flex items-center gap-2 px-3 py-2 mt-3 bg-muted/40 border border-border rounded-lg">
              <span className="text-[11px] text-muted-foreground">email_valid field:</span>
              <Badge variant="outline" className="font-mono text-[10px]">{`{{${emailValidField.field_name}}}`}</Badge>
            </div>
          )}

          <Collapsible open={emailConfigOpen} onOpenChange={setEmailConfigOpen} className="mt-3">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-1.5 justify-between">
                <span className="flex items-center gap-1.5"><Settings2 className="w-4 h-4" /> Configure email validation</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${emailConfigOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <Switch checked={emailForm.enabled} onCheckedChange={v => setEmailForm(p => ({ ...p, enabled: v }))} />
                <Label className="text-[12px]">Enabled</Label>
              </div>
              <RouteSupplierFilters
                suppliers={suppliers}
                filter_suppliers={emailForm.filter_suppliers}
                filter_supplier_types={emailForm.filter_supplier_types}
                filter_routes={emailForm.filter_routes}
                onChange={partial => setEmailForm(p => ({ ...p, ...partial }))}
              />
              <Button onClick={handleEmailSave} disabled={emailSaving} className="gap-1.5 w-full">
                <Save className="w-4 h-4" /> {emailSaving ? 'Saving...' : 'Save Settings'}
              </Button>

              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-[12px] font-medium text-foreground">Email Validation Test</div>
                <Input
                  value={testEmailInput}
                  onChange={e => setTestEmailInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (testEmailInput && !emailTesting) handleEmailTest(); } }}
                  placeholder="name@example.com"
                  className="bg-background font-mono"
                />
                <Button onClick={handleEmailTest} disabled={emailTesting || !testEmailInput} className="gap-1.5 w-full">
                  {emailTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {emailTesting ? 'Validating...' : 'Validate Email'}
                </Button>
                {emailResult && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[12px] text-muted-foreground">Verdict</div>
                      <Badge className={`${verdictStyles[emailResult.verdict] || verdictStyles.unknown} text-[11px]`}>
                        {emailResult.verdict?.replace(/_/g, ' ') || 'unknown'}
                      </Badge>
                    </div>
                    {emailResult.error ? (
                      <div className="text-status-error text-[12px]">{emailResult.error}</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div><span className="text-muted-foreground">Domain:</span> <span className="text-foreground font-mono">{emailResult.domain}</span></div>
                        <div><span className="text-muted-foreground">Format:</span> <span className="text-foreground">{String(emailResult.format)}</span></div>
                        <div><span className="text-muted-foreground">DNS:</span> <span className="text-foreground">{String(emailResult.dns)}</span></div>
                        <div><span className="text-muted-foreground">Disposable:</span> <span className="text-foreground">{String(emailResult.disposable)}</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Verification Log */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden mt-5">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-[13px] font-semibold text-foreground">Verification Log</div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportLog} disabled={logRows.length === 0}>
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
        {logRows.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted-foreground">No verification records yet</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {['Time', 'Lead', 'Check', 'Result', 'Latency'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logRows.map(l => {
                const isHlr = !!(l.hlr_status || l.hlr_error || l.hlr_response);
                const result = isHlr
                  ? (l.hlr_error ? 'Failed' : (l.hlr_status || 'Checked'))
                  : (l.email_valid === 'Yes' ? 'Passed' : l.email_valid === 'No' ? 'Flagged' : '-');
                const bad = isHlr ? !!l.hlr_error : l.email_valid === 'No';
                return (
                  <tr key={l.id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{l.created_date ? format(new Date(l.created_date), 'MMM dd HH:mm') : ''}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-foreground">{maskLead(l)}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{isHlr ? 'HLR' : 'Email'}</Badge></td>
                    <td className={`px-4 py-2.5 font-medium ${bad ? 'status-unsold' : 'status-sold'}`}>{result}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{l.process_time_ms ? `${l.process_time_ms}ms` : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* AI read */}
      <div className="rounded-[10px] border border-primary/25 bg-primary/5 p-4 mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-primary/80 mb-1">AI read</div>
        <p className="text-[13px] text-foreground leading-relaxed">{aiRead}</p>
      </div>
    </ToolsShell>
  );
}