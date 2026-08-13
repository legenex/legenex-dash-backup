import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isCaptureMode } from '@/lib/progress/captureMode';

// Keeps Meta ad spend fresh without anyone pressing Refresh.
//
// Spend used to go stale for hours because nothing ever triggered a sync on its
// own: the Refresh button on Overview was the only caller, and the "next
// scheduled sync" the UI displays is computed from a configured interval that
// no job actually honours.
//
// Every INTERVAL this asks the server when the last successful sync was and
// re-syncs only if that is older than INTERVAL. Reading the answer from the
// server rather than local state matters: several open tabs, or another
// operator entirely, would otherwise each fire their own sync on their own
// timer. Whoever gets there first refreshes the timestamp and the rest stand
// down.
//
// LIMITATION worth being honest about: this only runs while someone has the app
// open. Genuine round-the-clock syncing needs the scheduled job configured on
// the Base44 dashboard (Functions > syncMetaSpend), which cannot be declared in
// this repo. This closes the "I opened the dashboard and the number was three
// hours stale" gap, not the overnight one.

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const CHECK_MS = 60 * 1000;         // re-evaluate every minute

export default function useMetaAutoSync({ enabled = true } = {}) {
  // A screenshot must never cause the app to do anything. The offscreen capturer
  // mounts the real shell, which mounts this hook; syncing ad spend because
  // somebody took a screenshot would be a genuine data side effect. Either the
  // caller passing enabled: false or the module level capture flag stands it down.
  const capturing = isCaptureMode() || enabled === false;

  const qc = useQueryClient();
  // Guards against a slow sync overlapping the next tick.
  const inFlight = useRef(false);

  useEffect(() => {
    if (capturing) return undefined;
    if (!enabled) return undefined;
    let cancelled = false;

    const lastSuccessMs = async () => {
      try {
        const res = await base44.functions.invoke('metaConnectionStatus', {});
        const accounts = res?.data?.accounts || res?.accounts || [];
        let newest = 0;
        for (const a of accounts) {
          const t = a?.last_success_at ? Date.parse(a.last_success_at) : NaN;
          if (!Number.isNaN(t) && t > newest) newest = t;
        }
        return newest;
      } catch {
        // Status unavailable: treat as unknown rather than as "never synced",
        // so a transient failure cannot turn this into a sync-every-minute loop.
        return Date.now();
      }
    };

    const tick = async () => {
      if (cancelled || inFlight.current) return;
      const newest = await lastSuccessMs();
      if (cancelled) return;
      if (newest && Date.now() - newest < INTERVAL_MS) return;

      inFlight.current = true;
      try {
        // Incremental only. The month-long deep pass is deliberately left to
        // Sync All and the scheduled job, since re-pulling every account's full
        // month every quarter hour would be wasteful and slow.
        await base44.functions.invoke('syncMetaSpend', { mode: 'incremental' });
        if (!cancelled) qc.invalidateQueries();
      } catch {
        // Silent. This is background upkeep, not something the operator asked
        // for, so a failure should not interrupt them with a toast. The next
        // tick tries again.
      } finally {
        inFlight.current = false;
      }
    };

    // Check shortly after mount so opening the app to a stale figure self
    // corrects, rather than waiting a full interval first.
    const initial = setTimeout(tick, 4000);
    const id = setInterval(tick, CHECK_MS);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [enabled, qc]);
}
