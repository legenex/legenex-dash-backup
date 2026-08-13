import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Globe, Mail, Sheet, Zap, MessageSquare, Plus, X, CircleCheck } from 'lucide-react';

// Delivery transports editor.
//
// A delivery endpoint can fire SEVERAL transports at once (fan-out), which is
// how a buyer gets a webhook into their CRM and an email to their intake inbox
// off the same lead. This is different from the endpoint tier ladder, where the
// next tier is only tried when the previous one fails.
//
// Exactly one enabled transport is the DECISIONING one: its response decides
// accepted/rejected/duplicate. Email and sheet transports cannot return an
// acceptance, so they are notify-only and can never be decisioning.
export const TRANSPORT_TYPES = [
  { type: 'webhook', label: 'Webhook', icon: Globe, canDecide: true, blurb: 'POST the lead to an endpoint. The response decides acceptance.' },
  { type: 'email', label: 'Email', icon: Mail, canDecide: false, blurb: 'Send the lead as a formatted email. Notify only.' },
  { type: 'google_sheet', label: 'Google Sheet', icon: Sheet, canDecide: false, blurb: 'Append the lead as a row. Notify only.' },
  { type: 'ghl', label: 'GHL', icon: Zap, canDecide: true, blurb: 'Push into GoHighLevel.', comingSoon: true },
  { type: 'sms', label: 'SMS', icon: MessageSquare, canDecide: false, blurb: 'Text the lead details.', comingSoon: true },
];

