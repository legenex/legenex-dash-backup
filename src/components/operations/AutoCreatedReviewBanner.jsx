import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAll } from '@/lib/fetchAll';
import { leadField } from '@/lib/reportMetrics';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sparkles, Check, Trash2, Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

// Review banner for buyers and suppliers that inbound leads reference but that
// this system has no record for.
//
// Two sources feed it:
//   1. Records the inbound webhook already created on its own (auto_created).
//   2. Codes and names referenced on existing leads with no matching record.
//      The webhook only creates on the NEXT post, so without this a buyer named
//      on a lead months ago never surfaces at all.
//
// Anything created here is INERT: draft or new, inactive, no pricing, no state
// coverage and no payout terms. Those are operator decisions, and a lead payload
// must never be able to make something routable or billable.
const CONFIG = {
  buyer: {
    entity: 'Buyer',
    queryKey: ['buyers'],
    label: 'buyer',
    labelPlural: 'buyers',
    nameOf: (r) => r.company_name || r.buyer_code || 'Unnamed',
    codeOf: (r) => r.buyer_code,
    // Accepting clears the flag and leaves the record inactive on purpose.
    accept: { status: 'draft', active: false, auto_created: false },
    finishHint: 'Set pricing and state coverage before making it active.',
    // How a lead names this kind of record. Code and name come back as ONE pair
    // per lead, not two loose strings: a lead carrying buyer_id LF24 and
    // buyer_name "KP Injury Law" is one buyer, and treating them independently
    // both split it into two review rows and lost the name on create.
    refFromLead: (l) => ({
      code: l.buyer_id || leadField(l, 'buyer_id') || '',
      name: l.buyer_name || leadField(l, 'buyer') || '',
    }),
    matches: (r, ref) => {
      const n = (v) => String(v ?? '').trim().toLowerCase();
      const rc = n(r.buyer_code); const rn = n(r.company_name);
      const c = n(ref.code); const nm = n(ref.name);
      return (rc && (rc === c || rc === nm)) || (rn && (rn === c || rn === nm));
    },
    build: (ref) => ({
      // The real name when the payload carried one, the code otherwise.
      company_name: ref.name || ref.code,
      buyer_code: ref.code || undefined,
      auto_created: true,
      status: 'draft',
      active: false,
      notes: 'Detected on an existing lead with no matching buyer record. No pricing or state coverage set.',
    }),
  },
  supplier: {
    entity: 'Supplier',
    queryKey: ['suppliers'],
    label: 'supplier',
    labelPlural: 'suppliers',
    nameOf: (r) => r.name || r.sid || 'Unnamed',
    codeOf: (r) => r.sid,
    accept: { status: 'new', active: false, auto_created: false },
    finishHint: 'Set payout terms before making it active.',
    refFromLead: (l) => ({ code: '', name: l.supplier_name || '' }),
    matches: (r, ref) => {
      const n = (v) => String(v ?? '').trim().toLowerCase();
      const nm = n(ref.name) || n(ref.code);
      return (n(r.sid) && n(r.sid) === nm) || (n(r.name) && n(r.name) === nm);
    },
    build: (ref) => ({
      name: ref.name || ref.code,
      sid: ref.code || ref.name,
      supplier_type: 'External',
      auto_created: true,
      status: 'new',
      active: false,
      notes: 'Detected on an existing lead with no matching supplier record. No payout terms set.',
    }),
  },
};

