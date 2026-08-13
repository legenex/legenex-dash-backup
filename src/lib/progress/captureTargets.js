// Pure helpers for deciding what can be captured and how.
//
// Split out of OffscreenCapture so they can be unit tested without a DOM. The
// capture pipeline has failed twice in ways nobody could see until a screenshot
// came back blank, so the parts that CAN be checked mechanically are.

export const CAPTURE_WIDTHS = {
  desktop: 1440,
  tablet: 768,
  mobile: 390,
};

export const ALL_VIEWPORTS = ['desktop', 'tablet', 'mobile'];

// Route wrappers that exist for auth, not for layout. Rendering them offscreen
// would gate the capture behind a redirect to login.
export const NON_VISUAL_WRAPPERS = ['ProtectedRoute', 'PermissionRoute'];

export function widthFor(viewport) {
  return CAPTURE_WIDTHS[viewport] || CAPTURE_WIDTHS.desktop;
}

// Parse the inline props the router passes, e.g. view="sold".
export function parseProps(raw) {
  const out = {};
  if (!raw) return out;
  const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let m;
  while ((m = re.exec(raw))) {
    const value = m[2] ?? m[3] ?? m[4];
    if (value === undefined) continue;
    out[m[1]] = value.trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

// The layout chain to rebuild around a page, auth wrappers removed.
export function visualLayouts(layouts) {
  const names = Array.isArray(layouts)
    ? layouts
    : (() => { try { return JSON.parse(layouts || '[]'); } catch { return []; } })();
  return names.filter((n) => n && !NON_VISUAL_WRAPPERS.includes(n));
}

/**
 * Can this surface be rendered offscreen and photographed?
 *
 * Redirects and catchalls have nothing to render. Routes with an :id parameter
 * have no stable instance to capture. Portal surfaces read their data from a
 * layout context that only exists for a portal account. Anything without a
 * resolved component file cannot be loaded at all.
 */
export function isCapturable(page) {
  if (!page) return false;
  if (!['page', 'tab'].includes(page.route_type)) return false;
  if (page.portal_scope !== 'operator') return false;
  if (!page.component_path) return false;
  if (String(page.route || '').includes(':')) return false;
  return true;
}

export function capturable(pages) {
  return (pages || []).filter(isCapturable);
}

// How many captures a run will attempt, so progress can be reported honestly
// before it starts.
export function plannedCaptureCount(pages, viewports = ALL_VIEWPORTS) {
  return capturable(pages).length * viewports.length;
}