export function parseTransports(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

const BLANK_CONFIG = {
  webhook: { url: '', method: 'POST', encoding: 'json', headers: '', body_template: '' },
  email: { sender_name: '', to: '', reply_to: '', subject: 'New lead: {{first_name}} {{last_name}}', rows: [{ label: 'First Name', value: '{{first_name}}' }, { label: 'Last Name', value: '{{last_name}}' }, { label: 'Phone', value: '{{phone}}' }] },
  google_sheet: { mode: 'picker', spreadsheet_id: '', spreadsheet_url: '', worksheet: 'Sheet1' },
  ghl: {},
  sms: {},
};

const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-[12px] font-medium">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

export default function DeliveryTransportsEditor({ value, onChange, sheetsConnected = false, sheetOptions = [] }) {
  const transports = useMemo(() => parseTransports(value), [value]);

  const byType = useMemo(() => Object.fromEntries(transports.map((t) => [t.type, t])), [transports]);
  const decidingType = useMemo(() => (transports.find((t) => t.enabled && t.decisioning) || {}).type || null, [transports]);

  function commit(next) {
    onChange(JSON.stringify(next));
  }

  function toggle(type, on) {
    const meta = TRANSPORT_TYPES.find((m) => m.type === type);
    let next = transports.filter((t) => t.type !== type);
    if (on) {
      next = [...next, {
        type,
        enabled: true,
        decisioning: false,
        config: byType[type]?.config || BLANK_CONFIG[type] || {},
      }];
    }
    // Keep exactly one decisioning transport among those that can decide.
    const enabledDeciders = next.filter((t) => t.enabled && TRANSPORT_TYPES.find((m) => m.type === t.type)?.canDecide);
    if (enabledDeciders.length && !enabledDeciders.some((t) => t.decisioning)) {
      enabledDeciders[0].decisioning = true;
    }
    if (!meta?.canDecide) next = next.map((t) => (t.type === type ? { ...t, decisioning: false } : t));
    commit(next);
  }

  function setDeciding(type) {
    commit(transports.map((t) => ({ ...t, decisioning: t.type === type })));
  }

  function setConfig(type, patch) {
    commit(transports.map((t) => (t.type === type ? { ...t, config: { ...(t.config || {}), ...patch } } : t)));
  }

  function setRows(type, rows) { setConfig(type, { rows }); }

  return (
    <div className="space-y-2">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery methods</div>
      <p className="text-[11px] text-muted-foreground">
        Turn on every method this buyer wants. All enabled methods fire together for each accepted lead.
      </p>

      {TRANSPORT_TYPES.map((meta) => {
        const t = byType[meta.type];
        const on = !!t?.enabled;
        const cfg = t?.config || BLANK_CONFIG[meta.type] || {};
        const Icon = meta.icon;

        return (
          <div key={meta.type} className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 px-4 py-3">
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{meta.label}</span>
                  {meta.comingSoon && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Coming soon</span>
                  )}
                  {on && decidingType === meta.type && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <CircleCheck className="w-3 h-3" /> Decides acceptance
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{meta.blurb}</p>
              </div>
              <div className="ml-auto flex items-center gap-3 shrink-0">
                {on && meta.canDecide && decidingType !== meta.type && (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setDeciding(meta.type)}>
                    Use for acceptance
                  </Button>
                )}
                <Switch checked={on} disabled={meta.comingSoon} onCheckedChange={(v) => toggle(meta.type, v)} />
              </div>
            </div>

            {on && (
              <div className="border-t border-border px-4 py-3 space-y-3">
                {meta.type === 'webhook' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <Field label="Endpoint URL">
                          <Input value={cfg.url || ''} onChange={(e) => setConfig('webhook', { url: e.target.value })} placeholder="https://buyer.example/api" className="h-9 bg-background" />
                        </Field>
                      </div>
                      <Field label="Format">
                        <Select value={cfg.encoding || 'json'} onValueChange={(v) => setConfig('webhook', { encoding: v })}>
                          <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="json">json</SelectItem>
                            <SelectItem value="form">form</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <Field label="Headers (JSON)" hint="Non-secret headers only. Credentials are stored as a reference and resolved server side.">
                      <Textarea value={cfg.headers || ''} onChange={(e) => setConfig('webhook', { headers: e.target.value })} rows={2} className="bg-background text-xs font-mono" placeholder='{"X-Env":"prod"}' />
                    </Field>
                    <Field label="Body template" hint="Leave blank to send the mapped lead payload as is.">
                      <Textarea value={cfg.body_template || ''} onChange={(e) => setConfig('webhook', { body_template: e.target.value })} rows={3} className="bg-background text-xs font-mono" />
                    </Field>
                  </>
                )}

                {meta.type === 'email' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Sender name" hint="What recipients see in their inbox.">
                        <Input value={cfg.sender_name || ''} onChange={(e) => setConfig('email', { sender_name: e.target.value })} placeholder="Legenex" className="h-9 bg-background" />
                      </Field>
                      <Field label="Reply-to">
                        <Input value={cfg.reply_to || ''} onChange={(e) => setConfig('email', { reply_to: e.target.value })} placeholder="{{email}}" className="h-9 bg-background" />
                      </Field>
                    </div>
                    <Field label="To" hint="Separate multiple recipients with commas. Use {{field}} to insert a lead field.">
                      <Input value={cfg.to || ''} onChange={(e) => setConfig('email', { to: e.target.value })} placeholder="intake@buyer.com" className="h-9 bg-background" />
                    </Field>
                    <Field label="Subject">
                      <Input value={cfg.subject || ''} onChange={(e) => setConfig('email', { subject: e.target.value })} className="h-9 bg-background font-mono text-[12px]" />
                    </Field>

                    <div className="space-y-1.5">
                      <Label className="text-[12px] font-medium">Body rows</Label>
                      <div className="rounded-md border border-border overflow-hidden">
                        <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-3 py-2 border-b border-border bg-background/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <span>Label</span><span>Value</span><span />
                        </div>
                        {(cfg.rows || []).map((r, i) => (
                          <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 px-3 py-2 border-b border-border items-center">
                            <Input
                              value={r.label || ''}
                              onChange={(e) => { const rows = [...(cfg.rows || [])]; rows[i] = { ...rows[i], label: e.target.value }; setRows('email', rows); }}
                              className="h-8 bg-background text-[12px]"
                            />
                            <Input
                              value={r.value || ''}
                              onChange={(e) => { const rows = [...(cfg.rows || [])]; rows[i] = { ...rows[i], value: e.target.value }; setRows('email', rows); }}
                              className="h-8 bg-background text-[12px] font-mono"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setRows('email', (cfg.rows || []).filter((_, x) => x !== i))}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                        {(cfg.rows || []).length === 0 && (
                          <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">No rows yet.</div>
                        )}
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRows('email', [...(cfg.rows || []), { label: '', value: '' }])}>
                        <Plus className="w-3.5 h-3.5" /> Add row
                      </Button>
                    </div>
                  </>
                )}

                {meta.type === 'google_sheet' && (
                  <>
                    {!sheetsConnected && (
                      <div className="rounded-md border border-border bg-background/60 px-3 py-2.5">
                        <p className="text-[12px] text-foreground">Google Sheets is connected for reading only.</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Writing leads to a sheet needs the write permission granted in Settings &gt; Integrations. Until then this
                          transport saves its config but will not deliver.
                        </p>
                      </div>
                    )}
                    <Field label="Spreadsheet">
                      {sheetsConnected && sheetOptions.length > 0 ? (
                        <Select value={cfg.spreadsheet_id || ''} onValueChange={(v) => setConfig('google_sheet', { spreadsheet_id: v, mode: 'picker' })}>
                          <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Choose a spreadsheet" /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {sheetOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={cfg.spreadsheet_url || ''}
                          onChange={(e) => setConfig('google_sheet', { spreadsheet_url: e.target.value, mode: 'url' })}
                          placeholder="Paste the spreadsheet URL"
                          className="h-9 bg-background"
                        />
                      )}
                    </Field>
                    <Field label="Worksheet">
                      <Input value={cfg.worksheet || ''} onChange={(e) => setConfig('google_sheet', { worksheet: e.target.value })} placeholder="Sheet1" className="h-9 bg-background" />
                    </Field>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
