import React, { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, MonitorCog, Globe } from 'lucide-react';

const STORAGE_KEY = 'legenex_secondary_tz';

// Browser's IANA timezone, e.g. "Africa/Johannesburg".
function browserTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

// Full list of supported IANA timezones for the dropdown; falls back to a small
// set if the runtime does not expose supportedValuesOf.
function allTimezones() {
  try {
    const list = Intl.supportedValuesOf?.('timeZone');
    if (Array.isArray(list) && list.length) return list;
  } catch {}
  return ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Africa/Johannesburg', 'Asia/Dubai', 'Indian/Mauritius', 'Asia/Kolkata', 'Australia/Sydney'];
}

// Live system clock rendered in the app's operating timezone (America/Regina),
// plus a second time in a manually-selectable timezone (defaults to browser).
export default function SystemClock() {
  const [now, setNow] = useState(() => new Date());
  const [secondaryTz, setSecondaryTz] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || browserTz();
  });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const setTz = (tz) => {
    setSecondaryTz(tz);
    localStorage.setItem(STORAGE_KEY, tz);
  };

  const appTime = formatInTimeZone(now, APP_TZ, 'HH:mm');
  const appAbbr = formatInTimeZone(now, APP_TZ, 'zzz');
  const secTime = formatInTimeZone(now, secondaryTz, 'HH:mm');
  const secAbbr = formatInTimeZone(now, secondaryTz, 'zzz');

  const timezones = allTimezones();

  return (
    <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
      <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground tabular-nums">
        <MonitorCog className="w-3 h-3 text-muted-foreground shrink-0" />
        {appTime} {appAbbr}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums hover:text-foreground transition-colors">
            <Globe className="w-3 h-3 shrink-0" />
            {secTime} {secAbbr}
            <ChevronDown className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="max-h-64 overflow-y-auto w-56">
          {timezones.map((tz) => (
            <DropdownMenuItem
              key={tz}
              onClick={() => setTz(tz)}
              className={`text-[12px] cursor-pointer ${tz === secondaryTz ? 'text-primary font-medium' : ''}`}
            >
              {tz.replace(/_/g, ' ')}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}