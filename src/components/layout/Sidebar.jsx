import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePermissions } from '@/lib/AuthContext';
import { useTheme } from '@/lib/theme';
import {
  ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import ViewAsSwitcher from './ViewAsSwitcher';
import SidebarProfile from './SidebarProfile';
import { useSidebarWidth } from '@/hooks/useSidebarWidth';
import { useCollapsible } from '@/hooks/useCollapsible';
import ResizeHandle from './ResizeHandle';
import SystemClock from './SystemClock';
import NotificationBell from './NotificationBell';
import { navGroups, filterNav } from './navConfig';

const COLLAPSED_WIDTH = 68;

// A flat list of {label, icon, to, comingSoon} leaf entries for a group,
// recursing into nested dropdowns (e.g. Campaigns) so the collapsed flyout
// shows every reachable destination with its own icon.
function flattenLeaves(children = []) {
  const out = [];
  for (const c of children) {
    if (c.children && c.children.length > 0) {
      out.push(...flattenLeaves(c.children));
    } else {
      out.push({
        label: c.label,
        icon: c.icon,
        to: c.tab ? `${c.path}?tab=${c.tab}` : c.path,
        comingSoon: c.comingSoon,
      });
    }
  }
  return out;
}

// A single collapsed-rail icon with a hover/focus flyout listing its children.
function CollapsedItem({ group, highlight, target, location, navigate }) {
  const Icon = group.icon;
  const leaves = group.type === 'single' ? [] : flattenLeaves(group.children);

  return (
    <div className="relative group/rail w-full flex justify-center">
      <button
        onClick={() => navigate(target)}
        aria-label={group.label}
        className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150
          ${highlight ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
      >
        {highlight && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
        <Icon className="w-[18px] h-[18px]" />
      </button>

      {/* Flyout: appears on hover/focus. Groups with children list them; single links just show a label. */}
      <div className="pointer-events-none absolute left-full top-0 ml-2 z-50 opacity-0 translate-x-[-4px] transition-all duration-150 group-hover/rail:opacity-100 group-hover/rail:translate-x-0 group-hover/rail:pointer-events-auto group-focus-within/rail:opacity-100 group-focus-within/rail:translate-x-0 group-focus-within/rail:pointer-events-auto">
        <div className="min-w-[200px] rounded-lg border border-sidebar-border bg-popover shadow-xl p-1.5">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
          {leaves.length === 0 ? null : (
            <div className="space-y-0.5">
              {leaves.map(leaf => {
                const LeafIcon = leaf.icon;
                if (leaf.comingSoon) {
                  return (
                    <div key={leaf.label} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-muted-foreground/60 cursor-not-allowed">
                      {LeafIcon && <LeafIcon className="w-4 h-4 shrink-0" />}
                      <span className="flex-1">{leaf.label}</span>
                      <span className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-sidebar-border">Soon</span>
                    </div>
                  );
                }
                const active = location.pathname + location.search === leaf.to || (!leaf.to.includes('?') && location.pathname === leaf.to);
                return (
                  <Link
                    key={leaf.label}
                    to={leaf.to}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150
                      ${active ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
                  >
                    {LeafIcon && <LeafIcon className={`w-4 h-4 shrink-0 ${active ? 'text-primary' : ''}`} />}
                    <span className="flex-1">{leaf.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function isChildActive(location, child) {
  if (child.tab) {
    const params = new URLSearchParams(location.search);
    return location.pathname === child.path && params.get('tab') === child.tab;
  }
  if (child.path === '/') return location.pathname === '/';
  return location.pathname === child.path;
}

// Open groups are session-only, never persisted: every page refresh resets the
// sidebar menu groups to collapsed. They only expand on an explicit click and
// stay open until the next refresh. Groups never auto-expand from navigation.

// A single child row inside an expanded group. Either a leaf link (icon + label,
// with an optional "Soon" pill) or a nested dropdown (e.g. Campaigns) that opens
// its own grandchildren, each with its own icon.
function ChildRow({ child, location, navigate, openGroups, toggleGroup }) {
  const ChildIcon = child.icon;

  // Nested dropdown (has its own children, e.g. Campaigns under Lead Distribution)
  if (child.children && child.children.length > 0) {
    const isOpen = openGroups.includes(child.label);
    const grandActive = child.children.some(g => isChildActive(location, g));
    const parentActive = child.path ? location.pathname === child.path : false;
    const highlight = grandActive || parentActive;
    return (
      <div>
        <div className="flex items-center">
          <button
            onClick={() => {
              // Label only navigates; the chevron toggles the dropdown.
              if (child.path) navigate(child.tab ? `${child.path}?tab=${child.tab}` : child.path);
              else toggleGroup(child.label);
            }}
            className={`flex-1 flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150
              ${highlight ? 'text-primary' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
          >
            {ChildIcon && <ChildIcon className={`w-4 h-4 shrink-0 ${highlight ? 'text-primary' : ''}`} />}
            <span className="flex-1 text-left">{child.label}</span>
          </button>
          <button
            onClick={() => toggleGroup(child.label)}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            className={`shrink-0 mr-1.5 p-0.5 rounded border transition-all duration-150
              ${isOpen ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/60 border-sidebar-border text-sidebar-foreground hover:text-foreground hover:bg-accent'}`}
          >
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>
        {isOpen && (
          <div className="ml-3.5 pl-3 border-l border-sidebar-border space-y-0.5 mt-0.5 mb-1">
            {child.children.map(g => (
              <ChildRow
                key={g.label}
                child={g}
                location={location}
                navigate={navigate}
                openGroups={openGroups}
                toggleGroup={toggleGroup}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Coming-soon leaf: shown but not navigable
  if (child.comingSoon) {
    return (
      <div
        title="Coming soon"
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-muted-foreground/60 cursor-not-allowed"
      >
        {ChildIcon && <ChildIcon className="w-4 h-4 shrink-0" />}
        <span className="flex-1 text-left">{child.label}</span>
        <span className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-sidebar-border">Soon</span>
      </div>
    );
  }

  // Leaf link
  const active = isChildActive(location, child);
  const to = child.tab ? `${child.path}?tab=${child.tab}` : child.path;
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150
        ${active ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
    >
      {ChildIcon && <ChildIcon className={`w-4 h-4 shrink-0 ${active ? 'text-primary' : ''}`} />}
      <span className="flex-1 text-left">{child.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const logoSrc = isDark
    ? 'https://media.base44.com/images/public/6a363ed8bf1b77641238d41d/f9cc21785_LogoWideLightClear.png'
    : 'https://media.base44.com/images/public/6a4957e7b03e9b10c170d29e/9eecce577_Logo-Wide-Dark-Clear.png';
  // Collapsed rail uses the square favicon mark: FaviconLight (red arrow) on the
  // dark theme, FaviconDark (navy bubble) on the light theme.
  const faviconSrc = isDark
    ? 'https://media.base44.com/images/public/6a4957e7b03e9b10c170d29e/b1c1f3a2d_FaviconLight.png'
    : 'https://media.base44.com/images/public/6a4957e7b03e9b10c170d29e/1ba6269e4_FaviconDark.png';
  const groups = filterNav(navGroups, can);
  const { width, startResize } = useSidebarWidth();
  const { collapsed, toggle } = useCollapsible({ storageKey: 'legenex_sidebar_collapsed' });
  const [openGroups, setOpenGroups] = useState([]);

  // Keep AppLayout's content margin in sync: collapsed uses the icon-rail width,
  // expanded uses the resizable width. Runs whenever either value changes.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--sidebar-width', `${collapsed ? COLLAPSED_WIDTH : width}px`);
    }
  }, [collapsed, width]);

  const toggleGroup = (label) => {
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  };

  // Collapsed: icon-only rail. Groups navigate to their path or first child.
  if (collapsed) {
    return (
      <aside className="fixed left-0 top-0 bottom-0 bg-sidebar flex flex-col items-center border-r border-sidebar-border z-50"
        style={{ width: `${COLLAPSED_WIDTH}px`, borderTopRightRadius: '16px', borderBottomRightRadius: '16px' }}>
        <Link to="/" className="flex items-center justify-center py-6">
          <img src={faviconSrc} alt="Legenex" className="h-8 w-8 object-contain" />
        </Link>
        <nav className="flex-1 px-2 space-y-1 mt-2 overflow-y-auto no-scrollbar w-full flex flex-col items-center">
          {groups.map(group => {
            const highlight = group.type === 'single'
              ? (group.path === '/' ? location.pathname === '/' : location.pathname === group.path)
              : (group.children.some(c => isChildActive(location, c)) || (group.path && location.pathname === group.path));
            const target = group.type === 'single'
              ? group.path
              : (group.path || (group.children[0]?.tab ? `${group.children[0].path}?tab=${group.children[0].tab}` : group.children[0]?.path));
            return (
              <CollapsedItem
                key={group.label}
                group={group}
                highlight={highlight}
                target={target}
                location={location}
                navigate={navigate}
              />
            );
          })}
        </nav>
        <div className="px-2 py-3 border-t border-sidebar-border w-full flex justify-center">
          <button
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-sidebar-border text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-150"
          >
            <PanelLeftOpen className="w-[18px] h-[18px]" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside data-resize-origin className="fixed left-0 top-0 bottom-0 bg-sidebar flex flex-col border-r border-sidebar-border z-50"
      style={{ width: `${width}px`, borderTopRightRadius: '16px', borderBottomRightRadius: '16px' }}>

      <div className="flex items-center pl-5 pr-3 py-6">
        <Link to="/" className="flex items-center min-w-0">
          <img src={logoSrc} alt="Legenex DashFlo" className="h-10 w-auto max-w-full object-contain" />
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 mt-2 overflow-y-auto">
        {groups.map(group => {
          const Icon = group.icon;

          if (group.type === 'single') {
            const isActive = group.path === '/' ? location.pathname === '/' : location.pathname === group.path;
            return (
              <Link
                key={group.label}
                to={group.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative
                  ${isActive ? 'bg-primary/10 text-foreground' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-primary' : ''}`} />
                {group.label}
              </Link>
            );
          }

          const isOpen = openGroups.includes(group.label);
          const hasActiveChild = group.children.some(c => isChildActive(location, c));
          const groupActive = group.path ? location.pathname === group.path : false;
          const highlight = hasActiveChild || groupActive;

          return (
            <div key={group.label}>
              <div className="flex items-center">
                <button
                  onClick={() => {
                    // Group label only navigates, never auto-expands. The dropdown
                    // opens exclusively via the chevron button beside it.
                    if (group.path) navigate(group.path);
                    else toggleGroup(group.label);
                  }}
                  className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative
                    ${highlight ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
                >
                  {highlight && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
                  <Icon className={`w-[18px] h-[18px] ${highlight ? 'text-primary' : ''}`} />
                  <span className="flex-1 text-left">{group.label}</span>
                </button>
                <button
                  onClick={() => toggleGroup(group.label)}
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                  className={`shrink-0 mr-1.5 p-1 rounded-md border transition-all duration-150
                    ${isOpen ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/60 border-sidebar-border text-sidebar-foreground hover:text-foreground hover:bg-accent'}`}
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
              {isOpen && (
                <div className="ml-4 pl-3 border-l border-sidebar-border space-y-0.5 mt-0.5 mb-1">
                  {group.children.map(child => (
                    <ChildRow
                      key={child.label}
                      child={child}
                      location={location}
                      navigate={navigate}
                      openGroups={openGroups}
                      toggleGroup={toggleGroup}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        <button
          onClick={() => {
            const labels = groups.filter(g => g.type === 'dropdown').map(g => g.label);
            const allOpen = labels.length > 0 && labels.every(l => openGroups.includes(l));
            setOpenGroups(allOpen ? [] : labels);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-150 border border-sidebar-border"
        >
          {(() => {
            const labels = groups.filter(g => g.type === 'dropdown').map(g => g.label);
            const allOpen = labels.length > 0 && labels.every(l => openGroups.includes(l));
            return allOpen ? (
              <><ChevronsDownUp className="w-3.5 h-3.5" /> Collapse All</>
            ) : (
              <><ChevronsUpDown className="w-3.5 h-3.5" /> Expand All</>
            );
          })()}
        </button>
        <ViewAsSwitcher />
        <SidebarProfile />
        <div className="flex items-center justify-between gap-2">
          <NotificationBell />
          <div className="flex-1 min-w-0"><SystemClock /></div>
          <button
            onClick={toggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md border border-sidebar-border text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-150"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Resize handle, grip fixed at the bottom of the sidebar edge */}
      <ResizeHandle onMouseDown={startResize} title="Drag to resize sidebar" />
    </aside>
  );
}