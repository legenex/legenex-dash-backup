// When screenshots should be retaken.
//
// Two rules, and the distinction between them is the whole point:
//
//   STRUCTURE changed  -> retake. The build moved, so the page may genuinely
//                         look different.
//   DATA changed       -> do nothing. A new lead arriving is not a reason to
//                         re-photograph 116 pages, and treating it as one would
//                         mean the tool spends all day capturing instead of
//                         being usable.
//
// Structure is identified by the app commit baked into the page manifest at
// build time. Data lives in records and never moves it. That is exactly the
// signal we want: a deploy changes it, a lead does not.
//
// Also retakes anything simply MISSING, which is the common case: a page that
// has a desktop capture but no tablet or mobile one looks to the operator like
// nothing was ever saved.
//
// Pure. No I/O, no React, so the decision can be tested without a browser.

export const ALL_VIEWPORTS = ['desktop', 'tablet', 'mobile'];

// Regina is UTC-6 with no DST, so a fixed offset is correct and avoids
// depending on timezone data. "Midnight" means midnight where Nick is.
export function reginaDayKey(date = new Date()) {
  return new Date(date.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// The newest usable capture per page and viewport. Failed captures do not count
// as coverage: a page whose last attempt failed still needs one.
export function indexSnapshots(snapshots = []) {
  const index = new Map();
  snapshots.forEach((s) => {
    if (!s || s.capture_status === 'failed') return;
    const key = `${s.page_key}::${s.viewport}`;
    const held = index.get(key);
    const at = String(s.captured_at || s.created_date || '');
    if (!held || at > held.at) index.set(key, { at, commit: s.app_commit || null, id: s.id });
  });
  return index;
}

/**
 * Work out what needs recapturing.
 *
 * Returns the pages needing work and, for reporting, why. Never returns a page
 * whose captures are all present and all taken against the current build.
 */
export function findOutdated(pages = [], snapshots = [], currentCommit, viewports = ALL_VIEWPORTS) {
  const index = indexSnapshots(snapshots);
  const missing = [];
  const restructured = [];

  pages.forEach((page) => {
    let needsMissing = false;
    let needsStructure = false;
    viewports.forEach((viewport) => {
      const held = index.get(`${page.page_key}::${viewport}`);
      if (!held) { needsMissing = true; return; }
      // No commit recorded means it predates commit tracking. Treat as current
      // rather than forcing a rebuild of everything the first time this runs.
      if (currentCommit && held.commit && held.commit !== currentCommit) needsStructure = true;
    });
    if (needsMissing) missing.push(page);
    else if (needsStructure) restructured.push(page);
  });

  return {
    missing,
    restructured,
    targets: [...missing, ...restructured],
    total: missing.length + restructured.length,
  };
}

/**
 * Should the daily pass run now, and on what.
 *
 * Runs at most once per Regina day. It cannot literally fire at midnight while
 * nobody has the app open: there is no browser to render into, so a true
 * unattended job needs a headless runner. Running on the first visit of each new
 * day is the honest equivalent and needs no infrastructure.
 */
export function planDailyRefresh({
  pages = [],
  snapshots = [],
  currentCommit,
  lastRunDay,
  now = new Date(),
  viewports = ALL_VIEWPORTS,
  enabled = true,
} = {}) {
  const today = reginaDayKey(now);

  if (!enabled) {
    return { shouldRun: false, today, reason: 'Automatic refresh is switched off', targets: [] };
  }
  if (lastRunDay === today) {
    return { shouldRun: false, today, reason: 'Already ran today', targets: [] };
  }

  const outdated = findOutdated(pages, snapshots, currentCommit, viewports);
  if (outdated.total === 0) {
    return {
      shouldRun: false,
      today,
      reason: 'Every page has a current capture at every size',
      targets: [],
      ...outdated,
    };
  }

  const parts = [];
  if (outdated.missing.length) parts.push(`${outdated.missing.length} with a missing size`);
  if (outdated.restructured.length) parts.push(`${outdated.restructured.length} changed by a new build`);

  return {
    shouldRun: true,
    today,
    reason: parts.join(', '),
    ...outdated,
  };
}
