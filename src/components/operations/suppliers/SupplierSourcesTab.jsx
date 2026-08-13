import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import SourceEditor from './SourceEditor';
import { parseRules } from './tierRules';

// Tones keyed to the SupplierSource pricing_model enum:
// none | flat_cpl | profit_pct | revenue_pct | tiered.
const MODEL_TONE = {
  none: 'tag-neutral',
  revenue_pct: 'bg-status-queued status-queued',
  profit_pct: 'bg-status-duplicate status-duplicate',
  flat_cpl: 'bg-status-sold status-sold',
  tiered: 'bg-primary/15 text-primary',
};

// Human readable effective price summary for a source row.
// This used to test for a 'rev_share' model that does not exist in the schema,
// so every Revenue % and Profit % source fell through to the unpriced label.
function priceSummary(src) {
  if (src.pricing_model === 'revenue_pct') {
    const pct = src.revenue_pct == null ? 0 : src.revenue_pct;
    return `${pct}% of revenue`;
  }
  if (src.pricing_model === 'profit_pct') {
    const pct = src.profit_pct == null ? 0 : src.profit_pct;
    return `${pct}% of profit`;
  }
  if (src.pricing_model === 'flat_cpl') {
    const v = src.flat_cpl == null ? 0 : src.flat_cpl;
    return `$${Number(v).toFixed(2)} per lead`;
  }
  if (src.pricing_model === 'tiered') {
    const n = parseRules(src.tier_rules).length;
    return `${n} rule${n === 1 ? '' : 's'}`;
  }
  if (src.pricing_model === 'none') return 'No CPL';
  return '-';
}

// Sources tab: manages SupplierSource records for the open supplier. One
// supplier can send several economically distinct feeds, so a single supplier
// level payout cannot price them all.
export default function SupplierSourcesTab({ supplier }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // source record, or {} for new
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { data: sources = [] } = useQuery({
    queryKey: ['supplier-sources', supplier.id],
    queryFn: () => base44.entities.SupplierSource.filter({ supplier_id: supplier.id }, 'source_code', 500),
  });

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['supplier-sources', supplier.id] }),
    qc.invalidateQueries({ queryKey: ['op-supplier-sources'] }),
  ]);

  const toggleActive = async (src, active) => {
    await base44.entities.SupplierSource.update(src.id, { active });
    toast.success(active ? 'Source activated' : 'Source paused');
    refresh();
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await base44.entities.SupplierSource.delete(deleteTarget.id);
      toast.success('Source deleted');
      await refresh();
      setDeleteTarget(null);
    } catch (e) {
      toast.error(`Could not delete source: ${e?.message || 'unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const existingCodes = sources.map((s) => ({ id: s.id, code: s.source_code || '' }));

  if (editing) {
    return (
      <SourceEditor
        supplier={supplier}
        source={editing.id ? editing : null}
        existingCodes={existingCodes}
        onBack={() => setEditing(null)}
        onSaved={async () => { await refresh(); setEditing(null); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] text-muted-foreground leading-relaxed max-w-md">
          One supplier can send several economically distinct feeds, so a single supplier level payout cannot price them all.
        </p>
        <Button size="sm" onClick={() => setEditing({})} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" /> Add Source
        </Button>
      </div>

      {sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center mx-auto mb-3">
            <Layers className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-[13px] text-foreground font-medium">No sources yet</p>
          <p className="text-[12px] text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
            Leads from this supplier will fall back to the supplier level payout, which is currently{' '}
            <span className="font-semibold text-foreground">{supplier.payout_type || 'None'}</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((src) => (
            <div key={src.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-medium text-foreground truncate">
                    {src.source_code || <span className="text-muted-foreground">no ssid</span>}
                  </span>
                  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MODEL_TONE[src.pricing_model] || 'tag-neutral'}`}>
                    {src.pricing_model}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                  {src.brand && <><span>brand: <span className="text-foreground">{src.brand}</span></span><span className="text-muted-foreground/40">|</span></>}
                  {src.utm_source && <><span className="font-mono">{src.utm_source}</span><span className="text-muted-foreground/40">|</span></>}
                  <span className="font-mono tabular-nums">{priceSummary(src)}</span>
                </div>
              </div>
              <Switch checked={src.active !== false} onCheckedChange={(v) => toggleActive(src, v)} />
              <Button variant="ghost" size="sm" onClick={() => setEditing(src)} className="h-8 w-8 p-0"><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(src)} className="h-8 w-8 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the source "{deleteTarget?.source_code}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}