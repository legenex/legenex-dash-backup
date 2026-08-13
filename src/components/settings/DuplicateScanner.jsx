import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Copy, Loader2, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateLeadCaches } from '@/lib/leadCaches';

// Finds leads that share an email or mobile and removes the redundant copies.
//
// A double-write during a CSV import on 19 July 2026 stored 97 leads twice,
// which inflated every Sold count in the app until they were archived by hand.
// The importer now blocks on duplicates and its retry path no longer rewrites
// rows that already landed, so this should stay at zero. It exists so the next
// occurrence is a two-click fix rather than an investigation.
//
// Scan changes nothing. Only Remove writes, and it keeps the OLDEST record of
// each group because that is the one deliveries and billing were written
// against, merging in any field the keeper is missing first.
export default function DuplicateScanner() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(null);
  const [done, setDone] = useState(null);

  const run = async (mode) => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke('dedupeLeads', { mode });
      const data = res?.data || res;
      if (data?.error) { toast.error(data.error); return; }
      if (mode === 'scan') {
        setScan(data);
        setDone(null);
        toast.success(data.records_to_remove > 0
          ? `${data.records_to_remove} duplicates found`
          : 'No duplicates found');
      } else {
        setDone(data);
        setScan(null);
        invalidateLeadCaches(qc);
        toast.success(`Removed ${data.records_deleted} duplicate leads`);
      }
    } catch (err) {
      toast.error(err?.message || 'Duplicate scan failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-[12px] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Copy className="w-4 h-4 text-primary" />
        <div className="text-[15px] font-semibold text-foreground">Duplicate Leads</div>
      </div>
      <div className="text-[13px] text-muted-foreground mb-4 max-w-2xl">
        Finds leads sharing an email or mobile number. Scanning changes nothing. Removing keeps the
        oldest record of each pair, since that is the one deliveries and billing were written against,
        and copies across any field the keeper is missing before the duplicate goes.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => run('scan')} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
          Scan for duplicates
        </Button>
        {scan && scan.records_to_remove > 0 && (
          <Button size="sm" onClick={() => run('apply')} disabled={busy} className="gap-1.5">
            Remove {scan.records_to_remove} duplicates
          </Button>
        )}
      </div>

      {scan && (
        <div className={`mt-4 rounded-lg border p-3.5 ${scan.records_to_remove > 0 ? 'border-status-unsold bg-status-unsold' : 'border-border bg-secondary'}`}>
          <div className="flex items-start gap-2.5">
            {scan.records_to_remove > 0
              ? <AlertTriangle className="w-4 h-4 status-unsold shrink-0 mt-0.5" />
              : <Check className="w-4 h-4 status-sold shrink-0 mt-0.5" />}
            <div className="text-[12px] text-muted-foreground min-w-0">
              <p className="text-foreground font-medium text-[13px]">
                {scan.records_to_remove > 0
                  ? `${scan.records_to_remove} duplicate records across ${scan.duplicate_groups} leads`
                  : 'No duplicates found'}
              </p>
              <p className="mt-1">
                <span className="tabular-nums">{scan.total_leads}</span> leads scanned,
                {' '}<span className="tabular-nums">{scan.would_remain}</span> would remain.
              </p>
              {scan.sample?.length > 0 && (
                <ul className="mt-2 space-y-0.5 font-mono text-[11px]">
                  {scan.sample.slice(0, 8).map((s) => (
                    <li key={s.keep_id} className="truncate">
                      {s.key} <span className="text-muted-foreground/70">keeps {s.keep_created?.slice(0, 19)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {done && (
        <div className="mt-4 rounded-lg border border-border bg-secondary p-3.5">
          <div className="flex items-start gap-2.5">
            <Check className="w-4 h-4 status-sold shrink-0 mt-0.5" />
            <div className="text-[12px] text-muted-foreground">
              <p className="text-foreground font-medium text-[13px]">
                Removed {done.records_deleted} duplicates
              </p>
              <p className="mt-1">
                <span className="tabular-nums">{done.keepers_enriched}</span> kept records were
                enriched from their duplicates before removal.
                {done.failure_count > 0 && ` ${done.failure_count} failed and were left untouched.`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
