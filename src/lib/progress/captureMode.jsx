import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

// "We are rendering a page offscreen purely to photograph it."
//
// The offscreen capturer mounts the real application shell so the screenshot
// includes the sidebar and sub-navigation, which is the point: those are part of
// the page being reviewed. But mounting the real shell also mounts its side
// effects, and a screenshot must never cause the app to DO anything. The Meta
// auto-sync in particular writes ad spend records on an interval.
//
// Three ways to read it, because different callers need different things:
//   isCaptureMode()      plain read, for hooks that only need the value now
//   useCaptureMode()     subscribed, so a mounted component re-renders on change
//   CaptureModeProvider  wraps the offscreen tree, for components that would
//                        rather take it from context than from a module global

let capturing = false;
const listeners = new Set();

export function setCaptureMode(on) {
  const next = Boolean(on);
  if (next === capturing) return;
  capturing = next;
  listeners.forEach((fn) => {
    try { fn(); } catch { /* a bad listener must not break a capture */ }
  });
}

export function isCaptureMode() {
  return capturing;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const CaptureModeContext = createContext(null);

export function useCaptureMode() {
  const fromContext = useContext(CaptureModeContext);
  const fromStore = useSyncExternalStore(subscribe, isCaptureMode, () => false);
  return fromContext === null ? fromStore : fromContext;
}

export function CaptureModeProvider({ value = true, children }) {
  const resolved = useMemo(() => Boolean(value), [value]);
  return (
    <CaptureModeContext.Provider value={resolved}>
      {children}
    </CaptureModeContext.Provider>
  );
}
