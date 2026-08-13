import React from 'react';
import { Plus, X } from 'lucide-react';

// Shared label used across every field on the public onboarding form.
function FieldLabel({ label, required }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
      {label}{required && <span className="text-primary ml-0.5">*</span>}
    </label>
  );
}

// A labelled text/number input for the public onboarding form. Shows an inline
// error message under the field when the server returns a validation problem.
export function ApplyField({ label, value, onChange, error, type = 'text', placeholder = '', required = false, disabled = false }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}{required && <span className="text-primary ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`h-11 w-full rounded-lg border bg-background px-3.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          error ? 'border-primary' : 'border-border'
        }${disabled ? ' opacity-60 cursor-not-allowed bg-muted/30' : ''}`}
      />
      {error && <div className="mt-1 text-[12px] text-primary">{error}</div>}
    </div>
  );
}

// A phone input that always defaults to the United States. A fixed +1 prefix is
// shown to the left; the value stored already carries the +1 so the operator
// never has to guess the country.
export function PhoneField({ label, value, onChange, error, required = false }) {
  // Keep only the digits/spaces after the +1 the user types, so the stored
  // value is always US formatted and never defaults to another country.
  const local = (value ?? '').replace(/^\+1\s*/, '');
  const handle = (raw) => {
    const digits = raw.replace(/[^\d\s()-]/g, '');
    onChange(digits.trim() === '' ? '' : `+1 ${digits}`);
  };
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <div className={`flex h-11 w-full items-center rounded-lg border bg-background transition-colors focus-within:ring-1 focus-within:ring-ring ${error ? 'border-primary' : 'border-border'}`}>
        <span className="pl-3.5 pr-2 text-[14px] font-mono text-muted-foreground select-none">+1</span>
        <input
          type="tel"
          inputMode="tel"
          value={local}
          onChange={(e) => handle(e.target.value)}
          placeholder="512 555 0123"
          className="h-full flex-1 bg-transparent pr-3.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none"
        />
      </div>
      {error && <div className="mt-1 text-[12px] text-primary">{error}</div>}
    </div>
  );
}

// A labelled select built on a native element so it works on the public route
// without pulling in the operator UI kit.
export function ApplySelect({ label, value, onChange, error, options = [], placeholder = 'Select...', required = false, disabled = false }) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`h-11 w-full rounded-lg border bg-background px-3.5 text-[14px] text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          error ? 'border-primary' : 'border-border'
        } ${value ? '' : 'text-muted-foreground/60'}${disabled ? ' opacity-60 cursor-not-allowed bg-muted/30' : ''}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <div className="mt-1 text-[12px] text-primary">{error}</div>}
    </div>
  );
}

// A repeatable list of email addresses. Stores an array of strings. Empty rows
// are filtered out by the caller before submit.
export function EmailListField({ label, values = [], onChange, placeholder = 'name@company.com' }) {
  const rows = values.length ? values : [''];
  const update = (i, v) => {
    const next = [...rows];
    next[i] = v;
    onChange(next);
  };
  const add = () => onChange([...rows, '']);
  const remove = (i) => {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length ? next : ['']);
  };
  return (
    <div>
      <FieldLabel label={label} />
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="email"
              value={row}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
              className="h-11 flex-1 rounded-lg border border-border bg-background px-3.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add another
      </button>
    </div>
  );
}

// A repeatable list of plain text values (used for TCPA outbound phone numbers).
export function TextListField({ label, hint, values = [], onChange, placeholder = '' }) {
  const rows = values.length ? values : [''];
  const update = (i, v) => {
    const next = [...rows];
    next[i] = v;
    onChange(next);
  };
  const add = () => onChange([...rows, '']);
  const remove = (i) => {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length ? next : ['']);
  };
  return (
    <div>
      <FieldLabel label={label} />
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={row}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
              className="h-11 flex-1 rounded-lg border border-border bg-background px-3.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {hint && <div className="mt-2 text-[12px] text-muted-foreground">{hint}</div>}
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add another
      </button>
    </div>
  );
}

// A row toggle: label on the left, switch on the right. Used to reveal the
// optional secondary contact block.
export function ApplyToggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3.5 py-3 text-left transition-colors hover:border-primary/40"
    >
      <span className="text-[13.5px] font-medium text-foreground">{label}</span>
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-border'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
      </span>
    </button>
  );
}

// A set of toggleable option chips backed by an array of values. Used for the
// disposition method multi select.
export function ChipMultiSelect({ label, options = [], values = [], onChange }) {
  const set = new Set(values);
  const toggle = (v) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  };
  return (
    <div>
      <FieldLabel label={label} />
      <div className="grid gap-2">
        {options.map((o) => {
          const on = set.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors ${
                on
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {o.label}
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                {on && <span className="text-[10px] leading-none">&#10003;</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A stacked list of checkboxes backed by an array of values. Used for the
// "check all that apply" style questions in the original form.
export function CheckboxGroup({ label, options = [], values = [], onChange, error, required = false }) {
  const set = new Set(values);
  const toggle = (v) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  };
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <div className="grid gap-2">
        {options.map((o) => {
          const on = set.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors ${
                on
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {o.label}
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                {on && <span className="text-[10px] leading-none">&#10003;</span>}
              </span>
            </button>
          );
        })}
      </div>
      {error && <div className="mt-1 text-[12px] text-primary">{error}</div>}
    </div>
  );
}

// A single labelled checkbox row (used to reveal the secondary contact block).
export function ApplyCheckbox({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-3 text-left transition-colors hover:border-primary/40"
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
        {checked && <span className="text-[10px] leading-none">&#10003;</span>}
      </span>
      <span className="text-[13.5px] font-medium text-foreground">{label}</span>
    </button>
  );
}

// A set of toggleable option chips backed by a single value (radio style). Used
// for delivery method selection.
export function ChipSingleSelect({ label, options = [], value, onChange, error, required = false }) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`h-11 rounded-lg border px-2 text-[12.5px] font-medium transition-colors ${
                on
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <div className="mt-1 text-[12px] text-primary">{error}</div>}
    </div>
  );
}

// A labelled textarea variant for longer free text answers.
export function ApplyTextarea({ label, value, onChange, error, placeholder = '', rows = 3 }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </label>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full rounded-lg border bg-background px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 transition-colors resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          error ? 'border-primary' : 'border-border'
        }`}
      />
      {error && <div className="mt-1 text-[12px] text-primary">{error}</div>}
    </div>
  );
}