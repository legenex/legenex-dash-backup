import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useIsFetching } from '@tanstack/react-query';
import { Camera, Check, X, Loader2, EyeOff } from 'lucide-react';
import { useAuth, usePermissions } from '@/lib/AuthContext';
import { capturePage } from '@/lib/progress/capture';
import manifest from '@/lib/progress/pageManifest.json';

// Capture controller, mounted once inside AppLayout.
//
// Two jobs:
//
//   1. Manual. A small control on every operator page. See something wrong,
//      press it, the page as you are looking at it is captured and stored
//      against the matching ProgressPage.
//
//   2. Queued. The Progress Control Center can hand this a list of routes to
//      walk. It navigates, waits for the page's queries to settle, captures,
//      and moves to the next one. That is how "capture every page" works
//      without a headless browser: it uses the session you are already in.
//
// Nothing captures without a progress permission, and portal roles never reach
// this code because they never mount AppLayout.

const QUEUE_KEY = 'progress_capture_queue';
const RETURN_KEY = 'progress_capture_return';
const MASK_KEY = 'progress_capture_mask';

export function readQueue() {
  try { return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
export function writeQueue(queue) {
  sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue || []));
}
export function startCaptureQueue(pages, returnTo = '/progress/review') {
  writeQueue(pages);
  sessionStorage.setItem(RETURN_KEY, returnTo);
}

// A single capture launched FROM the review workspace should hand you back to
// the workspace when it is done. A capture taken from the floating button while
// you are browsing should leave you where you are.
export function setCaptureReturn(returnTo) {
  sessionStorage.setItem(RETURN_KEY, returnTo);
}
export function maskEnabled() {
  return sessionStorage.getItem(MASK_KEY) !== 'off';
}
export function setMaskEnabled(on) {
  sessionStorage.setItem(MASK_KEY, on ? 'on' : 'off');
}

// Resolve the current location to a page_key from the generated manifest.
export function pageKeyForLocation(pathname, search) {
  const tab = new URLSearchParams(search || '').get('tab');
  if (tab) {
    const withTab = manifest.pages.find((p) => p.parent_route === pathname && p.tab === tab);
    if (withTab) return withTab;
  }
  const exact = manifest.pages.find((p) => p.route === pathname && p.route_type !== 'tab');
  if (exact) return exact;
  // Detail routes such as /suppliers/:id.
  const detail = manifest.pages.find((p) => {
    if (!p.route?.includes(':')) return false;
    const re = new RegExp(`^${p.route.replace(/:[^/]+/g, '[^/]+')}$`);
    return re.test(pathname);
  });
  return detail || null;
}

