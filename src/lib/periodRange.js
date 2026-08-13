// Shared period definitions + window resolver for the dashboards.
import {
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears,
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

// All dashboard date bucketing is computed in the app's operating timezone so
// leads are attributed to the correct calendar day regardless of import time.
// America/Regina is the canonical IANA id for Saskatchewan time (UTC-6, no DST).
// 'America/Saskatchewan' is NOT a valid Intl zone and makes date-fns-tz return
// Invalid Date for every boundary, so we must use America/Regina here.
export const APP_TZ = 'America/Regina';

// Compute a day boundary in APP_TZ and return it as a UTC instant.
// `fn` is a date-fns boundary helper (startOfDay/endOfDay/startOfMonth/...).
// If zone conversion yields an Invalid Date, fall back to applying the boundary
// to the original date so resolvePeriod can never return an Invalid Date.
const zoned = (date, fn) => {
  const converted = fromZonedTime(fn(toZonedTime(date, APP_TZ)), APP_TZ);
  return isNaN(converted.getTime()) ? fn(date) : converted;
};

export const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last60', label: 'Last 60' },
  { value: 'custom', label: 'Custom' },
];

// Resolve a period value (+ optional custom {from,to}) into a { start, end } window.
export function resolvePeriod(value, custom) {
  // "now" in APP_TZ so day boundaries land on the correct local calendar day.
  const now = new Date();
  switch (value) {
    case 'today':
      return { start: zoned(now, startOfDay), end: zoned(now, endOfDay) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { start: zoned(y, startOfDay), end: zoned(y, endOfDay) };
    }
    case 'last7':
      return { start: zoned(subDays(now, 6), startOfDay), end: zoned(now, endOfDay) };
    case 'this_month':
      return { start: zoned(now, startOfMonth), end: zoned(now, endOfDay) };
    case 'last_month': {
      const lm = subMonths(now, 1);
      return { start: zoned(lm, startOfMonth), end: zoned(lm, endOfMonth) };
    }
    case 'last60':
      return { start: zoned(subDays(now, 59), startOfDay), end: zoned(now, endOfDay) };
    case 'last_year': {
      const ly = subYears(now, 1);
      return { start: zoned(ly, startOfYear), end: zoned(ly, endOfYear) };
    }
    case 'custom':
      return {
        start: custom?.from ? zoned(new Date(custom.from), startOfDay) : zoned(subDays(now, 29), startOfDay),
        end: custom?.to ? zoned(new Date(custom.to), endOfDay) : zoned(now, endOfDay),
      };
    default:
      return { start: zoned(now, startOfMonth), end: zoned(now, endOfDay) };
  }
}

// Prior window of equal length immediately before the given window (for trend %).
export function priorWindow({ start, end }) {
  const len = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - len), end: new Date(start.getTime()) };
}

export const PERIOD_LABELS = PERIODS.reduce((m, p) => { m[p.value] = p.label; return m; }, {});

// The standardized preset set used by every Finance + Report date filter.
export const STANDARD_PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom' },
];