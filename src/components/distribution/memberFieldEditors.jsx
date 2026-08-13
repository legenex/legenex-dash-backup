import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { AlertTriangle, X, Code2 } from 'lucide-react';

// Shared typed sub-editors for a RouteMember. Each editor is fully controlled:
// it takes a plain-object `value` and calls `onChange` with the next object.
// Every editor is wrapped by TypedJsonField, which adds an "Advanced JSON"
// toggle that swaps the typed UI for the raw JSON of that same field.

export const FILTER_FIELDS = [
  { key: 'states', label: 'States', placeholder: 'CA, TX, NY' },
  { key: 'zips', label: 'ZIP codes', placeholder: '90210, 10001' },
  { key: 'counties', label: 'Counties', placeholder: 'Los Angeles' },
  { key: 'verticals', label: 'Verticals', placeholder: 'mva, workers-comp' },
  { key: 'brands', label: 'Brands', placeholder: 'legenex' },
  { key: 'suppliers', label: 'Suppliers', placeholder: 'acme-media' },
  { key: 'sources', label: 'Sources', placeholder: 'paid-search' },
];

export const CAP_FIELDS = [
  { key: 'total', label: 'Total' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

export const WEEKDAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
];

// Parse JSON without throwing. Returns { ok, value, error }.
export function tryParseJson(text) {
  if (!String(text ?? '').trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Drop empty arrays / blank entries so filters JSON stays tidy.
export function cleanFilters(filters) {
  const out = {};
  for (const { key } of FILTER_FIELDS) {
    const arr = Array.isArray(filters?.[key]) ? filters[key].filter((v) => String(v).trim() !== '') : [];
    if (arr.length) out[key] = arr;
  }
  return out;
}

// Keep only positive finite numbers.
export function cleanCaps(caps) {
  const out = {};
  for (const { key } of CAP_FIELDS) {
    const n = Number(caps?.[key]);
    if (caps?.[key] !== '' && caps?.[key] != null && Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

// Emit a schedule only when at least one weekday window is defined.
export function cleanSchedule(schedule) {
  const win = schedule?.windows?.[0] || {};
  const days = Array.isArray(win.days) ? win.days.filter(Boolean) : [];
  if (!days.length) return {};
  return {
    timezone: schedule?.timezone || 'America/New_York',
    windows: [{ days, start: win.start || '00:00', end: win.end || '23:59' }],
  };
}

// --- Advanced JSON wrapper -------------------------------------------------

export function TypedJsonField({ id, title, description, value, onChange, children }) {
  const [advanced, setAdvanced] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const toggle = () => {
    if (!advanced) {
      setText(JSON.stringify(value ?? {}, null, 2));
      setError('');
    }
    setAdvanced((a) => !a);
  };

  const onText = (t) => {
    setText(t);
    const p = tryParseJson(t);
    if (!p.ok) { setError(p.error); return; }
    setError('');
    onChange(p.value);
  };

  return (
    <div className="rounded-[10px] border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
          {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={advanced}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
            advanced
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" /> Advanced JSON
        </button>
      </div>

      {advanced ? (
        <div>
          <Textarea
            id={`${id}-json`}
            value={text}
            onChange={(e) => onText(e.target.value)}
            aria-invalid={!!error}
            aria-label={`${title} raw JSON`}
            className="bg-background font-mono text-[12px] min-h-[150px] leading-relaxed"
          />
          {error ? (
            <p className="flex items-center gap-1.5 text-[11px] status-error mt-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Invalid JSON: {error}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1">Edits here write straight to the underlying field.</p>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// --- Chips input -----------------------------------------------------------

function ChipInput({ label, placeholder, values, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(values) ? values : [];

  const add = (raw) => {
    const parts = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange(Array.from(new Set([...list, ...parts])));
    setDraft('');
  };

  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && list.length) {
      onChange(list.slice(0, -1));
    }
  };

  return (
    <div>
      <Label className="text-[12px] font-medium">{label}</Label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 min-h-9 focus-within:ring-1 focus-within:ring-ring">
        {list.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-foreground">
            {v}
            <button
              type="button"
              onClick={() => onChange(list.filter((x) => x !== v))}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${v}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(draft)}
          placeholder={list.length ? '' : placeholder}
          className="flex-1 min-w-[80px] bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          aria-label={label}
        />
      </div>
    </div>
  );
}

// --- Typed editors ---------------------------------------------------------

export function FiltersEditor({ value, onChange }) {
  const set = (key, arr) => onChange({ ...(value || {}), [key]: arr });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {FILTER_FIELDS.map((f) => (
        <ChipInput
          key={f.key}
          label={f.label}
          placeholder={f.placeholder}
          values={value?.[f.key]}
          onChange={(arr) => set(f.key, arr)}
        />
      ))}
    </div>
  );
}

export function CapsEditor({ value, onChange }) {
  const set = (key, v) => onChange({ ...(value || {}), [key]: v });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {CAP_FIELDS.map((f) => (
        <div key={f.key}>
          <Label htmlFor={`cap-${f.key}`} className="text-[12px] font-medium">{f.label}</Label>
          <Input
            id={`cap-${f.key}`}
            type="number"
            min="0"
            value={value?.[f.key] ?? ''}
            onChange={(e) => set(f.key, e.target.value)}
            placeholder="0"
            className="mt-1 bg-background font-mono text-[12px]"
          />
        </div>
      ))}
    </div>
  );
}

export function ScheduleEditor({ value, onChange }) {
  const win = value?.windows?.[0] || { days: [], start: '09:00', end: '17:00' };
  const days = Array.isArray(win.days) ? win.days : [];

  const setWindow = (patch) => {
    onChange({
      timezone: value?.timezone || 'America/New_York',
      windows: [{ ...win, ...patch }],
    });
  };

  const toggleDay = (key) => {
    setWindow({ days: days.includes(key) ? days.filter((d) => d !== key) : [...days, key] });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-[12px] font-medium">Timezone</Label>
        <Select
          value={value?.timezone || 'America/New_York'}
          onValueChange={(tz) => onChange({ timezone: tz, windows: [win] })}
        >
          <SelectTrigger className="mt-1 bg-background" aria-label="Timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[12px] font-medium mb-1.5 block">Active days</Label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => {
            const on = days.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                aria-pressed={on}
                className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  on ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sched-start" className="text-[12px] font-medium">Start</Label>
          <Input
            id="sched-start"
            type="time"
            value={win.start || ''}
            onChange={(e) => setWindow({ start: e.target.value })}
            className="mt-1 bg-background font-mono text-[12px]"
          />
        </div>
        <div>
          <Label htmlFor="sched-end" className="text-[12px] font-medium">End</Label>
          <Input
            id="sched-end"
            type="time"
            value={win.end || ''}
            onChange={(e) => setWindow({ end: e.target.value })}
            className="mt-1 bg-background font-mono text-[12px]"
          />
        </div>
      </div>
    </div>
  );
}
