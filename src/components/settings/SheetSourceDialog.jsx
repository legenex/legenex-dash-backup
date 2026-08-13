import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Sparkles, Check, ArrowLeft, FileSpreadsheet, Link2, List, FolderOpen, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { pickSpreadsheet as openGooglePicker } from '@/lib/googlePicker';
import { useGooglePickerConfig } from '@/components/settings/GooglePickerSettings';
import { CORE_LEAD_FIELDS, IGNORE } from '@/components/settings/leadSourceFields';
import { SHEET_PURPOSES, MATCH_FIELDS, purposeMeta } from '@/components/settings/dataSourcePurposes';
import MappingReviewTable from '@/components/settings/MappingReviewTable';
import SupplierRulesEditor from '@/components/settings/SupplierRulesEditor';

// Extract a spreadsheet ID from a full Google Sheets URL or return the raw ID.
function extractSheetId(input) {
  if (!input) return '';
  const m = String(input).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : String(input).trim();
}

const NONE = '__none__';

const blankForm = {
  name: '', purpose: 'leads', sheetInput: '', sheet_id: '', spreadsheet_name: '', worksheet: '',
  supplier_name: '', buyer_code: '', campaign_id: '',
  dedupe_column: '', match_field: 'email', match_column: '', date_column: '', enabled: true,
};

// A labelled column picker that always offers "not set".
function ColumnSelect({ label, help, value, onChange, columns }) {
  return (
    <div>
      <Label className="text-[12px]">{label}</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Not set" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      {help && <p className="text-[11px] text-muted-foreground mt-1">{help}</p>}
    </div>
  );
}

