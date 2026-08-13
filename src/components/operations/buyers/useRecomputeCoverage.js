import { useState, useRef, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Query keys the recompute affects: the buyer table, the coverage grid / CPL
// range, and the resolved state statuses. Refreshed when a recompute returns.
const AFFECTED_KEYS = [['op-buyers'], ['op-buyer-state-cpl'], ['op-state-status']];

// Coalesce window: a burst of edits within this window produces one recompute.
const COALESCE_MS = 700;

// Owns the wiring between buyer / coverage mutations and recomputeStateStatus:
//  - debounces rapid successive calls into a single recompute (per vertical)
//  - exposes a `recomputing` flag for a subtle inline indicator
//  - refreshes the affected react-query caches when a recompute returns
//  - on failure, surfaces a non blocking warning toast with a Retry action
// Never blocks the UI: callers fire and forget after their write succeeds.
export function useRecomputeCoverage() {
  const qc = useQueryClient();
  const [recomputing, setRecomputing] = useState(false);
  const timerRef = useRef(null);
  const pendingRef = useRef(null); // { vertical, triggered_by_buyer_id }
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const runRecompute = useCallback(async (args) => {
    if (mountedRef.current) setRecomputing(true);
    try {
      await base44.functions.invoke('recomputeStateStatus', args);
      await Promise.all(AFFECTED_KEYS.map((key) => qc.invalidateQueries({ queryKey: key })));
    } catch {
      // The write already succeeded and is not rolled back. Warn without
      // blocking, and offer a retry that runs the same recompute again.
      toast.warning('Coverage was saved but state coverage did not recompute.', {
        action: { label: 'Retry', onClick: () => runRecompute(args) },
        duration: 10000,
      });
    } finally {
      if (mountedRef.current) setRecomputing(false);
    }
  }, [qc]);

  // Schedule a recompute for a buyer. Coalesces bursts into one call. Pass the
  // buyer's vertical and id; the function stamps triggered_by_user_id itself.
  const scheduleRecompute = useCallback((buyer) => {
    if (!buyer) return;
    pendingRef.current = {
      vertical: buyer.vertical || undefined,
      triggered_by_buyer_id: buyer.id,
      emit_events: true,
    };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const args = pendingRef.current;
      pendingRef.current = null;
      timerRef.current = null;
      if (args) runRecompute(args);
    }, COALESCE_MS);
  }, [runRecompute]);

  return { recomputing, scheduleRecompute };
}