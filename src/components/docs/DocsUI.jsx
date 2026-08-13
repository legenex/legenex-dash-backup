import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

// Shared presentational primitives for the docs pages, all Legenex dark theme.

export function DocPage({ title, subtitle, children }) {
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-10">
      <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-muted-foreground leading-relaxed">{subtitle}</p>}
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

export function Section({ id, title, children }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      {title && <h2 className="text-xl font-heading font-semibold text-foreground">{title}</h2>}
      <div className="space-y-3 text-[14px] text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

const METHOD_COLORS = {
  GET: 'text-status-qualified',
  POST: 'status-sold',
  PUT: 'status-unsold',
  DELETE: 'status-error',
};

export function Endpoint({ method = 'POST', path }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className={`text-xs font-mono font-bold px-2 py-1 rounded bg-muted ${METHOD_COLORS[method] || 'text-foreground'}`}>
        {method}
      </span>
      <code className="font-mono text-[13px] text-foreground break-all">{path}</code>
    </div>
  );
}

export function CodeBlock({ code, language = 'json' }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group rounded-lg border border-border bg-[#0f1520] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-black/20">
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{language}</span>
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-status-qualified" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-relaxed">
        <code className="font-mono text-foreground/90 whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

export function InlineCode({ children }) {
  return (
    <code className="font-mono text-[12.5px] px-1.5 py-0.5 rounded bg-muted text-foreground">{children}</code>
  );
}

// Field / parameter table. columns: array of {key, label, className}. rows: array of objects.
export function FieldTable({ columns, rows }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {columns.map(c => (
              <th key={c.key} className={`text-left font-semibold text-foreground px-3.5 py-2.5 ${c.className || ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
              {columns.map(c => (
                <td key={c.key} className={`px-3.5 py-2.5 align-top text-muted-foreground ${c.cellClassName || ''}`}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReqBadge({ required }) {
  return required
    ? <span className="text-[11px] font-semibold status-error">Required</span>
    : <span className="text-[11px] font-semibold text-muted-foreground">Optional</span>;
}

export function Callout({ children, tone = 'info' }) {
  const tones = {
    info: 'border-status-qualified/30 bg-status-qualified/5',
    warn: 'border-status-unsold/30 bg-status-unsold/5',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-[13px] text-muted-foreground leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Placeholder({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
      {children || 'Documentation for this section is coming soon.'}
    </div>
  );
}