import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { manageSupplierAdAccount } from '@/functions/manageSupplierAdAccount';
import { syncMetaSpend } from '@/functions/syncMetaSpend';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKFILL_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 365 days' },
  { value: 'date', label: 'From a specific date' },
];

// Edit an existing ad-account mapping: move it to a different supplier, and/or
// change how far back the import reaches. All writes go through
// manageSupplierAdAccount (operator-gated, service role).
export default function MetaEditMappingDialog({ open, onOpenChange, account, onSaved, lockSupplier = false }) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [mode, setMode] = useState('30');
  const [sinceDate, setSinceDate] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
    enabled: open,
  });

  useEffect(() => {
    if (!account) return;
    setSupplierId(account.supplier_id || '');
    if (account.backfill_since) { setMode('date'); setSinceDate(account.backfill_since); }
    else { setMode(String(account.backfill_days || 30)); setSinceDate(''); }
  }, [account, open]);

  if (!account) return null;

  const save = async () => {
    setSaving(true);
    try {
      // Reassign supplier if it changed.
      if (!lockSupplier && supplierId && supplierId !== account.supplier_id) {
        const r = (await manageSupplierAdAccount({ id: account.id, action: 'reassign', supplier_id: supplierId })).data || {};
        if (r.error) { toast.error(r.error); setSaving(false); return; }
      }
      // Update backfill window (re-arms the initial import).
      const payload = mode === 'date'
        ? { backfill_since: sinceDate }
        : { backfill_days: Number(mode), backfill_since: '' };
      const b = (await manageSupplierAdAccount({ id: account.id, action: 'set_backfill', ...payload })).data || {};
      if (b.error) { toast.error(b.error); setSaving(false); return; }

      toast.success('Mapping updated. Re-syncing with the new settings.');
      syncMetaSpend({ ad_account_ids: [account.ad_account_id], trigger: 'manual' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
      qc.invalidateQueries({ queryKey: ['adspend'] });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update mapping');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Edit mapping</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="p-2.5 rounded-lg border border-border bg-background">
            <div className="text-[13px] text-foreground font-medium truncate">{account.ad_account_name || account.ad_account_id}</div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{account.ad_account_id}{account.currency ? ` · ${account.currency}` : ''}</div>
          </div>
          {!lockSupplier && (
            <div>
              <Label className="text-[12px]">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">Moving the account to another supplier re-attributes its historical spend too.</p>
            </div>
          )}
          <div>
            <Label className="text-[12px]">Re-import history</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>{BACKFILL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {mode === 'date' && (
              <Input type="date" value={sinceDate} onChange={e => setSinceDate(e.target.value)} className="mt-2 bg-background text-[13px]" />
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Changing this re-runs the initial import from the chosen point. Existing days are updated in place, not duplicated.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || (mode === 'date' && !sinceDate)}>{saving ? 'Saving…' : 'Save mapping'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
