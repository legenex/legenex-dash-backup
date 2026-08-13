import { describe, it, expect } from 'vitest';
import {
  reginaDayKey, indexSnapshots, findOutdated, planDailyRefresh,
} from './captureSchedule';

const page = (key) => ({ page_key: key, title: key, route: `/${key}` });

const snap = (page_key, viewport, over = {}) => ({
  page_key,
  viewport,
  capture_status: 'ok',
  captured_at: '2026-07-30T12:00:00.000Z',
  app_commit: 'abc123',
  ...over,
});

const allSizes = (key, over) => ['desktop', 'tablet', 'mobile'].map((v) => snap(key, v, over));

describe('regina day key', () => {
  it('rolls over at local midnight, not UTC midnight', () => {
    // 05:00 UTC on the 31st is 23:00 on the 30th in Regina.
    expect(reginaDayKey(new Date('2026-07-31T05:00:00Z'))).toBe('2026-07-30');
    expect(reginaDayKey(new Date('2026-07-31T06:30:00Z'))).toBe('2026-07-31');
  });
});

describe('coverage', () => {
  it('ignores failed captures when deciding what exists', () => {
    const index = indexSnapshots([snap('leads', 'desktop', { capture_status: 'failed' })]);
    expect(index.size).toBe(0);
  });

  it('keeps the newest capture per page and viewport', () => {
    const index = indexSnapshots([
      snap('leads', 'desktop', { captured_at: '2026-07-01T00:00:00Z', app_commit: 'old' }),
      snap('leads', 'desktop', { captured_at: '2026-07-30T00:00:00Z', app_commit: 'new' }),
    ]);
    expect(index.get('leads::desktop').commit).toBe('new');
  });
});

describe('what needs recapturing', () => {
  it('flags a page that only has a desktop capture', () => {
    // This is the case Nick actually hit: desktop existed, tablet and mobile did
    // not, so switching viewport looked like nothing had been saved at all.
    const out = findOutdated([page('campaigns')], [snap('campaigns', 'desktop')], 'abc123');
    expect(out.missing.map((p) => p.page_key)).toEqual(['campaigns']);
    expect(out.total).toBe(1);
  });

  it('flags a page whose captures were taken against an older build', () => {
    const out = findOutdated([page('leads')], allSizes('leads', { app_commit: 'old' }), 'new');
    expect(out.restructured.map((p) => p.page_key)).toEqual(['leads']);
  });

  it('leaves a fully covered current page alone', () => {
    const out = findOutdated([page('leads')], allSizes('leads'), 'abc123');
    expect(out.total).toBe(0);
  });

  it('does NOT recapture when only the data changed', () => {
    // Same build, all sizes present. New leads arriving must not trigger 348
    // screenshots, which is the entire reason structure and data are separated.
    const out = findOutdated([page('leads')], allSizes('leads'), 'abc123');
    expect(out.total).toBe(0);
  });

  it('treats captures with no recorded commit as current', () => {
    const out = findOutdated([page('leads')], allSizes('leads', { app_commit: null }), 'new');
    expect(out.total).toBe(0);
  });
});

describe('daily plan', () => {
  const base = {
    pages: [page('campaigns')],
    snapshots: [snap('campaigns', 'desktop')],
    currentCommit: 'abc123',
    now: new Date('2026-07-31T18:00:00Z'),
  };

  it('runs once on the first visit of a new day', () => {
    const plan = planDailyRefresh({ ...base, lastRunDay: '2026-07-30' });
    expect(plan.shouldRun).toBe(true);
    expect(plan.targets).toHaveLength(1);
  });

  it('does not run twice in the same day', () => {
    const plan = planDailyRefresh({ ...base, lastRunDay: '2026-07-31' });
    expect(plan.shouldRun).toBe(false);
    expect(plan.reason).toContain('today');
  });

  it('does not run when everything is already covered and current', () => {
    const plan = planDailyRefresh({
      ...base,
      snapshots: allSizes('campaigns'),
      lastRunDay: '2026-07-30',
    });
    expect(plan.shouldRun).toBe(false);
    expect(plan.targets).toHaveLength(0);
  });

  it('can be switched off', () => {
    const plan = planDailyRefresh({ ...base, lastRunDay: '2026-07-30', enabled: false });
    expect(plan.shouldRun).toBe(false);
  });

  it('explains what it is about to do', () => {
    const plan = planDailyRefresh({ ...base, lastRunDay: '2026-07-30' });
    expect(plan.reason).toContain('missing size');
  });
});