export default function AutoCreatedReviewBanner({ kind }) {
  const cfg = CONFIG[kind];
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);
  const [open, setOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());

  const { data: records = [] } = useQuery({
    queryKey: [`auto-created-${kind}`],
    queryFn: () => base44.entities[cfg.entity].list('-created_date', 500),
  });

  // Leads are only read to find names with no record behind them.
  const { data: leads = [] } = useQuery({
    queryKey: [`unregistered-refs-${kind}`],
    queryFn: () => fetchAll((limit, skip) => base44.entities.Lead.list('-created_date', limit, skip)),
    staleTime: 60_000,
  });

  const pending = useMemo(
    () => (records || []).filter((r) => r.auto_created === true),
    [records],
  );

  // Referenced on a lead, matching no record at all. Keyed on the code when the
  // lead carries one, so "LFWC9" and "Levine Law" from the same lead collapse
  // into a single row that knows both.
  const unregistered = useMemo(() => {
    const out = new Map();
    for (const l of leads || []) {
      const raw = cfg.refFromLead(l);
      const code = String(raw.code ?? '').trim();
      const name = String(raw.name ?? '').trim();
      const clean = (v) => (!v || v === '-' ? '' : v);
      const ref = { code: clean(code), name: clean(name) };
      if (!ref.code && !ref.name) continue;
      const key = (ref.code || ref.name).toLowerCase();
      if (dismissed.has(key)) continue;
      if ((records || []).some((r) => cfg.matches(r, ref))) continue;
      const seen = out.get(key);
      if (seen) {
        seen.count += 1;
        // Fill in whichever half a later lead supplies.
        if (!seen.ref.name && ref.name) seen.ref.name = ref.name;
        if (!seen.ref.code && ref.code) seen.ref.code = ref.code;
      } else {
        out.set(key, { key, ref, count: 1 });
      }
    }
    return Array.from(out.values()).sort((a, b) => b.count - a.count);
  }, [leads, records, dismissed, cfg]);

  if (pending.length === 0 && unregistered.length === 0) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [`auto-created-${kind}`] });
    qc.invalidateQueries({ queryKey: [`unregistered-refs-${kind}`] });
    qc.invalidateQueries({ queryKey: cfg.queryKey });
    // The Operations tables use their own keys. Without these the record was
    // written but the table behind the dialog never refetched, so Keep and
    // Create looked like they had done nothing at all.
    qc.invalidateQueries({ queryKey: ['op-buyers'] });
    qc.invalidateQueries({ queryKey: ['op-suppliers'] });
  };

  const accept = async (r) => {
    setBusyId(r.id);
    try {
      // status and active are always written together.
      await base44.entities[cfg.entity].update(r.id, cfg.accept);
      refresh();
      toast.success(`${cfg.nameOf(r)} kept. ${cfg.finishHint}`);
    } catch (e) {
      toast.error(e?.message || 'Could not accept');
    } finally { setBusyId(null); }
  };

  const create = async (key, ref) => {
    setBusyId(key);
    try {
      await base44.entities[cfg.entity].create(cfg.build(ref));
      refresh();
      const shown = ref.name || ref.code;
      toast.success(`${shown} created as a draft. ${cfg.finishHint}`);
    } catch (e) {
      toast.error(e?.message || 'Could not create');
    } finally { setBusyId(null); }
  };

  const discard = async () => {
    if (!discardTarget) return;
    setBusyId(discardTarget.id);
    try {
      await base44.entities[cfg.entity].delete(discardTarget.id);
      refresh();
      toast.success(`${cfg.nameOf(discardTarget)} discarded`);
    } catch (e) {
      toast.error(e?.message || 'Could not discard');
    } finally { setBusyId(null); setDiscardTarget(null); }
  };

  const total = pending.length + unregistered.length;

  const rows = (
    <div className="rounded-md border border-border overflow-hidden">
      {pending.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border last:border-b-0 px-3 py-2 hover:bg-accent">
          <div className="min-w-0">
            <div className="text-[13px] text-foreground truncate">{cfg.nameOf(r)}</div>
            <div className="text-[11px] text-muted-foreground">
              {cfg.codeOf(r) ? <span className="font-mono">{cfg.codeOf(r)}</span> : null}
              <span className="ml-1">auto-created by the webhook</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1 text-primary"
              disabled={busyId === r.id} onClick={() => accept(r)}>
              <Check className="w-3 h-3" /> Keep
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              disabled={busyId === r.id} onClick={() => setDiscardTarget(r)} title="Discard">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ))}

      {unregistered.map(({ key, ref, count }) => (
        <div key={key} className="flex items-center justify-between gap-3 border-b border-border last:border-b-0 px-3 py-2 hover:bg-accent">
          <div className="min-w-0">
            {/* Name is the headline when the payload carried one, with the code
                beneath it, so a bare code is never mistaken for a company name. */}
            <div className="text-[13px] text-foreground truncate">{ref.name || ref.code}</div>
            <div className="text-[11px] text-muted-foreground">
              {ref.code && ref.name ? <span className="font-mono">{ref.code}</span> : null}
              <span className={ref.code && ref.name ? 'ml-1' : ''}>
                on {count} {count === 1 ? 'lead' : 'leads'}, no {cfg.label} record
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1 text-primary"
              disabled={busyId === key} onClick={() => create(key, ref)}>
              <Plus className="w-3 h-3" /> Create
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => setDismissed((p) => new Set(p).add(key))}>
              Ignore
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* One-line notification bar. The list lives in the dialog: rendered inline
          it pushed the actual buyer table off the page. Mirrors the auto-detected
          fields bar in Settings, Custom Fields. */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/15 transition-colors text-left"
      >
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[13px] text-primary">
          {total} {total === 1 ? cfg.label : cfg.labelPlural} referenced by inbound leads need review
        </span>
        <span className="text-[12px] text-primary/70 ml-auto shrink-0">Review &rarr;</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {total} {total === 1 ? cfg.label : cfg.labelPlural} need review
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">
              Leads name {total === 1 ? `a ${cfg.label}` : cfg.labelPlural} with no record behind {total === 1 ? 'it' : 'them'}, so reports point at something that does not exist. Anything created here stays inactive with no pricing until you finish the setup.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
            {rows}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!discardTarget} onOpenChange={(v) => { if (!v) setDiscardTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this {cfg.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes "{discardTarget ? cfg.nameOf(discardTarget) : ''}". Leads already attributed to it keep the name on the lead record, so it will be detected again here. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={discard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
