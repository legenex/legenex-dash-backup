import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// A clickable tool tile: icon, title, one-line description, a couple of live
// stats, and a status dot. Links straight to the tool's page.
export default function ToolTile({ to, icon: Icon, title, description, stats = [], status = 'ok' }) {
  const dot =
    status === 'error' ? 'bg-[#E5484D]' :
    status === 'warn' ? 'bg-[#FACC14]' :
    'bg-[#3DD68C]';

  return (
    <Link
      to={to}
      className="group bg-card border border-border rounded-[10px] p-5 flex flex-col hover:border-primary/40 hover:shadow-sm transition-all duration-200"
    >
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <span className={`w-2 h-2 rounded-full mt-1.5 ${dot}`} title={status} />
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          {title}
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
        </div>
        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>

      {stats.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[18px] font-bold text-foreground leading-none">{s.value}</div>
              <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wide truncate">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}