import React from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

function Dot({ active }) {
  return <div className={`w-2 h-2 rounded-full ${active ? 'bg-[#3DD68C]' : 'bg-[#E5484D]'}`} />;
}

// Operational connection status: endpoint URL + verification + connected APIs.
export default function StatusStrip({ endpointUrl, hlrActive, hlrLabel, emailActive, connections = [] }) {
  return (
    <div className="bg-card border border-primary/20 rounded-[10px] p-4 space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Supplier Endpoint</div>
        <code className="flex-1 min-w-[220px] font-mono text-[13px] text-primary truncate">{endpointUrl}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(endpointUrl); toast.success('Endpoint URL copied'); }}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-primary/40"
        >
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>

      <div className="flex items-center gap-6 flex-wrap pt-1 border-t border-border/60">
        <div className="flex items-center gap-2 pt-2">
          <Dot active={hlrActive} />
          <span className="text-[12px] text-muted-foreground">Phone HLR</span>
          <span className="text-[12px] font-medium text-foreground">{hlrActive ? (hlrLabel || 'Active') : 'Not configured'}</span>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Dot active={emailActive} />
          <span className="text-[12px] text-muted-foreground">Email Validation</span>
          <span className="text-[12px] font-medium text-foreground">{emailActive ? 'Active' : 'Not configured'}</span>
        </div>
        {connections.map(c => (
          <div key={c.label} className="flex items-center gap-2 pt-2">
            <Dot active={c.active} />
            <span className="text-[12px] text-muted-foreground">{c.label}</span>
            <span className="text-[12px] font-medium text-foreground">{c.active ? 'Connected' : 'Not connected'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}