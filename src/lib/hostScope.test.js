import { describe, it, expect } from 'vitest';
import { hostScope, isAllowedOnProgressHost } from './hostScope';

describe('host scoping', () => {
  it('serves the Progress Control Center on the progress subdomain', () => {
    expect(hostScope('progress.dashboard.legenex.com')).toBe('progress');
    expect(hostScope('PROGRESS.dashboard.legenex.com')).toBe('progress');
  });

  it('serves the operator dashboard on the main host', () => {
    expect(hostScope('dashboard.legenex.com')).toBe('dashboard');
  });

  it('keeps the api and docs hosts on their own scopes', () => {
    expect(hostScope('api.legenex.com')).toBe('api');
    expect(hostScope('docs.legenex.com')).toBe('docs');
  });

  it('never lets the progress host resolve to anything else', () => {
    // The whole point of the subdomain: it cannot fall through to the operator
    // app, the docs, or the api, whatever else is in the name.
    [
      'progress.dashboard.legenex.com',
      'progress.legenex.com',
      'progress.docs.legenex.com',
    ].forEach((h) => expect(hostScope(h)).toBe('progress'));
  });

  it('does not treat a host that merely contains the word progress as the progress host', () => {
    expect(hostScope('in-progress.legenex.com')).toBe('dashboard');
    expect(hostScope('dashboard.progress.legenex.com')).toBe('dashboard');
  });

  it('allows only progress and auth paths on the progress host', () => {
    ['/progress', '/progress/review', '/progress/gates', '/login', '/reset-password']
      .forEach((p) => expect(isAllowedOnProgressHost(p)).toBe(true));

    // Operator surfaces, portals, docs and the public application form must all
    // be unreachable on that domain.
    ['/', '/leads', '/campaigns', '/finances', '/settings', '/portal', '/supplier-portal', '/docs', '/apply']
      .forEach((p) => expect(isAllowedOnProgressHost(p)).toBe(false));
  });
});
