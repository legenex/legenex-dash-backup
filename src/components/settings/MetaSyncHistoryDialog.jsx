import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { metaSyncHistory } from '@/functions/metaSyncHistory';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';

const fmtWhen = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const money = (n, c) => `${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}${c ? ` ${c}` : ''}`;

// Read-only sync history for a supplier or a single ad-account mapping.
export default function MetaSyncHistoryDialog({ open, onOpenChange, supplierId = null, supplierAdAccountId = null, title = 'Sync history' }) {
  const { data, isLoading } = useQuery({
    queryKey: ['meta-sync-history', supplierId, supplierAdAccountId],
    queryFn: async () => (await metaSyncHistory({ supplier_id: supplierId || undefined, supplier_ad_account_id: supplierAdAccountId || undefined, limit: 50 })).data,
    enabled: open,
  });
  const runs = data?.runs || [];

  const statusBadge = (s) => {
    if (s === 'success') return <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Success</span>;
    if (s === 'partial') return <span className="text-[11px] inline-flex items-center gap-1 font-medium status-returned"><AlertTriangle className="w-3.5 h-3.5" /> Partial</span>;
    return <span className="text-[11px] status-error inline-flex items-center gap-1 font-medium"><XCircle className="w-3.5 h-3.5" /> Error</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> {title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-[12px] text-muted-foreground py-4">Loading history…</p>
        ) : runs.length === 0 ? (
          <p className="text-[12px] text-muted-foreground py-4">No sync runs recorded yet. History appears here after the first sync.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {runs.map(r => (
              <div key={r.id} className="p-3 rounded-lg border border-border bg-background">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {statusBadge(r.status)}
                    <Badge variant="outline" className="text-[10px] capitalize">{r.trigger}</Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{fmtWhen(r.started_at)}</span>
                </div>
                <div className="text-[12px] text-foreground mt-1 truncate">{r.ad_account_name}{r.supplier_name ? ` · ${r.supplier_name}` : ''}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {r.status === 'error'
                    ? <span className="status-error">{r.error_message || 'Sync failed'}</span>
                    : <>Imported {r.spend_days} day{r.spend_days === 1 ? '' : 's'} · {money(r.spend_total, r.currency)}{r.status === 'partial' && r.error_message ? ` · ${r.error_message}` : ''}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
