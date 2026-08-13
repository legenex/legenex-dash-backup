import { describe, it, expect } from 'vitest';
import {
  parseProps, visualLayouts, isCapturable, capturable,
  plannedCaptureCount, widthFor, ALL_VIEWPORTS,
} from './captureTargets';

const page = (over = {}) => ({
  page_key: 'campaigns',
  route: '/campaigns',
  route_type: 'page',
  portal_scope: 'operator',
  component_path: 'src/pages/Campaigns.jsx',
  ...over,
});

describe('capture widths', () => {
  it('captures all three viewports by default', () => {
    expect(ALL_VIEWPORTS).toEqual(['desktop', 'tablet', 'mobile']);
  });

  it('forces the layout width rather than using the window', () => {
    expect(widthFor('desktop')).toBe(1440);
    expect(widthFor('tablet')).toBe(768);
    expect(widthFor('mobile')).toBe(390);
    expect(widthFor('nonsense')).toBe(1440);
  });
});

describe('inline route props', () => {
  it('reads the props the router passes to a shared component', () => {
    expect(parseProps('view="sold"')).toEqual({ view: 'sold' });
    expect(parseProps("view='queued' mode=\"compact\"")).toEqual({ view: 'queued', mode: 'compact' });
  });

  it('is safe on empty or malformed input', () => {
    expect(parseProps(null)).toEqual({});
    expect(parseProps('')).toEqual({});
    expect(parseProps('garbage')).toEqual({});
  });
});

describe('layout chain', () => {
  it('keeps the visual layouts so the sidebar and sub-menu are in the shot', () => {
    expect(visualLayouts(['ProtectedRoute', 'AppLayout', 'PermissionRoute', 'LeadsLayout']))
      .toEqual(['AppLayout', 'LeadsLayout']);
  });

  it('drops the auth wrappers, which would redirect instead of rendering', () => {
    expect(visualLayouts(['ProtectedRoute', 'PermissionRoute'])).toEqual([]);
  });

  it('accepts the JSON string form stored on a record', () => {
    expect(visualLayouts('["ProtectedRoute","AppLayout"]')).toEqual(['AppLayout']);
    expect(visualLayouts('not json')).toEqual([]);
    expect(visualLayouts(null)).toEqual([]);
  });
});

describe('what can be captured', () => {
  it('captures ordinary operator pages and tabs', () => {
    expect(isCapturable(page())).toBe(true);
    expect(isCapturable(page({ route_type: 'tab', route: '/reports?tab=daily' }))).toBe(true);
  });

  it('skips redirects and catchalls, which have nothing to render', () => {
    expect(isCapturable(page({ route_type: 'redirect' }))).toBe(false);
    expect(isCapturable(page({ route_type: 'catchall' }))).toBe(false);
  });

  it('skips detail routes, which have no stable instance to photograph', () => {
    expect(isCapturable(page({ route_type: 'detail', route: '/suppliers/:id' }))).toBe(false);
    expect(isCapturable(page({ route: '/distribution/buyers/:id' }))).toBe(false);
  });

  it('skips portal surfaces, which need a portal account to render', () => {
    expect(isCapturable(page({ portal_scope: 'buyer_portal' }))).toBe(false);
    expect(isCapturable(page({ portal_scope: 'supplier_portal' }))).toBe(false);
    expect(isCapturable(page({ portal_scope: 'public' }))).toBe(false);
  });

  it('skips anything with no component file to load', () => {
    expect(isCapturable(page({ component_path: '' }))).toBe(false);
    expect(isCapturable(null)).toBe(false);
  });

  it('plans one capture per page per viewport', () => {
    const pages = [page(), page({ page_key: 'b', route: '/b' }), page({ route_type: 'redirect' })];
    expect(capturable(pages)).toHaveLength(2);
    expect(plannedCaptureCount(pages)).toBe(6);
    expect(plannedCaptureCount(pages, ['desktop'])).toBe(2);
  });
});
