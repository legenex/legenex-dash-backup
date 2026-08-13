import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { US_STATES } from './usStates';
import { Pause, X } from 'lucide-react';
import { useRecomputeCoverage } from './useRecomputeCoverage';
import RecomputingIndicator from './RecomputingIndicator';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// Coverage band editor for a single buyer. Reads and writes BuyerStateCpl rows
// scoped to this buyer. After a coverage change succeeds it schedules a
// recompute of StateStatus through the shared hook (never writes StateStatus).
export default function BuyerCoverageTab({ buyer, verticals }) {
  const qc = useQueryClient();
  const feePct = Number(buyer.ipl_fee_pct ?? 1);
  const { recomputing, scheduleRecompute } = useRecomputeCoverage();

  const { data: allRows = [] } = useQuery({
    queryKey: ['op-buyer-state-cpl'],
    queryFn: () => fetchAll((limit, skip) => base44.entities.BuyerStateCpl.list('', limit, skip)),
  });
  const rows = useMemo(() => allRows.filter((r) => r.buyer_id === buyer.id), [allRows, buyer.id]);

  // Composer state
  const [cpl, setCpl] = useState('');
  const [vertical, setVertical] = useState(buyer.vertical || '');
  const [selectedStates, setSelectedStates] = useState([]);
  const [busy, setBusy] = useState(false);

  // Tile selection for the bulk bar
  const [selectedTiles, setSelectedTiles] = useState([]);

  // Sub-prompts
  const [repriceOpen, setRepriceOpen] = useState(false);
  const [repriceValue, setRepriceValue] = useState('');
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  useEffect(() => { setVertical(buyer.vertical || ''); }, [buyer.vertical]);

  // Map state -> row for the active vertical, so the grid reflects the vertical
  // currently in the composer.
  const rowByState = useMemo(() => {
    const map = {};
    for (const r of rows) {
      if (r.vertical === vertical) map[r.state] = r;
    }
    return map;
  }, [rows, vertical]);

  const activeRows = rows.filter((r) => r.active);
  const activeCpls = activeRows.map((r) => Number(r.cpl)).filter(Number.isFinite);
  const summary = {
    activeCount: activeRows.length,
    lo: activeCpls.length ? Math.min(...activeCpls) : null,
    hi: activeCpls.length ? Math.max(...activeCpls) : null,
    total: rows.length,
  };

  const liveIpl = cpl !== '' ? Number(cpl) * feePct : null;

  const refresh = () => qc.invalidateQueries({ queryKey: ['op-buyer-state-cpl'] });

  const toggleComposerState = (st) => {
    setSelectedStates((prev) => prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]);
  };
  const toggleTile = (st) => {
    setSelectedTiles((prev) => prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]);
  };

  // Apply band: upsert one row per selected state at the composer CPL.
  const applyBand = async () => {
    const cplNum = Number(cpl);
    if (!vertical) { toast.error('Select a vertical first'); return; }
    if (!Number.isFinite(cplNum) || cplNum <= 0) { toast.error('Enter a valid CPL'); return; }
    if (selectedStates.length === 0) { toast.error('Select at least one state'); return; }
    setBusy(true);
    try {
      const ipl = cplNum * feePct;
      for (const st of selectedStates) {
        const existing = rows.find((r) => r.vertical === vertical && r.state === st);
        if (existing) {
          await base44.entities.BuyerStateCpl.update(existing.id, { cpl: cplNum, ipl, active: true });
        } else {
          await base44.entities.BuyerStateCpl.create({
            buyer_id: buyer.id, vertical, state: st, cpl: cplNum, ipl, active: true,
          });
        }
      }
      toast.success(`Applied band to ${selectedStates.length} state${selectedStates.length === 1 ? '' : 's'}`);
      setSelectedStates([]);
      setCpl('');
      refresh();
      // One recompute after every row write finished, not one per row.
      scheduleRecompute(buyer);
    } catch (err) {
      toast.error(`Could not apply band: ${err?.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  // Clicking a tile: covered -> toggle active; uncovered -> prefill composer.
  const onTileClick = (st) => {
    const row = rowByState[st];
    if (!row) {
      setSelectedStates((prev) => prev.includes(st) ? prev : [...prev, st]);
      return;
    }
    toggleActive(row);
  };

  const toggleActive = async (row) => {
    try {
      if (row.active) {
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        await base44.entities.BuyerStateCpl.update(row.id, {
          active: false, paused_at: new Date().toISOString(), paused_by: me?.id || '',
        });
      } else {
        await base44.entities.BuyerStateCpl.update(row.id, {
          active: true, paused_at: null, paused_reason: null, paused_by: null,
        });
      }
      refresh();
      scheduleRecompute(buyer);
    } catch (err) {
      toast.error(`Could not update state: ${err?.message || 'unknown error'}`);
    }
  };

  // Bulk actions operate on selected tiles that have a row in the active vertical.
  const selectedRows = selectedTiles.map((st) => rowByState[st]).filter(Boolean);

  const bulkActivate = async () => {
    setBusy(true);
    try {
      await Promise.all(selectedRows.map((r) => base44.entities.BuyerStateCpl.update(r.id, {
        active: true, paused_at: null, paused_reason: null, paused_by: null,
      })));
      toast.success('Activated selected states');
      setSelectedTiles([]);
      refresh();
      scheduleRecompute(buyer);
    } catch (err) {
      toast.error(`Could not activate: ${err?.message || 'unknown error'}`);
    } finally { setBusy(false); }
  };

  const bulkRemove = async () => {
    setBusy(true);
    try {
      await Promise.all(selectedRows.map((r) => base44.entities.BuyerStateCpl.delete(r.id)));
      toast.success('Removed selected states');
      setSelectedTiles([]);
      refresh();
      scheduleRecompute(buyer);
    } catch (err) {
      toast.error(`Could not remove: ${err?.message || 'unknown error'}`);
    } finally { setBusy(false); }
  };

  const confirmReprice = async () => {
    const val = Number(repriceValue);
    if (!Number.isFinite(val) || val <= 0) { toast.error('Enter a valid CPL'); return; }
    setBusy(true);
    try {
      await Promise.all(selectedRows.map((r) => base44.entities.BuyerStateCpl.update(r.id, {
        cpl: val, ipl: val * feePct,
      })));
      toast.success('Repriced selected states');
      setRepriceOpen(false);
      setRepriceValue('');
      setSelectedTiles([]);
      refresh();
      scheduleRecompute(buyer);
    } catch (err) {
      toast.error(`Could not reprice: ${err?.message || 'unknown error'}`);
    } finally { setBusy(false); }
  };

  const confirmPause = async () => {
    setBusy(true);
    try {
      let me = null;
      try { me = await base44.auth.me(); } catch {}
      await Promise.all(selectedRows.map((r) => base44.entities.BuyerStateCpl.update(r.id, {
        active: false, paused_at: new Date().toISOString(), paused_by: me?.id || '', paused_reason: pauseReason.trim(),
      })));
      toast.success('Paused selected states');
      setPauseOpen(false);
      setPauseReason('');
      setSelectedTiles([]);
      refresh();
      scheduleRecompute(buyer);
    } catch (err) {
      toast.error(`Could not pause: ${err?.message || 'unknown error'}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      {/* Composer */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-[13px] font-semibold text-foreground">Band Composer</p>
            <RecomputingIndicator active={recomputing} />
          </div>
          {liveIpl !== null && (
            <span className="text-[12px] text-muted-foreground">
              IPL: <span className="font-mono tabular-nums text-foreground">{money(liveIpl)}</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">CPL</Label>
            <Input type="number" step="0.01" value={cpl} onChange={(e) => setCpl(e.target.value)} placeholder="0.00" className="bg-background font-mono tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">Vertical</Label>
            <Select value={vertical || 'none'} onValueChange={(v) => setVertical(v === 'none' ? '' : v)}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="Select vertical" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {verticals.map((vt) => <SelectItem key={vt.code} value={vt.code}>{vt.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[12px] text-muted-foreground">States ({selectedStates.length} selected)</Label>
            {selectedStates.length > 0 && (
              <button onClick={() => setSelectedStates([])} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
            )}
          </div>
          <div className="grid grid-cols-10 gap-1">
            {US_STATES.map((st) => {
              const on = selectedStates.includes(st);
              return (
                <button
                  key={st}
                  onClick={() => toggleComposerState(st)}
                  className={`h-7 rounded text-[10px] font-mono font-semibold transition-colors ${
                    on ? 'bg-primary text-primary-foreground' : 'bg-background border border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={applyBand} disabled={busy}>Apply Band</Button>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-[12px] text-muted-foreground text-center">
          This buyer covers no states yet and will not receive leads. Apply a band above to open coverage.
        </p>
      )}

      {/* Per buyer state grid */}
      {rows.length > 0 && (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[12px] text-muted-foreground">Coverage ({vertical || 'no vertical'})</Label>
              {selectedTiles.length > 0 && (
                <button onClick={() => setSelectedTiles([])} className="text-[11px] text-muted-foreground hover:text-foreground">Deselect all</button>
              )}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {US_STATES.map((st) => {
                const row = rowByState[st];
                const covered = !!row;
                const paused = covered && !row.active;
                const tileSelected = selectedTiles.includes(st);
                return (
                  <div
                    key={st}
                    className={`relative rounded-lg border p-2 transition-colors ${
                      tileSelected ? 'border-primary bg-primary/5' :
                      covered ? 'border-border bg-card' : 'border-dashed border-border bg-transparent'
                    }`}
                  >
                    {covered && (
                      <button
                        onClick={() => toggleTile(st)}
                        className={`absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                          tileSelected ? 'bg-primary border-primary' : 'border-border bg-background'
                        }`}
                        aria-label={`Select ${st}`}
                      >
                        {tileSelected && <span className="w-1.5 h-1.5 rounded-[1px] bg-primary-foreground" />}
                      </button>
                    )}
                    <button onClick={() => onTileClick(st)} className="block text-left w-full">
                      <span className={`font-mono text-[12px] font-semibold ${covered ? 'text-foreground' : 'text-muted-foreground/50'}`}>{st}</span>
                      <div className="mt-1 h-4 flex items-center gap-1">
                        {covered ? (
                          <>
                            <span className={`font-mono text-[11px] tabular-nums ${paused ? 'text-muted-foreground/60' : 'status-sold'}`}>
                              {money(row.cpl)}
                            </span>
                            {paused && <Pause className="w-2.5 h-2.5 text-muted-foreground/60" />}
                          </>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/40">Empty</span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coverage summary */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted-foreground border-t border-border pt-3">
            <span>Active states: <span className="font-mono tabular-nums text-foreground">{summary.activeCount}</span></span>
            <span>CPL range: <span className="font-mono tabular-nums text-foreground">
              {summary.lo === null ? 'n/a' : summary.lo === summary.hi ? money(summary.lo) : `${money(summary.lo)} - ${money(summary.hi)}`}
            </span></span>
            <span>Total rows: <span className="font-mono tabular-nums text-foreground">{summary.total}</span></span>
          </div>
        </>
      )}

      {/* Bulk action bar */}
      {selectedTiles.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-popover/95 backdrop-blur px-3 py-2.5 shadow-lg">
          <span className="text-[12px] text-muted-foreground mr-1">{selectedTiles.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => setPauseOpen(true)} disabled={busy}>Pause</Button>
          <Button size="sm" variant="outline" onClick={bulkActivate} disabled={busy}>Activate</Button>
          <Button size="sm" variant="outline" onClick={() => { setRepriceValue(''); setRepriceOpen(true); }} disabled={busy}>Reprice</Button>
          <Button size="sm" variant="outline" onClick={bulkRemove} disabled={busy} className="text-destructive hover:text-destructive">Remove</Button>
          <button onClick={() => setSelectedTiles([])} className="ml-auto text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Reprice prompt */}
      <AlertDialog open={repriceOpen} onOpenChange={setRepriceOpen}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Reprice {selectedRows.length} state{selectedRows.length === 1 ? '' : 's'}</AlertDialogTitle>
            <AlertDialogDescription>Set a new CPL for the selected states. IPL is recomputed automatically.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-[12px]">New CPL</Label>
            <Input type="number" step="0.01" value={repriceValue} onChange={(e) => setRepriceValue(e.target.value)} placeholder="0.00" className="bg-background font-mono tabular-nums" />
            {repriceValue !== '' && Number(repriceValue) > 0 && (
              <p className="text-[11px] text-muted-foreground">IPL: <span className="font-mono">{money(Number(repriceValue) * feePct)}</span></p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmReprice(); }} disabled={busy}>Reprice</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pause reason prompt */}
      <AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Pause {selectedRows.length} state{selectedRows.length === 1 ? '' : 's'}</AlertDialogTitle>
            <AlertDialogDescription>Provide a reason. These states will stop receiving leads until reactivated.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-[12px]">Reason</Label>
            <Textarea value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} placeholder="Why are these states being paused?" className="bg-background min-h-[80px] text-[13px]" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmPause(); }} disabled={!pauseReason.trim() || busy}>Pause States</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}