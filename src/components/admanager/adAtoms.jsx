import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown, ShieldCheck, TrendingUp, Eye, Skull, Play, Image as ImageIcon, Brain } from 'lucide-react';
import { BAND_TONE, TONE } from '@/lib/adManagerMetrics';

// Re-exported so every Ad Manager component pulls tones from one place.
export { TONE };

// Shared atoms for the Ad Manager. Structure and proportions come straight from
// the approved design. Colours resolve through the app's theme tokens so the
// section matches the rest of the dashboard in both themes, with the verified
// green and reported amber kept literal because they carry meaning.

export const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: 0.04 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

export const PulseDot = ({ color = TONE.good, size = 7 }) => (
  <span className="relative inline-flex" style={{ width: size, height: size }}>
    <motion.span
      className="absolute inset-0 rounded-full"
      style={{ background: color }}
      animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
    />
    <span className="relative rounded-full w-full h-full" style={{ background: color }} />
  </span>
);

export const Tag = ({ children, tone = 'slate' }) => {
  const map = {
    slate: 'tag-neutral border-border',
    red: 'bg-primary/10 text-primary border-primary/30',
    green: 'bg-status-sold status-sold border-[rgba(61,214,140,0.35)]',
    amber: 'bg-status-unsold border-[rgba(232,163,61,0.35)]',
    blue: 'bg-status-duplicate status-duplicate border-[rgba(49,130,189,0.35)]',
  }[tone];
  const style = tone === 'amber' ? { color: TONE.warn } : undefined;
  return (
    <span style={style} className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium tracking-wide border whitespace-nowrap ${map}`}>
      {children}
    </span>
  );
};

export const Panel = ({ children, className = '', glow, style = {} }) => (
  <div
    className={`relative rounded-xl border border-border bg-card ${className}`}
    style={{
      boxShadow: glow
        ? `0 0 0 1px hsl(var(--primary) / 0.13), 0 8px 40px -12px hsl(var(--primary) / 0.2), 0 12px 32px -16px rgba(0,0,0,0.6)`
        : '0 12px 32px -16px rgba(0,0,0,0.4)',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Btn = ({ icon: Icon, children, primary, onClick, active, disabled, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11.5px] font-medium border shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      primary
        ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
        : active
        ? 'bg-primary/10 text-primary border-primary/35'
        : 'bg-background/50 text-muted-foreground border-border hover:text-foreground hover:bg-accent/40'
    }`}
  >
    {Icon && <Icon className="w-3 h-3" />} {children}
  </button>
);

export const SectionHead = ({ title, right, icon: Icon, sub }) => (
  <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2.5">
    <div className="flex items-center gap-2 min-w-0">
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {sub && <div className="text-[10.5px] mt-0.5 text-muted-foreground/70">{sub}</div>}
      </div>
    </div>
    {right}
  </div>
);

export const AINote = ({ children }) => (
  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-primary/30 bg-primary/10">
    <Brain className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
    <p className="text-[11.5px] leading-relaxed text-muted-foreground">{children}</p>
  </div>
);

export const BandChip = ({ band }) => {
  if (!band) return null;
  const tone = BAND_TONE[band];
  return (
    <span
      className="px-1.5 py-px rounded text-[9px] font-semibold tracking-wide border whitespace-nowrap"
      style={{ color: tone, borderColor: `${tone}44`, background: `${tone}14` }}
    >
      {band}
    </span>
  );
};

