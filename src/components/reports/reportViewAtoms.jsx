// Shared atoms for the purpose-built standard report views.
// Theme tokens for surfaces/text; tone accents may use inline hex (risk red, good green)
// for borders/dots/bars only. Numeric columns are right-aligned + font-mono.

export const ReportKpi = ({ label, value, hint, tone /* 'good' | 'risk' | undefined */ }) => {
  const hex = tone === 'risk' ? '#E5484D' : tone === 'good' ? '#3DD68C' : null;
  return (
    <div className="rounded-lg border bg-card p-4" style={{ borderColor: hex ? `${hex}44` : undefined }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground truncate">{label}</span>
        {hex && <span className="w-1.5 h-1.5 rounded-full" style={{ background: hex }} />}
      </div>
      <div className="text-[19px] sm:text-[22px] lg:text-[26px] font-bold tabular-nums mt-1 text-foreground truncate">{value}</div>
      {hint && <div className="text-[10.5px] mt-0.5 text-muted-foreground">{hint}</div>}
      <div className="h-0.5 rounded-full mt-3 bg-border/70">
        <div className="h-full rounded-full opacity-70" style={{ width: '38%', background: hex || 'hsl(var(--primary))' }} />
      </div>
    </div>
  );
};

export const THead = ({ cols, template, first = 1 }) => (
  <div className="grid gap-2 px-4 py-2.5 border-b border-border text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70 bg-background/40"
    style={{ gridTemplateColumns: template }}>
    {cols.map((c, i) => (<span key={c} className={i < first ? '' : 'text-right'}>{c}</span>))}
  </div>
);

export const TRow = ({ template, cells, first = 1, highlight }) => (
  <div className="grid gap-2 px-4 py-2.5 border-b border-border items-center hover:bg-foreground/[0.02]"
    style={{ gridTemplateColumns: template, background: highlight ? 'rgba(232,163,61,0.06)' : undefined }}>
    {cells.map((c, j) => (
      <span key={j} className={`text-[12px] ${j < first ? 'font-medium text-foreground' : 'text-right font-mono tabular-nums text-muted-foreground'}`}>{c}</span>
    ))}
  </div>
);

export const AINote = ({ children }) => (
  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-primary/30 bg-primary/[0.06]">
    <p className="text-[11.5px] leading-relaxed text-muted-foreground"><span className="font-semibold text-primary">AI read:</span> {children}</p>
  </div>
);