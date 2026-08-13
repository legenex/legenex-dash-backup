import { describe, it, expect } from 'vitest';
import { wallClock, isWithinSchedule } from './schedule.js';

const MON = Date.UTC(2026, 6, 13, 14, 12, 53); // 2026-07-13T14:12:53Z is a Monday
const SUN = Date.UTC(2026, 6, 12, 12, 0, 0);    // Sunday

describe('wallClock resolves tz-local day/time', () => {
  it('UTC', () => {
    expect(wallClock(MON, 'UTC')).toEqual({ dow: 1, minutes: 14 * 60 + 12 });
  });
  it('America/New_York (EDT, UTC-4)', () => {
    expect(wallClock(MON, 'America/New_York')).toEqual({ dow: 1, minutes: 10 * 60 + 12 });
  });
});

describe('isWithinSchedule', () => {
  it('no windows means always on', () => {
    expect(isWithinSchedule(MON, {})).toBe(true);
    expect(isWithinSchedule(MON, { windows: [] })).toBe(true);
  });
  it('timezone actually matters', () => {
    const sched = { windows: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '11:00' }] };
    // 14:12 UTC is outside 09:00-11:00, but 10:12 New York is inside
    expect(isWithinSchedule(MON, { ...sched, timezone: 'UTC' })).toBe(false);
    expect(isWithinSchedule(MON, { ...sched, timezone: 'America/New_York' })).toBe(true);
  });
  it('excludes days outside the daypart', () => {
    const sched = { timezone: 'UTC', windows: [{ days: [1, 2, 3, 4, 5], start: '00:00', end: '24:00' }] };
    expect(isWithinSchedule(SUN, sched)).toBe(false); // Sunday not in Mon-Fri
    expect(isWithinSchedule(MON, sched)).toBe(true);
  });
  it('supports overnight windows that wrap midnight', () => {
    const sched = { timezone: 'UTC', windows: [{ start: '22:00', end: '06:00' }] };
    expect(isWithinSchedule(Date.UTC(2026, 6, 13, 23, 30), sched)).toBe(true);
    expect(isWithinSchedule(Date.UTC(2026, 6, 13, 12, 0), sched)).toBe(false);
  });
});
