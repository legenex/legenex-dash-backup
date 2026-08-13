import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { AuthProvider } from '@/lib/AuthContext';
import { capturePageElement } from '@/lib/progress/capture';
import { setCaptureMode, CaptureModeProvider } from '@/lib/progress/captureMode';
import {
  CAPTURE_WIDTHS, ALL_VIEWPORTS, widthFor, parseProps, visualLayouts,
} from '@/lib/progress/captureTargets';

// Offscreen capture.
//
// Mounts the REAL application shell (sidebar, section sub-navigation, page) into
// a hidden fixed-width container in the current document, photographs it, then
// unmounts. Nothing navigates, so you are never dragged around your own app to
// take a screenshot.
//
// Two things earlier versions got wrong:
//   1. Only the page component was rendered, so the sidebar and sub-menu were
//      missing from every shot. Those are part of what there is to review.
//   2. The app shell is h-screen with an inner overflow-y-auto, so anything
//      below the fold was cropped. The clip is lifted for the capture.
//
// Constants and pure helpers live in src/lib/progress/captureTargets.js, which
// is unit tested. Nothing is redefined here.
//
// It cannot be done on the server: Base44 functions run Deno with no browser, so
// there is nothing to render into.

const PAGE_MODULES = import.meta.glob('/src/pages/**/*.jsx');
const LAYOUT_MODULES = import.meta.glob('/src/components/**/*Layout.jsx');

// Re-exported so callers have one obvious place to import capture constants from.
export { CAPTURE_WIDTHS, ALL_VIEWPORTS };

// The app shell fills the viewport and scrolls inside itself. For a capture we
// want the opposite: let it grow to its content so nothing is cut off.
const UNCLIP_CSS = `
[data-offscreen-capture] { height: auto !important; overflow: visible !important; }
[data-offscreen-capture] .h-screen { height: auto !important; min-height: 0 !important; }
[data-offscreen-capture] .overflow-hidden { overflow: visible !important; }
[data-offscreen-capture] .overflow-y-auto,
[data-offscreen-capture] .overflow-auto,
[data-offscreen-capture] .app-scroll {
  overflow: visible !important;
  height: auto !important;
  max-height: none !important;
}
[data-offscreen-capture] .sticky, [data-offscreen-capture] .fixed { position: relative !important; }
`;

function findModule(modules, name) {
  return Object.keys(modules).find((k) => k.endsWith(`/${name}.jsx`));
}

async function loadComponent(componentPath) {
  if (!componentPath) throw new Error('No component path recorded for this surface');
  const key = componentPath.startsWith('/') ? componentPath : `/${componentPath}`;
  const loader = PAGE_MODULES[key];
  if (!loader) throw new Error(`${componentPath} is not a page module, so it cannot be rendered offscreen`);
  const mod = await loader();
  if (!mod?.default) throw new Error(`${componentPath} has no default export`);
  return mod.default;
}

// Rebuild the layout chain the router really wraps this route in, so the shot
// includes the sidebar and section sub-navigation.
async function loadLayouts(layouts) {
  const loaded = [];
  for (const name of visualLayouts(layouts)) {
    const key = findModule(LAYOUT_MODULES, name);
    if (!key) continue;
    // eslint-disable-next-line no-await-in-loop
    const mod = await LAYOUT_MODULES[key]();
    if (mod?.default) loaded.push({ name, Component: mod.default });
  }
  return loaded;
}

class CaptureBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { this.props.onError?.(error); }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

function makeHost(width) {
  const host = document.createElement('div');
  host.setAttribute('data-progress-capture-ui', 'true');
  host.setAttribute('data-offscreen-capture', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    // At the document origin, not off to the left: html2canvas crops relative to
    // the document, so an element parked outside it captures nothing. Invisible
    // via opacity and a deep negative z-index instead, which still gives it real
    // layout. The clone is made opaque again before rasterising.
    top: '0',
    left: '0',
    width: `${width}px`,
    background: getComputedStyle(document.body).backgroundColor || '#0A0E15',
    opacity: '0',
    zIndex: '-2147483647',
    pointerEvents: 'none',
    overflow: 'visible',
  });
  document.body.appendChild(host);
  return host;
}

