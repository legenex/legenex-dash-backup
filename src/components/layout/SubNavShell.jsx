import React from 'react';
import { Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useResizableWidth } from '@/hooks/useResizableWidth';
import { useCollapsible } from '@/hooks/useCollapsible';
import ResizeHandle from './ResizeHandle';
import SubNavRail from './SubNavRail';

// A single icon in the desktop collapsed rail. Supports both link items (to)
// and callback items (onClick), with the label shown as a hover flyout.
function CollapsedIcon({ item }) {
  const Icon = item.icon;
  const inner = (
    <>
      {item.active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
      {Icon ? <Icon className="w-[18px] h-[18px]" /> : <span className="text-[11px] font-semibold">{(item.label || '?').slice(0, 2)}</span>}
    </>
  );
  const cls = `relative w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
    item.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
  }`;
  return (
    <div className="relative group/subrail w-full flex justify-center">
      {item.to ? (
        <Link to={item.to} aria-label={item.label} className={cls}>{inner}</Link>
      ) : (
        <button type="button" onClick={item.onClick} aria-label={item.label} className={cls}>{inner}</button>
      )}
      {/* Label flyout on hover/focus */}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 opacity-0 transition-opacity duration-150 group-hover/subrail:opacity-100 group-focus-within/subrail:opacity-100">
        <div className="whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-[12px] font-medium text-foreground shadow-lg">
          {item.label}
        </div>
      </div>
    </div>
  );
}

// Wraps a section sub-navigation column and makes it horizontally resizable
// and collapsible. The collapsed preference is remembered across pages and
// page refreshes.
//
// Congruency contract for every section:
//   - `title` renders one canonical section label at the top of the column
//     (same markup everywhere). Pass it from each section's nav.
//   - The collapse / expand toggle is pinned at the BOTTOM of the column so it
//     lines up with the main sidebar collapse toggle.
//
// At lg and up: renders the resizable vertical column. When collapsed, the
// column shrinks to a thin rail with the expand button pinned at the bottom.
// Below lg: renders no column and no ResizeHandle. Instead, when the nav passes
// an `items` array, it renders a horizontal scrolling rail (SubNavRail).
export default function SubNavShell({ children, items, title }) {
  // One shared width for every section's sub-nav, like the main sidebar,
  // it stays constant across all pages (ignores any per-section key).
  const { width, startResize } = useResizableWidth({
    storageKey: 'legenex_subnav_width',
    defaultWidth: 224, // matches the previous w-56
    min: 176,
    max: 340,
  });

  const { collapsed, toggle } = useCollapsible({ storageKey: 'legenex_subnav_collapsed' });

  return (
    <>
      {/* Mobile rail: below lg only */}
      {items && <SubNavRail items={items} />}

      {/* Desktop collapsed rail: lg and up only. Shows an icon for each item,
          with the expand button pinned at the bottom to match the main sidebar. */}
      {collapsed && (
        <div className="hidden lg:flex flex-col shrink-0 border-r border-border px-1 pt-2 h-full items-center w-[56px]">
          <div className="flex-1 min-h-0 w-full flex flex-col items-center gap-0.5 overflow-y-auto no-scrollbar">
            {items && items.length > 0 && items.map((item, i) => <CollapsedIcon key={item.to || item.label || i} item={item} />)}
          </div>
          <div className="shrink-0 w-full flex justify-center py-3 border-t border-border">
            <button
              onClick={toggle}
              aria-label="Expand menu"
              title="Expand menu"
              className="w-8 h-8 flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop vertical column: lg and up only */}
      {!collapsed && (
        <nav
          data-resize-origin
          className="hidden lg:flex flex-col relative shrink-0 border-r border-border pr-2 h-full"
          style={{ width: `${width}px` }}
        >
          {/* Canonical section title, identical markup for every section. */}
          {title && (
            <div className="shrink-0 text-[9.5px] font-semibold tracking-[0.14em] uppercase text-muted-foreground/70 px-3 pt-2 pb-2">
              {title}
            </div>
          )}

          {/* Scrollable body: the section's own items and cards. */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
            {children}
          </div>

          {/* Collapse control pinned at the bottom, in line with the main
              sidebar collapse control. */}
          <div className="shrink-0 flex justify-end py-3 border-t border-border">
            <button
              onClick={toggle}
              aria-label="Collapse menu"
              title="Collapse menu"
              className="w-8 h-8 flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <ResizeHandle onMouseDown={startResize} title="Drag to resize menu" />
        </nav>
      )}
    </>
  );
}