export default function CaptureController() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can, role } = usePermissions();
  const { user } = useAuth();
  const isFetching = useIsFetching();

  const [state, setState] = useState('idle'); // idle | waiting | capturing | done | failed
  const [message, setMessage] = useState('');
  const [queueLeft, setQueueLeft] = useState(0);
  const busyRef = useRef(false);
  const settleRef = useRef(null);

  const allowed = can('progress_write') || can('progress_admin');
  const requested = params.get('progress_capture');
  const page = pageKeyForLocation(location.pathname, location.search);

  const runCapture = useCallback(async ({ advanceQueue }) => {
    if (busyRef.current) return;
    if (!page) {
      setState('failed');
      setMessage('This route is not in the page inventory, so there is nothing to attach a capture to.');
      return;
    }
    busyRef.current = true;
    setState('capturing');
    setMessage('');

    let snapshot = null;
    try {
      snapshot = await capturePage({
        pageKey: page.page_key,
        route: location.pathname + (location.search || ''),
        target: document.querySelector('main') || document.body,
        mask: maskEnabled(),
        role,
        capturedBy: user?.email || null,
      });
      if (snapshot?.capture_status === 'failed') {
        setState('failed');
        setMessage(snapshot.failure_reason || 'Capture failed');
      } else {
        setState('done');
        setMessage(snapshot?.mask_count > 0
          ? `Captured, ${snapshot.mask_count} personal values redacted`
          : 'Captured');
      }
    } catch (err) {
      setState('failed');
      setMessage(String(err?.message || err));
    } finally {
      busyRef.current = false;
    }

    if (advanceQueue) {
      const queue = readQueue();
      const rest = queue.slice(1);
      writeQueue(rest);
      setQueueLeft(rest.length);
      if (rest.length > 0) {
        const next = rest[0];
        const sep = next.route.includes('?') ? '&' : '?';
        setTimeout(() => navigate(`${next.route}${sep}progress_capture=${next.page_key}`, { replace: true }), 400);
      } else {
        const back = sessionStorage.getItem(RETURN_KEY) || '/progress/review';
        sessionStorage.removeItem(RETURN_KEY);
        setTimeout(() => navigate(back, { replace: true }), 700);
      }
    } else {
      // Drop the parameter so a refresh does not re-capture.
      const next = new URLSearchParams(params);
      next.delete('progress_capture');
      setParams(next, { replace: true });

      const back = sessionStorage.getItem(RETURN_KEY);
      if (back) {
        sessionStorage.removeItem(RETURN_KEY);
        setTimeout(() => navigate(back, { replace: true }), 900);
      } else {
        setTimeout(() => setState('idle'), 3500);
      }
    }
  }, [page, location.pathname, location.search, role, user, navigate, params, setParams]);

  // Automatic capture when a route is opened with the capture parameter.
  useEffect(() => {
    if (!requested || !allowed) return undefined;
    if (busyRef.current) return undefined;

    setState('waiting');
    const queue = readQueue();
    setQueueLeft(queue.length);
    const inQueue = queue.length > 0 && queue[0]?.page_key === requested;

    // Wait for the page's queries to settle before rasterising, otherwise the
    // capture is a picture of loading spinners. Falls through on a timeout so a
    // permanently loading page still produces a capture worth looking at.
    if (settleRef.current) clearTimeout(settleRef.current);
    const started = Date.now();
    const tick = () => {
      const settled = isFetching === 0;
      const waitedLongEnough = Date.now() - started > 900;
      const timedOut = Date.now() - started > 12000;
      if ((settled && waitedLongEnough) || timedOut) {
        runCapture({ advanceQueue: inQueue });
      } else {
        settleRef.current = setTimeout(tick, 300);
      }
    };
    settleRef.current = setTimeout(tick, 600);
    return () => { if (settleRef.current) clearTimeout(settleRef.current); };
    // isFetching intentionally in deps so the poll sees fresh values.
  }, [requested, allowed, isFetching, runCapture]);

  if (!allowed) return null;

  const busy = state === 'waiting' || state === 'capturing';

  return (
    <div
      data-progress-capture-ui="true"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 sm:bottom-5"
    >
      {busy || state === 'done' || state === 'failed' ? (
        <div className="flex items-center gap-2.5 rounded-full border border-border bg-popover px-3.5 py-2 shadow-lg">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          {state === 'done' && <Check className="h-3.5 w-3.5 text-chart-5" />}
          {state === 'failed' && <X className="h-3.5 w-3.5 text-primary" />}
          <span className="text-[12px] text-foreground">
            {state === 'waiting' && 'Waiting for the page to settle'}
            {state === 'capturing' && 'Capturing'}
            {state !== 'waiting' && state !== 'capturing' && message}
          </span>
          {queueLeft > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
              {queueLeft} left
            </span>
          )}
          {state === 'failed' && !readQueue().length && (
            <button
              type="button"
              onClick={() => setState('idle')}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        page && (
          <button
            type="button"
            onClick={() => runCapture({ advanceQueue: false })}
            title={`Capture ${page.title} for review`}
            className="flex items-center gap-2 rounded-full border border-border bg-popover px-3.5 py-2 text-[12px] text-muted-foreground shadow-lg transition-colors hover:bg-accent hover:text-foreground"
          >
            <Camera className="h-3.5 w-3.5" />
            Capture for review
            {maskEnabled() && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <EyeOff className="h-3 w-3" />
                masked
              </span>
            )}
          </button>
        )
      )}
    </div>
  );
}
