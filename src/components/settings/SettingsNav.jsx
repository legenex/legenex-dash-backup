import React, { useRef, useEffect } from 'react';
import { PulseDot } from '@/components/settings/settingsUi';

// Settings section navigation.
//
// At lg and up: the vertical 210px column (unchanged).
// Below lg: a single horizontal scrolling underline rail, mirroring the
// SubNavRail treatment used by every other section. The full vertical list
// must never stack above the panel on a phone, that pushes the actual settings
// content below the fold and is the regression this replaces.
export default function SettingsNav({ groups, active, onSelect }) {
  const activeRef = useRef(null);

  // Flatten both groups into one rail order for mobile.
  const flat = groups.flatMap(g => g.items);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);

  return (
    <>
      {/* Mobile rail: below lg only */}
      <div className="lg:hidden relative shrink-0 border-b border-border bg-background" style={{ height: '40px' }}>
        <div className="h-full flex items-stretch overflow-x-auto no-scrollbar">
          {flat.map(item => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                type="button"
                ref={isActive ? activeRef : undefined}
                onClick={() => onSelect(item.key)}
                className="relative flex items-center whitespace-nowrap text-[12px] px-2.5 font-medium transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className={isActive ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                {isActive && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-primary" />}
              </button>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute top-0 bottom-0 right-0"
          style={{ width: '28px', background: 'linear-gradient(to right, transparent, hsl(var(--background)))' }}
        />
      </div>

      {/* Desktop column: lg and up only */}
      <nav className="hidden lg:block w-[210px] shrink-0">
        <div className="flex flex-col h-full gap-5 sticky top-0">
          <div className="space-y-5">
            {groups.map(g => (
              <div key={g.group}>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">{g.group}</div>
                <div className="space-y-0.5">
                  {g.items.map(item => {
                    const isActive = active === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => onSelect(item.key)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground border-l-2 border-transparent'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Gateway status card */}
          <div className="mt-auto rounded-xl border border-border bg-card p-3">
            <div className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70 mb-1.5">Gateway</div>
            <div className="flex items-center gap-2">
              <PulseDot />
              <span className="text-[12px] font-mono status-sold">api.legenex.com - live</span>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
