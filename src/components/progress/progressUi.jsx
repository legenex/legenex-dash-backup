import React from 'react';

// Shared primitives for the Progress Control Center.
//
// These exist so every progress surface uses the same card, row, badge and empty
// state treatment as the known-good operator pages. Semantic tokens only: no raw
// hex values and no raw Tailwind palette utilities of any kind. A flat list of
// rows on raw canvas is the design-system regression signature and must never
// appear here. See DESIGN-SYSTEM.md for the token table.

export function ProgressPageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className = '', children }) {
  return <div className={`rounded-lg border border-border bg-card ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-start gap-2">
        {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

export function Row({ onClick, active, className = '', children }) {
  const base = `flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 ${className}`;
  if (!onClick) return <div className={base}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} w-full text-left transition-colors hover:bg-accent ${active ? 'bg-accent' : ''}`}
    >
      {children}
    </button>
  );
}

const BADGE_BASE = 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium';

// Tone is expressed through semantic tokens and chart tokens only.
const TONE_CLASS = {
  neutral: 'text-muted-foreground',
  good: 'text-chart-5',
  warn: 'text-chart-3',
  bad: 'text-primary',
  info: 'text-chart-2',
};

export function Badge({ tone = 'neutral', className = '', children }) {
  return <span className={`${BADGE_BASE} ${TONE_CLASS[tone] || TONE_CLASS.neutral} ${className}`}>{children}</span>;
}

export const LIFECYCLE_TONE = {
  not_started: 'neutral',
  defined: 'neutral',
  in_progress: 'info',
  implemented_unverified: 'warn',
  verified: 'good',
  blocked: 'bad',
};

export const LIFECYCLE_LABEL = {
  not_started: 'Not started',
  defined: 'Defined',
  in_progress: 'In progress',
  implemented_unverified: 'Implemented, unverified',
  verified: 'Verified',
  blocked: 'Blocked',
};

export const PRIORITY_TONE = { P0: 'bad', P1: 'bad', P2: 'warn', P3: 'neutral', P4: 'neutral' };

export const RECOMMENDATION_LABEL = {
  not_ready: 'Not ready',
  conditional: 'Conditional',
  ready: 'Ready',
};

export const RECOMMENDATION_TONE = {
  not_ready: 'bad',
  conditional: 'warn',
  ready: 'good',
};

// A readiness bar that never implies more certainty than the number carries.
export function ReadinessBar({ value = 0, tone = 'info', className = '' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const fill = {
    good: 'bg-chart-5',
    warn: 'bg-chart-3',
    bad: 'bg-primary',
    info: 'bg-chart-2',
    neutral: 'bg-muted-foreground',
  }[tone] || 'bg-chart-2';
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-secondary ${className}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function toneForReadiness(value) {
  if (value >= 90) return 'good';
  if (value >= 60) return 'warn';
  if (value > 0) return 'bad';
  return 'neutral';
}

export function StatCard({ label, value, suffix, hint, tone = 'neutral', bar }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold ${TONE_CLASS[tone] || 'text-foreground'}`}>{value}</span>
        {suffix && <span className="text-[13px] text-muted-foreground">{suffix}</span>}
      </p>
      {bar != null && <ReadinessBar value={bar} tone={tone} className="mt-2.5" />}
      {hint && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
      <p className="mt-3 text-[13px] font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-[12px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PrimaryButton({ onClick, disabled, type = 'button', className = '', children }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ onClick, disabled, type = 'button', className = '', children }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border border-border bg-transparent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function LoadingBlock({ label = 'Loading' }) {
  return (
    <Card>
      <div className="flex items-center justify-center gap-2 px-6 py-12">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span className="text-[13px] text-muted-foreground">{label}</span>
      </div>
    </Card>
  );
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <Card>
      <div className="px-6 py-10 text-center">
        <p className="text-[13px] font-medium text-foreground">Could not load</p>
        <p className="mt-1 text-[12px] text-muted-foreground">{message}</p>
        {onRetry && (
          <div className="mt-4">
            <SecondaryButton onClick={onRetry}>Try again</SecondaryButton>
          </div>
        )}
      </div>
    </Card>
  );
}

// Evidence labelling. The whole system rests on the difference between what was
// observed and what was guessed, so it gets its own visual treatment everywhere.
export const EVIDENCE_LABEL = {
  code: 'Code evidence',
  runtime: 'Runtime evidence',
  screenshot: 'Screenshot evidence',
  data: 'Data evidence',
  test: 'Test evidence',
  user_feedback: 'User feedback',
  inference: 'Inference',
  unknown: 'Unknown',
};

export function EvidenceBadge({ type, requiresVerification }) {
  const observed = ['code', 'runtime', 'screenshot', 'data', 'test', 'user_feedback'].includes(type);
  return (
    <Badge tone={requiresVerification ? 'warn' : (observed ? 'info' : 'neutral')}>
      {EVIDENCE_LABEL[type] || 'Unknown'}
      {requiresVerification ? ', unconfirmed' : ''}
    </Badge>
  );
}
