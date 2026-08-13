// Timezone-aware operating schedule / dayparting. Pure: `nowMs` is passed in.
// Uses Intl.DateTimeFormat (available in Deno, Node, and browsers) to resolve the
// wall-clock day-of-week and time in the target timezone without any date lib.
//
// schedule = {
//   timezone: 'America/New_York',       // IANA tz; defaults to 'UTC'
//   windows: [ { days: [1,2,3,4,5], start: '09:00', end: '17:00' } ],  // days 0=Sun..6=Sat
// }
// No schedule, or no windows, means "always on" (returns true).

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Returns { dow: 0-6, minutes: 0-1439 } for `nowMs` in the given IANA timezone.
export function wallClock(nowMs, timeZone = 'UTC') {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(new Date(nowMs));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dow = DOW[get('weekday')] ?? 0;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // some environments emit '24' at midnight
  const minute = parseInt(get('minute'), 10);
  return { dow, minutes: hour * 60 + minute };
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function isWithinSchedule(nowMs, schedule, fallbackTz) {
  if (!schedule || !Array.isArray(schedule.windows) || schedule.windows.length === 0) return true;
  const tz = schedule.timezone || fallbackTz || 'UTC';
  const { dow, minutes } = wallClock(nowMs, tz);
  return schedule.windows.some((w) => {
    const days = Array.isArray(w.days) ? w.days : null;
    if (days && !days.includes(dow)) return false;
    const start = toMinutes(w.start ?? '00:00');
    const end = toMinutes(w.end ?? '24:00');
    // Support overnight windows (end <= start means it wraps past midnight).
    if (end <= start) return minutes >= start || minutes < end;
    return minutes >= start && minutes < end;
  });
}
