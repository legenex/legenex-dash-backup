import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DistributionNav from './DistributionNav.jsx';

// Pins the buyer-centric IA: exactly five top-level sections (Dashboard,
// Campaigns, Buyers, Webhooks, Conversion Events), each a real link with an icon,
// present in both the expanded column and the collapsed rail. Verticals, Brands,
// Suppliers, Deliveries, Route Groups, and Simulator are NOT in the nav.
let storeValue = null;
beforeAll(() => { globalThis.localStorage = { getItem: () => storeValue, setItem: () => {} }; });
afterAll(() => { delete globalThis.localStorage; });

function render(path = '/distribution') {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(DistributionNav)),
  );
}

const PRESENT = [
  ['Dashboard', '/distribution'],
  ['Campaigns', '/campaigns'],
  ['Webhooks', '/deliveries'],
  ['Conversion Events', '/conversion-events'],
];
// Buyers is deliberately absent: buyers are managed in Operations and their
// deliveries are configured in the campaign, so a second buyer list here was a
// duplicate editor for the same records.
const ABSENT_LABELS = ['Verticals', 'Brands', 'Suppliers', 'Deliveries', 'Route Groups', 'Simulator', 'Buyers'];
const ABSENT_ROUTES = ['/campaigns/deliveries', '/distribution/buyers', '/distribution/routes', '/distribution/simulator', 'tab=verticals', 'tab=brands', 'tab=suppliers'];

describe('DistributionNav pins the buyer-centric IA', () => {
  it('expanded column shows exactly the four sections with their routes', () => {
    const html = render();
    for (const [label, route] of PRESENT) {
      expect(html).toContain(`href="${route}"`);
      expect(html).toContain(label);
    }
  });

  it('does not surface Verticals / Brands / Suppliers / Deliveries / Route Groups / Simulator', () => {
    const html = render();
    for (const label of ABSENT_LABELS) expect(html).not.toContain(`>${label}<`);
    for (const route of ABSENT_ROUTES) expect(html).not.toContain(route);
  });

  it('does not surface a second Buyers list under Distribution', () => {
    const html = render();
    expect(html).not.toContain('href="/distribution/buyers"');
  });

  it('all four sections appear in the collapsed rail with icons (reachable when collapsed)', () => {
    storeValue = 'true'; // legenex_subnav_collapsed = true -> collapsed rail renders
    const html = render();
    for (const [, route] of PRESENT) expect(html).toContain(`href="${route}"`);
    // Icons render as <svg> marks in the rail.
    expect(html).toContain('<svg');
    storeValue = null;
  });
});