export default function SheetSourceDialog({ open, onOpenChange, source, onSaved }) {
  const editing = !!source;
  const [step, setStep] = useState('purpose'); // purpose | sheet | columns | mapping
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [cfg, setCfg] = useState({});
  const [columns, setColumns] = useState([]);
  const [included, setIncluded] = useState([]);
  const [sample, setSample] = useState({});
  const [rowCount, setRowCount] = useState(null);
  const [mapping, setMapping] = useState({});
  const [driveFiles, setDriveFiles] = useState(null); // null = still loading
  const [account, setAccount] = useState(null);
  const [byUrl, setByUrl] = useState(false);
  const [picking, setPicking] = useState(false);
  const [worksheets, setWorksheets] = useState([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  const { data: pickerCfg } = useGooglePickerConfig();
  const pickerReady = !!(pickerCfg?.client_id && pickerCfg?.api_key);

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list('-created_date', 200) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers-for-sources'], queryFn: () => base44.entities.Buyer.list('company_name', 200) });
  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list('-created_date', 200) });
  const { data: customFields = [] } = useQuery({ queryKey: ['custom-fields'], queryFn: () => base44.entities.CustomField.list('sort_order') });

  const meta = purposeMeta(SHEET_PURPOSES, form.purpose);
  const createsLeads = form.purpose === 'leads' || (form.purpose === 'inbound_calls' && cfg.create_leads === true);
  const needsSupplier = form.purpose === 'leads' || form.purpose === 'cost';
  const needsBuyer = form.purpose === 'buyer_feedback' || form.purpose === 'disqualified';
  const targetFields = [...CORE_LEAD_FIELDS, 'disposition', 'buyer_conversion', 'buyer_returned',
    ...customFields.map((f) => f.field_name).filter((n) => n && !CORE_LEAD_FIELDS.includes(n))];

  useEffect(() => {
    if (!open) return;
    if (source) {
      setForm({
        name: source.name || '', purpose: source.purpose || 'leads',
        sheetInput: source.sheet_id || '', sheet_id: source.sheet_id || '',
        spreadsheet_name: source.spreadsheet_name || '', worksheet: source.worksheet || '',
        supplier_name: source.supplier_name || '', buyer_code: source.buyer_code || '',
        campaign_id: source.campaign_id || '', dedupe_column: source.dedupe_column || '',
        match_field: source.match_field || 'email', match_column: source.match_column || '',
        date_column: source.date_column || '', enabled: source.enabled ?? true,
      });
      let savedMapping = {};
      try { savedMapping = JSON.parse(source.mapping || '{}'); } catch { savedMapping = {}; }
      setMapping(savedMapping);
      setColumns(Object.keys(savedMapping));
      try { setCfg(JSON.parse(source.purpose_config || '{}')); } catch { setCfg({}); }
      try { setIncluded(JSON.parse(source.included_columns || '[]')); } catch { setIncluded([]); }
    } else {
      setForm(blankForm); setCfg({}); setMapping({}); setColumns([]); setIncluded([]); setSample({});
    }
    setWorksheets([]); setRowCount(null); setByUrl(false);
    setStep('purpose');
  }, [open, source]);

  // Load the connected account and its spreadsheets once per open.
  useEffect(() => {
    if (!open || driveFiles !== null) return;
    (async () => {
      try {
        const st = await base44.functions.invoke('syncGoogleSheets', { account_status: true });
        setAccount(st.data || null);
      } catch { setAccount(null); }
      try {
        const res = await base44.functions.invoke('syncGoogleSheets', { list_spreadsheets: true });
        const files = res.data?.files || [];
        setDriveFiles(files);
        if (!files.length) setByUrl(true);
      } catch {
        setDriveFiles([]); setByUrl(true);
      }
    })();
  }, [open, driveFiles]);

  // Reading columns is not a button press: pick a tab and the columns arrive.
  const readColumns = async (sheetId, worksheet) => {
    if (!sheetId || !worksheet) return;
    setReading(true);
    try {
      const res = await base44.functions.invoke('syncGoogleSheets', { preview: true, sheet_id: sheetId, worksheet });
      if (res.data?.error) { toast.error(res.data.error); setReading(false); return; }
      const cols = res.data?.columns || [];
      setColumns(cols);
      setSample(res.data?.sample || {});
      setRowCount(res.data?.rowCount ?? null);
      setIncluded((prev) => (prev.length ? prev.filter((c) => cols.includes(c)) : cols));

      // Guess the obvious ones so you confirm rather than type.
      const lower = (c) => String(c).toLowerCase();
      const find = (...needles) => cols.find((c) => needles.some((n) => lower(c).includes(n))) || '';
      setForm((p) => ({
        ...p,
        match_column: p.match_column && cols.includes(p.match_column)
          ? p.match_column
          : find(p.match_field === 'mobile' ? 'phone' : p.match_field, 'phone', 'email'),
        date_column: p.date_column && cols.includes(p.date_column) ? p.date_column : find('timestamp', 'date', 'time'),
      }));
      setCfg((p) => ({
        ...p,
        disposition_column: p.disposition_column || find('dispo', 'disposition', 'status'),
        converted_column: p.converted_column || find('converted', 'conversion'),
        returned_column: p.returned_column || find('returned', 'return'),
        revenue_column: p.revenue_column || find('revenue', 'payout', 'price'),
        notes_column: p.notes_column || find('note'),
        spend_column: p.spend_column || find('total cost', 'cost', 'spend'),
      }));
    } catch {
      toast.error('Could not read that tab, check the sheet is shared with the connected account');
    }
    setReading(false);
  };

  const loadWorksheets = async (sheetId) => {
    if (!sheetId) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('syncGoogleSheets', { list_worksheets: true, sheet_id: sheetId });
      if (res.data?.error) { toast.error(res.data.error); setBusy(false); return; }
      const tabs = res.data?.worksheets || [];
      setWorksheets(tabs);
      const tab = form.worksheet && tabs.includes(form.worksheet) ? form.worksheet : (tabs[0] || 'Sheet1');
      setForm((p) => ({
        ...p,
        spreadsheet_name: res.data?.title || p.spreadsheet_name,
        worksheet: tab,
        name: p.name || res.data?.title || '',
      }));
      setBusy(false);
      await readColumns(sheetId, tab);
      return;
    } catch {
      toast.error('Could not open that spreadsheet, check it is shared with the connected Google account');
    }
    setBusy(false);
  };

  const pickSpreadsheet = async (fileId) => {
    const file = (driveFiles || []).find((f) => f.id === fileId);
    setForm((p) => ({ ...p, sheet_id: fileId, sheetInput: fileId, spreadsheet_name: file?.name || '', worksheet: '' }));
    setColumns([]); setWorksheets([]);
    await loadWorksheets(fileId);
  };

  const usePastedLink = async () => {
    const id = extractSheetId(form.sheetInput);
    if (!id) { toast.error('Paste a Google Sheets link or ID'); return; }
    setForm((p) => ({ ...p, sheet_id: id, worksheet: '' }));
    setColumns([]); setWorksheets([]);
    await loadWorksheets(id);
  };

  // Google's own file browser, against the operator's live Google session.
  const browseDrive = async () => {
    setPicking(true);
    try {
      const file = await openGooglePicker({
        clientId: pickerCfg.client_id, apiKey: pickerCfg.api_key, appId: pickerCfg.app_id,
      });
      if (file?.id) {
        setForm((p) => ({ ...p, sheet_id: file.id, sheetInput: file.id, spreadsheet_name: file.name || '', worksheet: '' }));
        setColumns([]); setWorksheets([]);
        await loadWorksheets(file.id);
      }
    } catch (err) {
      toast.error(err?.message || 'Could not open the Google picker');
    }
    setPicking(false);
  };

  const pickWorksheet = async (tab) => {
    setForm((p) => ({ ...p, worksheet: tab }));
    setColumns([]);
    await readColumns(form.sheet_id, tab);
  };

  const goFromSheet = async () => {
    if (!form.sheet_id) { toast.error('Pick a spreadsheet'); return; }
    if (!columns.length) { toast.error('Pick a tab so the columns can be read'); return; }
    if (meta.needsMatch && !form.match_column) { toast.error('Pick the column that identifies the lead'); return; }
    setStep('columns');
  };

  const goFromColumns = async () => {
    if (form.purpose === 'cost' && !cfg.spend_column) { toast.error('Pick the column holding the spend amount'); return; }
    if (form.purpose === 'cost' && !form.date_column) { toast.error('Pick the column holding the date'); return; }
    if (createsLeads) {
      if (Object.keys(mapping).length === 0) {
        setBusy(true);
        try {
          const ai = await base44.integrations.Core.InvokeLLM({
            prompt: `Map each Google Sheet column to the best matching target lead field. Columns: ${JSON.stringify(included)}. Target fields: ${JSON.stringify(targetFields)}. If a column has no good match, map it to "${IGNORE}". Return a JSON object of column -> target field.`,
            response_json_schema: { type: 'object', properties: { mapping: { type: 'object', additionalProperties: { type: 'string' } } } },
          });
          const auto = ai?.mapping || {};
          const finalMap = {};
          included.forEach((c) => { finalMap[c] = targetFields.includes(auto[c]) ? auto[c] : IGNORE; });
          setMapping(finalMap);
        } catch {
          const finalMap = {};
          included.forEach((c) => { finalMap[c] = IGNORE; });
          setMapping(finalMap);
        }
        setBusy(false);
      }
      setStep('mapping');
      return;
    }
    await save();
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Give this source a name'); return; }
    if (needsSupplier && !form.supplier_name) { toast.error('Pick the supplier this sheet is attributed to'); return; }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(), kind: 'google_sheets', enabled: form.enabled,
        purpose: form.purpose,
        sheet_id: form.sheet_id || extractSheetId(form.sheetInput),
        spreadsheet_name: form.spreadsheet_name,
        worksheet: form.worksheet || 'Sheet1',
        google_account: account?.account || '',
        // Every sheet syncs continuously. The longer intervals stay in the
        // schema for a sheet that should not be hammered, set from chat.
        sync_interval: '1m',
        supplier_name: needsSupplier ? form.supplier_name : (form.supplier_name || ''),
        buyer_code: needsBuyer ? form.buyer_code : '',
        link_type: needsBuyer ? 'buyer' : needsSupplier ? 'supplier' : 'none',
        campaign_id: form.campaign_id,
        dedupe_column: form.dedupe_column,
        match_field: form.match_field,
        match_column: form.match_column,
        date_column: form.date_column,
        included_columns: JSON.stringify(included),
        purpose_config: JSON.stringify(cfg),
        mapping: JSON.stringify(mapping),
      };
      let saved;
      if (editing) saved = await base44.entities.LeadSource.update(source.id, payload);
      else saved = await base44.entities.LeadSource.create(payload);

      // Only a sheet that reaches processLead needs an ingestion key.
      if (createsLeads) {
        await base44.functions.invoke('provisionLeadSource', { source_id: saved.id || source?.id });
      }
      toast.success(editing ? 'Source updated' : 'Sheet connected');
      onSaved?.();
      onOpenChange(false);
    } catch {
      toast.error('Could not save this source');
    }
    setBusy(false);
  };

  const toggleColumn = (col) => {
    setIncluded((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
  };

  // Custom columns are held as an ordered list while editing and serialised to a
  // column to field object on save.
  const customRows = Array.isArray(cfg._custom_rows) ? cfg._custom_rows : [];
  const serialiseCustom = (rows) => JSON.stringify(rows.reduce((acc, r) => {
    const col = String(r.column || '').trim();
    const field = String(r.field || '').trim();
    if (col && field) acc[col] = field;
    return acc;
  }, {}));
  const setCustomRows = (rows) => setCfg((p) => ({ ...p, _custom_rows: rows, custom_map: serialiseCustom(rows) }));

  // Describe the sheet in words and let the model do the wiring. It only ever
  // proposes configuration, never writes data, and every value it picks lands in
  // a visible control that can be overridden before saving.
  const aiConfigure = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe what this sheet holds first'); return; }
    setAiBusy(true); setAiNote('');
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: [
          'You are configuring a Google Sheet data source for a lead generation platform.',
          `The sheet purpose is "${form.purpose}", meaning: ${meta.desc}`,
          `Sheet columns: ${JSON.stringify(columns)}`,
          `First row of data: ${JSON.stringify(sample)}`,
          `The operator describes the sheet as: ${aiPrompt.trim()}`,
          '',
          'Choose the column that fits each role. Use exact column names from the list, or an empty string when nothing fits.',
          'match_column identifies which lead the row belongs to. match_field is how to match it: email, mobile, lead_id or id.',
          'custom_fields maps any other meaningful column to a short snake_case field name, for values worth keeping that have no dedicated role.',
          'Return JSON only.',
        ].join('\n'),
        response_json_schema: {
          type: 'object',
          properties: {
            match_field: { type: 'string' },
            match_column: { type: 'string' },
            date_column: { type: 'string' },
            dedupe_column: { type: 'string' },
            disposition_column: { type: 'string' },
            converted_column: { type: 'string' },
            returned_column: { type: 'string' },
            return_reason_column: { type: 'string' },
            notes_column: { type: 'string' },
            revenue_column: { type: 'string' },
            spend_column: { type: 'string' },
            reason_column: { type: 'string' },
            custom_fields: { type: 'object', additionalProperties: { type: 'string' } },
            explanation: { type: 'string' },
          },
        },
      });

      const valid = (v) => (v && columns.includes(v) ? v : '');
      const matchField = ['email', 'mobile', 'lead_id', 'id'].includes(res?.match_field) ? res.match_field : form.match_field;

      setForm((p) => ({
        ...p,
        match_field: matchField,
        match_column: valid(res?.match_column) || p.match_column,
        date_column: valid(res?.date_column) || p.date_column,
        dedupe_column: valid(res?.dedupe_column) || p.dedupe_column,
      }));

      const custom = res?.custom_fields && typeof res.custom_fields === 'object' ? res.custom_fields : {};
      const rows = Object.entries(custom)
        .filter(([col]) => columns.includes(col))
        .map(([column, field]) => ({ column, field: String(field) }));

      setCfg((p) => {
        const next = {
          ...p,
          disposition_column: valid(res?.disposition_column) || p.disposition_column,
          converted_column: valid(res?.converted_column) || p.converted_column,
          returned_column: valid(res?.returned_column) || p.returned_column,
          return_reason_column: valid(res?.return_reason_column) || p.return_reason_column,
          notes_column: valid(res?.notes_column) || p.notes_column,
          revenue_column: valid(res?.revenue_column) || p.revenue_column,
          spend_column: valid(res?.spend_column) || p.spend_column,
          reason_column: valid(res?.reason_column) || p.reason_column,
        };
        if (rows.length) { next._custom_rows = rows; next.custom_map = serialiseCustom(rows); }
        return next;
      });

      // Columns the model gave a role to are the ones worth reading.
      const touched = [
        res?.match_column, res?.date_column, res?.dedupe_column, res?.disposition_column,
        res?.converted_column, res?.returned_column, res?.return_reason_column,
        res?.notes_column, res?.revenue_column, res?.spend_column, res?.reason_column,
        ...rows.map((r) => r.column),
      ].filter((c) => c && columns.includes(c));
      if (touched.length) setIncluded((prev) => Array.from(new Set([...prev, ...touched])));

      setAiNote(res?.explanation || 'Configured. Check each field below before saving.');
      toast.success('Configured from your description');
    } catch {
      toast.error('Could not configure this sheet automatically');
    }
    setAiBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[680px] max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            {editing ? 'Edit' : 'Connect a'} Google Sheet
            <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-primary">
              {meta.label}
            </span>
            {form.spreadsheet_name && (
              <span className="text-[12px] font-normal text-muted-foreground truncate max-w-[240px]">
                {form.spreadsheet_name}{form.worksheet ? ` / ${form.worksheet}` : ''}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: what is this sheet for */}
        {step === 'purpose' && (
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">What is this sheet for? *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {SHEET_PURPOSES.map((p) => {
                  const active = form.purpose === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, purpose: p.value }))}
                      className={`text-left rounded-lg border p-3 transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent'}`}
                    >
                      <div className={`text-[13px] font-medium ${active ? 'text-primary' : 'text-foreground'}`}>{p.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{p.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Writes to</div>
              <div className="text-[13px] text-foreground mt-1">{meta.writesTo}</div>
            </div>
            <div>
              <Label className="text-[12px]">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. AG1 Buyer Feedback" className="mt-1 bg-background" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => setStep('sheet')} disabled={!form.name.trim()}>Next</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: which spreadsheet, which tab, and the mapping fields */}
        {step === 'sheet' && (
          <div className="space-y-4">
            {/* Connected account */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[12px] text-muted-foreground">
                Google account:{' '}
                <span className="text-foreground">{account?.account || (account?.connected ? 'connected' : 'not connected')}</span>
              </div>
              {driveFiles !== null && (
                <button
                  type="button"
                  onClick={() => setByUrl((v) => !v)}
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  {byUrl ? <><List className="w-3 h-3" /> Pick from Drive</> : <><Link2 className="w-3 h-3" /> Paste a link instead</>}
                </button>
              )}
            </div>

            <div>
              <Label className="text-[12px]">Spreadsheet *</Label>

              {/* Google's own browser. Preferred when configured, because it
                  needs no restricted scope and shows every sheet the operator
                  can reach, including ones shared with them. */}
              {pickerReady && (
                <div className="mt-1 mb-2">
                  <Button variant="outline" onClick={browseDrive} disabled={picking} className="gap-1.5 w-full justify-center">
                    {picking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                    {form.spreadsheet_name ? `Change sheet (${form.spreadsheet_name})` : 'Browse my Google Drive'}
                  </Button>
                </div>
              )}

              {driveFiles === null ? (
                <div className="mt-1 text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading your Google Drive
                </div>
              ) : byUrl || driveFiles.length === 0 ? (
                <div className="mt-1 space-y-2">
                  <div className="flex gap-2">
                    <Input value={form.sheetInput} onChange={(e) => setForm((p) => ({ ...p, sheetInput: e.target.value }))} placeholder="https://docs.google.com/spreadsheets/d/..." className="bg-background font-mono text-[12px]" />
                    <Button size="sm" variant="outline" onClick={usePastedLink} disabled={busy}>Use link</Button>
                  </div>
                  {driveFiles.length === 0 && account?.can_list === false && !pickerReady && (
                    <p className="text-[11px] text-muted-foreground">
                      Browsing your Drive needs the picker set up once, from the Google Sheets panel. Until then, paste the sheet link here. Everything after this step works identically either way.
                    </p>
                  )}
                </div>
              ) : (
                <SearchableSelect
                  value={form.sheet_id}
                  onValueChange={pickSpreadsheet}
                  className="mt-1 bg-background"
                  placeholder="Pick a spreadsheet"
                  options={driveFiles.map((f) => ({ value: f.id, label: f.name }))}
                />
              )}
            </div>

            {(worksheets.length > 0 || busy) && (
              <div>
                <Label className="text-[12px]">Tab *</Label>
                <Select value={form.worksheet} onValueChange={pickWorksheet} disabled={busy}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder={busy ? 'Loading tabs' : 'Pick a tab'} /></SelectTrigger>
                  <SelectContent>{worksheets.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {reading && (
              <div className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading columns
              </div>
            )}

            {/* Mapping fields, in place of the old belongs-to question */}
            {columns.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium text-foreground">Mapping fields</div>
                  <div className="text-[11px] text-muted-foreground">{columns.length} columns, {rowCount ?? 0} rows</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[12px]">{meta.needsMatch ? 'Match leads on *' : 'Match leads on'}</Label>
                    <Select
                      value={form.match_field}
                      onValueChange={(v) => setForm((p) => ({ ...p, match_field: v }))}
                    >
                      <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{MATCH_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <ColumnSelect
                    label={meta.needsMatch ? 'Column holding it *' : 'Column holding it'}
                    value={form.match_column}
                    onChange={(v) => setForm((p) => ({ ...p, match_column: v }))}
                    columns={columns}
                  />
                  <ColumnSelect
                    label={form.purpose === 'cost' ? 'Date column *' : 'Date column'}
                    value={form.date_column}
                    onChange={(v) => setForm((p) => ({ ...p, date_column: v }))}
                    columns={columns}
                  />
                  <ColumnSelect
                    label="De-dupe key column"
                    value={form.dedupe_column}
                    onChange={(v) => setForm((p) => ({ ...p, dedupe_column: v }))}
                    columns={columns}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The match column is how a row finds its lead. The de-dupe column stops the same row being processed twice; without one the whole row is hashed.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('purpose')} className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <Button onClick={goFromSheet} disabled={busy || reading || !columns.length} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Next, choose rows
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: which columns to read, and what the key ones mean */}
        {step === 'columns' && (
          <div className="space-y-5">
            {/* Describe it, let the model wire it up */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-primary" />
                <div className="text-[13px] font-medium text-foreground">Configure with AI</div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Describe what this sheet holds and the model fills in the fields below. It only proposes configuration, it never writes data, and every choice lands in a control you can change.
              </p>
              <div className="flex gap-2">
                <Input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. AG1 feedback, Phone is the consumer, Qualified Flag means converted, Net Cost is what they paid us"
                  className="bg-background text-[12px]"
                />
                <Button variant="outline" onClick={aiConfigure} disabled={aiBusy || !columns.length} className="gap-1.5 shrink-0">
                  {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Configure
                </Button>
              </div>
              {aiNote && <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">{aiNote}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[12px]">Columns to read</Label>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setIncluded(columns)}>All</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setIncluded([])}>None</Button>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-border bg-card p-3 max-h-[180px] overflow-y-auto">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {columns.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-[12px] text-foreground cursor-pointer">
                      <input type="checkbox" checked={included.includes(c)} onChange={() => toggleColumn(c)} className="accent-primary" />
                      <span className="truncate" title={c}>{c}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{included.length} of {columns.length} columns included.</p>
            </div>

            {form.purpose === 'inbound_calls' && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 pr-3">
                  <div className="text-[13px] text-foreground">Create leads from these rows</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    On: every row is ingested as a new lead through the pipeline. Off: rows are recorded as call outcomes against leads that already exist.
                  </p>
                </div>
                <Switch checked={cfg.create_leads === true} onCheckedChange={(v) => setCfg((p) => ({ ...p, create_leads: v }))} />
              </div>
            )}

            {(form.purpose === 'inbound_calls' || form.purpose === 'call_attribution') && (
              <div className="rounded-lg border border-border bg-card p-4">
                <SupplierRulesEditor
                  value={cfg.supplier_rules}
                  onChange={(v) => setCfg((p) => ({ ...p, supplier_rules: v }))}
                  fieldOptions={columns.map((c) => ({ value: c, label: c }))}
                  description="The sheet names the traffic its own way, e.g. a Publisher column reading CHECK-A-CASE-MVA, which is not our sid. Translate it into a supplier source here. A call matched to a known lead on its number always wins over a rule; rules only fill in what the row leaves blank."
                />
              </div>
            )}

            {(form.purpose === 'buyer_feedback' || form.purpose === 'inbound_calls') && cfg.create_leads !== true && (
              <div className="grid grid-cols-2 gap-3">
                <ColumnSelect label="Disposition column" value={cfg.disposition_column} onChange={(v) => setCfg((p) => ({ ...p, disposition_column: v }))} columns={columns} />
                <ColumnSelect label="Converted column" value={cfg.converted_column} onChange={(v) => setCfg((p) => ({ ...p, converted_column: v }))} columns={columns} />
                <ColumnSelect label="Returned column" value={cfg.returned_column} onChange={(v) => setCfg((p) => ({ ...p, returned_column: v }))} columns={columns} />
                <ColumnSelect label="Return reason column" value={cfg.return_reason_column} onChange={(v) => setCfg((p) => ({ ...p, return_reason_column: v }))} columns={columns} />
                <ColumnSelect label="Notes column" value={cfg.notes_column} onChange={(v) => setCfg((p) => ({ ...p, notes_column: v }))} columns={columns} />
              </div>
            )}

            {/* Conversion value: where the money comes from and where it lands */}
            {(form.purpose === 'buyer_feedback' || form.purpose === 'inbound_calls') && cfg.create_leads !== true && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="text-[13px] font-medium text-foreground">Conversion value</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[12px]">Where it comes from</Label>
                    <Select
                      value={cfg.conversion_value_mode || 'column'}
                      onValueChange={(v) => setCfg((p) => ({ ...p, conversion_value_mode: v }))}
                    >
                      <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="column">A column on the sheet</SelectItem>
                        <SelectItem value="fixed">A flat amount per conversion</SelectItem>
                        <SelectItem value="none">Do not record a value</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(cfg.conversion_value_mode || 'column') === 'column' ? (
                    <ColumnSelect
                      label="Value column"
                      value={cfg.revenue_column}
                      onChange={(v) => setCfg((p) => ({ ...p, revenue_column: v }))}
                      columns={columns}
                    />
                  ) : (cfg.conversion_value_mode === 'fixed' && (
                    <div>
                      <Label className="text-[12px]">Amount per conversion</Label>
                      <Input
                        value={cfg.conversion_value_fixed || ''}
                        onChange={(e) => setCfg((p) => ({ ...p, conversion_value_fixed: e.target.value }))}
                        placeholder="e.g. 850"
                        className="mt-1 bg-background font-mono text-[12px]"
                      />
                    </div>
                  ))}
                  {cfg.conversion_value_mode !== 'none' && (
                    <div>
                      <Label className="text-[12px]">Write it to</Label>
                      <Select
                        value={cfg.conversion_value_field || 'revenue'}
                        onValueChange={(v) => setCfg((p) => ({ ...p, conversion_value_field: v }))}
                      >
                        <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue">Revenue (what the lead sold for)</SelectItem>
                          <SelectItem value="conv_value">Conversion value (what it was worth to the buyer)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {cfg.conversion_value_mode !== 'none' && (
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <div className="min-w-0 pr-3">
                      <div className="text-[12px] text-foreground">Only record a value on converted rows</div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        On: a row that did not convert leaves the money fields untouched. Off: every row with a value writes one.
                      </p>
                    </div>
                    <Switch
                      checked={cfg.conversion_value_only_when_converted === true}
                      onCheckedChange={(v) => setCfg((p) => ({ ...p, conversion_value_only_when_converted: v }))}
                    />
                  </div>
                )}
              </div>
            )}

            {form.purpose === 'disqualified' && (
              <div className="space-y-3">
                <ColumnSelect label="Reason column" value={cfg.reason_column} onChange={(v) => setCfg((p) => ({ ...p, reason_column: v }))} columns={columns} />
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <div className="min-w-0 pr-3">
                    <div className="text-[13px] text-foreground">Also set the lead status to Disqualified</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Off by default. The feedback record is always written; this rewrites the lead's own lifecycle status as well.
                    </p>
                  </div>
                  <Switch checked={cfg.set_status === true} onCheckedChange={(v) => setCfg((p) => ({ ...p, set_status: v }))} />
                </div>
              </div>
            )}

            {form.purpose === 'cost' && (
              <div className="grid grid-cols-2 gap-3">
                <ColumnSelect label="Spend column *" value={cfg.spend_column} onChange={(v) => setCfg((p) => ({ ...p, spend_column: v }))} columns={columns} />
                <ColumnSelect label="Leads column" value={cfg.leads_column} onChange={(v) => setCfg((p) => ({ ...p, leads_column: v }))} columns={columns} />
                <ColumnSelect label="Clicks column" value={cfg.clicks_column} onChange={(v) => setCfg((p) => ({ ...p, clicks_column: v }))} columns={columns} />
                <ColumnSelect label="Impressions column" value={cfg.impressions_column} onChange={(v) => setCfg((p) => ({ ...p, impressions_column: v }))} columns={columns} />
                <div>
                  <Label className="text-[12px]">Currency</Label>
                  <Input value={cfg.currency || 'USD'} onChange={(e) => setCfg((p) => ({ ...p, currency: e.target.value }))} className="mt-1 bg-background" />
                </div>
                <div>
                  <Label className="text-[12px]">Vertical</Label>
                  <Input value={cfg.vertical || ''} onChange={(e) => setCfg((p) => ({ ...p, vertical: e.target.value }))} placeholder="Optional, e.g. MVA" className="mt-1 bg-background" />
                </div>
              </div>
            )}

            {/* Attribution, asked only where the purpose actually needs it */}
            {(needsSupplier || needsBuyer) && (
              <div className="grid grid-cols-2 gap-3">
                {needsSupplier && (
                  <div>
                    <Label className="text-[12px]">Attribute to supplier *</Label>
                    <SearchableSelect
                      value={form.supplier_name}
                      onValueChange={(v) => setForm((p) => ({ ...p, supplier_name: v }))}
                      className="mt-1 bg-background"
                      placeholder="Select supplier"
                      options={suppliers.map((s) => ({ value: s.name, label: s.name }))}
                    />
                  </div>
                )}
                {needsBuyer && (
                  <div>
                    <Label className="text-[12px]">Buyer this feedback is from</Label>
                    <SearchableSelect
                      value={form.buyer_code}
                      onValueChange={(v) => setForm((p) => ({ ...p, buyer_code: v }))}
                      className="mt-1 bg-background"
                      placeholder="Read from the lead if blank"
                      options={buyers.filter((b) => b.buyer_code).map((b) => ({ value: b.buyer_code, label: `${b.company_name || b.name} (${b.buyer_code})` }))}
                    />
                  </div>
                )}
                {form.purpose === 'leads' && (
                  <div>
                    <Label className="text-[12px]">Campaign</Label>
                    <SearchableSelect
                      value={form.campaign_id}
                      onValueChange={(v) => setForm((p) => ({ ...p, campaign_id: v }))}
                      className="mt-1 bg-background"
                      placeholder="Optional"
                      options={[{ value: '', label: 'None' }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
                    />
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('sheet')} className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <Button onClick={goFromColumns} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {createsLeads ? 'Next, map fields' : (editing ? 'Save source' : 'Connect sheet')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: field mapping, only when rows become leads */}
        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="text-[13px] text-foreground font-medium">Review column mapping</div>
            <MappingReviewTable columns={included} sample={sample} mapping={mapping} setMapping={setMapping} targetFields={targetFields} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('columns')} className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <Button onClick={save} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editing ? 'Save source' : 'Connect sheet'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