// Renders a dash for a null value rather than a zero, so unavailable data is
// never mistaken for a measured zero.
export const KpiTile = ({ label, value, hint, delta, band, verified, tone }) => {
  const accent = verified ? TONE.good : tone || null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      whileHover={{ y: -2 }}
      className="rounded-lg border p-3.5 relative overflow-hidden bg-background/40"
      style={{ borderColor: accent ? `${accent}44` : 'hsl(var(--border) / 0.6)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[9.5px] font-semibold tracking-[0.1em] uppercase truncate"
          style={{ color: verified ? TONE.good : undefined }}
        >
          <span className={verified ? '' : 'text-muted-foreground'}>{label}</span>
        </span>
        {verified ? (
          <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: TONE.good }} />
        ) : accent ? (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
        ) : null}
      </div>
      <div className="text-[17px] sm:text-[19px] lg:text-[22px] font-bold font-mono tabular-nums mt-1 text-foreground truncate">{value}</div>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {hint && <span className="text-[10.5px] text-muted-foreground/70">{hint}</span>}
        {delta != null && (
          <span
            className="flex items-center gap-0.5 text-[10.5px] font-medium"
            style={{ color: delta >= 0 ? TONE.good : TONE.bad }}
          >
            {delta >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {band && <div className="mt-2"><BandChip band={band} /></div>}
    </motion.div>
  );
};

export const HeatCell = ({ value, tone, mono = true }) => (
  <span
    className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11.5px] ${mono ? 'font-mono tabular-nums' : ''} font-semibold`}
    style={{ color: tone, background: `${tone}18`, border: `1px solid ${tone}33` }}
  >
    {value}
  </span>
);

export const SpendCell = ({ value, ratio, format }) => (
  <div className="flex flex-col items-end gap-1">
    <span className="text-[11.5px] font-mono tabular-nums text-foreground">{format(value)}</span>
    <div className="w-16 h-1 rounded-full overflow-hidden bg-border">
      <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.max(4, Math.min(1, ratio || 0) * 100)}%` }} />
    </div>
  </div>
);

export const Decision = ({ d }) => {
  if (!d) return <span className="text-[11px] text-muted-foreground/50">-</span>;
  const map = {
    Scale: { col: TONE.good, Icon: TrendingUp },
    Watch: { col: TONE.warn, Icon: Eye },
    Kill: { col: TONE.bad, Icon: Skull },
  }[d];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold border whitespace-nowrap"
      style={{ color: map.col, borderColor: `${map.col}44`, background: `${map.col}14` }}
    >
      <map.Icon className="w-3 h-3" />
      {d}
    </span>
  );
};

// Deterministic opportunity score ring. The number is computed in
// adManagerMetrics from real ROAS, verified CPL and qualified volume.
export const AiScore = ({ n }) => {
  if (n == null) {
    return (
      <div className="flex justify-end">
        <div className="w-9 h-9 rounded-full grid place-items-center border border-dashed border-border">
          <span className="text-[10px] text-muted-foreground/50">-</span>
        </div>
      </div>
    );
  }
  const col = n >= 75 ? TONE.good : n >= 55 ? TONE.warn : TONE.bad;
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div
        className="w-9 h-9 rounded-full grid place-items-center relative"
        style={{ background: `conic-gradient(${col} ${n * 3.6}deg, hsl(var(--border)) 0deg)` }}
        title="Opportunity score computed from verified ROAS, verified CPL and qualified volume"
      >
        <div className="w-7 h-7 rounded-full grid place-items-center bg-card">
          <span className="text-[11px] font-bold tabular-nums" style={{ color: col }}>{n}</span>
        </div>
      </div>
    </div>
  );
};

export const Thumb = ({ label, kind = 'video', w = 44, h = 44 }) => (
  <div
    className="rounded-md grid place-items-center shrink-0 relative overflow-hidden border border-border bg-gradient-to-br from-accent to-background"
    style={{ width: w, height: h }}
  >
    {kind === 'video' ? (
      <Play className="w-3.5 h-3.5 text-muted-foreground" fill="currentColor" />
    ) : (
      <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
    )}
    {label && <span className="absolute bottom-0.5 right-1 text-[8px] font-mono text-muted-foreground/60">{label}</span>}
  </div>
);

export const PlatBadge = ({ p, label }) => (
  <span
    title={label}
    className="w-4 h-4 rounded grid place-items-center text-[8px] font-bold bg-muted text-muted-foreground shrink-0"
  >
    {String(p || '?')[0].toUpperCase()}
  </span>
);

// Empty state used wherever a scope has no synced spend or no matched leads.
export const EmptyState = ({ icon: Icon, title, body, action }) => (
  <Panel className="grid place-items-center py-16">
    <div className="text-center max-w-[380px] px-6">
      {Icon && (
        <div className="w-11 h-11 mx-auto rounded-xl grid place-items-center bg-muted">
          <Icon className="w-4.5 h-4.5 text-muted-foreground" />
        </div>
      )}
      <div className="text-[13px] font-semibold mt-3 text-foreground">{title}</div>
      {body && <p className="text-[11.5px] mt-1.5 leading-relaxed text-muted-foreground">{body}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  </Panel>
);