function injectUnclipStyle() {
  if (document.getElementById('progress-capture-unclip')) return;
  const style = document.createElement('style');
  style.id = 'progress-capture-unclip';
  style.textContent = UNCLIP_CSS;
  document.head.appendChild(style);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait for the page's queries to settle, with a floor and a ceiling. A page that
// never settles is captured anyway and the snapshot says so: a screenshot of a
// stuck page is itself worth seeing.
async function waitForSettle({ minMs = 1400, maxMs = 15000 } = {}) {
  const started = Date.now();
  await wait(minMs);
  while (Date.now() - started < maxMs) {
    if (queryClientInstance.isFetching() === 0) {
      await wait(400);
      if (queryClientInstance.isFetching() === 0) return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await wait(250);
  }
  return false;
}

/**
 * Render one page offscreen inside its real layout chain and capture it.
 * Always resolves: a failure produces a snapshot with capture_status failed and
 * the reason attached, so the gap is visible rather than looking unreviewed.
 */
export async function captureOffscreen(page, {
  viewport = 'desktop',
  mask = true,
  role,
  capturedBy,
} = {}) {
  const width = widthFor(viewport);
  let host = null;
  let root = null;
  let renderError = null;

  try {
    const [Component, layouts] = await Promise.all([
      loadComponent(page.component_path),
      loadLayouts(page.layouts),
    ]);
    const props = parseProps(page.component_props);

    injectUnclipStyle();
    setCaptureMode(true);
    host = makeHost(width);
    root = createRoot(host);

    const leaf = <Route path="*" element={<Component {...props} />} />;
    const tree = layouts.reduceRight(
      (child, { name, Component: Layout }) => (
        <Route key={name} element={<Layout />}>{child}</Route>
      ),
      leaf,
    );

    await new Promise((resolve) => {
      root.render(
        <CaptureModeProvider>
          <AuthProvider>
            <QueryClientProvider client={queryClientInstance}>
              <MemoryRouter initialEntries={[page.route || '/']}>
                <CaptureBoundary onError={(e) => { renderError = e; }}>
                  <Routes>{tree}</Routes>
                </CaptureBoundary>
              </MemoryRouter>
            </QueryClientProvider>
          </AuthProvider>
        </CaptureModeProvider>,
      );
      setTimeout(resolve, 80);
    });

    if (renderError) throw renderError;
    const settled = await waitForSettle();
    if (renderError) throw renderError;

    if (!host.firstChild || host.scrollHeight < 40) {
      throw new Error('The page rendered empty outside its normal layout');
    }

    return await capturePageElement({
      pageKey: page.page_key,
      route: page.route,
      element: host,
      viewport,
      width,
      mask,
      role,
      capturedBy,
      notes: settled ? null : 'Captured before all queries settled',
    });
  } catch (err) {
    return capturePageElement({
      pageKey: page.page_key,
      route: page.route,
      element: null,
      viewport,
      width,
      mask,
      role,
      capturedBy,
      forcedError: String(err?.message || err),
    });
  } finally {
    if (root) { try { root.unmount(); } catch { /* already gone */ } }
    if (host && host.parentNode) host.parentNode.removeChild(host);
    setCaptureMode(false);
  }
}

/**
 * Run a batch offscreen, one at a time so the query client is not swamped.
 * Every viewport by default: asking for tablet and mobile separately was busywork.
 */
export function useOffscreenCapture({ role, capturedBy, mask = true, onDone } = {}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  const run = useCallback(async (pages, { viewports = ALL_VIEWPORTS, label = 'pages' } = {}) => {
    const targets = (pages || []).filter((p) => p.component_path);
    if (targets.length === 0) return;

    cancelRef.current = false;
    setRunning(true);
    const total = targets.length * viewports.length;
    let done = 0;
    let failed = 0;
    const failures = [];

    for (const page of targets) {
      for (const viewport of viewports) {
        if (cancelRef.current) break;
        setProgress({ done, total, failed, current: page.title, viewport, label, failures });
        // eslint-disable-next-line no-await-in-loop
        const snap = await captureOffscreen(page, { viewport, mask, role, capturedBy });
        if (snap?.capture_status === 'failed') {
          failed += 1;
          failures.push({ page: page.title, viewport, reason: snap.failure_reason });
        }
        done += 1;
      }
      if (cancelRef.current) break;
    }

    setProgress({
      done, total, failed, failures, current: null, label,
      finished: true, cancelled: cancelRef.current,
    });
    setRunning(false);
    onDone?.({ done, total, failed, failures, cancelled: cancelRef.current });
  }, [mask, role, capturedBy, onDone]);

  return { run, cancel, running, progress, clear: () => setProgress(null) };
}
