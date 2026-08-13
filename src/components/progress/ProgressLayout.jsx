import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, ExternalLink, ShieldAlert } from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import { PROGRESS_NAV } from './progressNav';
import { isProgressHost } from '@/lib/hostScope';
import ProgressErrorBoundary from './ProgressErrorBoundary';

// Shell for the Progress Control Center.
//
// Navigation is horizontal, not a sidebar. This is a review tool: the thing being
// reviewed is a 1920px wide screenshot, so horizontal space is the scarce
// resource and vertical space is cheap. A nav column, even collapsed to icons,
// was taking width from the only part of the screen that matters.
//
// On the dashboard host there is no chrome here at all, because the operator
// sidebar already carries a Progress section. The top bar appears only on the
// progress subdomain, where nothing else provides navigation.

function TopNav({ items }) {
  const location = useLocation();
  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.to === '/progress'
          ? location.pathname === '/progress'
          : location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.key}
            to={item.to}
            title={item.description}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              active
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function DrawerNav({ items, onNavigate }) {
  const location = useLocation();
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.to === '/progress'
          ? location.pathname === '/progress'
          : location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.key}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-start gap-2.5 rounded-md px-3 py-2 transition-colors ${
              active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
              <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
                {item.description}
              </span>
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function ProgressLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { can } = usePermissions();
  const location = useLocation();

  const items = PROGRESS_NAV.filter((i) => i.built && (!i.permKey || can(i.permKey)));

  // A user who reached a progress route without any progress key at all sees an
  // explicit notice rather than an empty shell.
  if (items.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <ShieldAlert className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-[15px] font-semibold text-foreground">No progress access</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Your account does not have any Progress Control Center permission. Ask an administrator
            to grant progress access under Settings, Users and Roles.
          </p>
        </div>
      </div>
    );
  }

  // On the dashboard host the operator sidebar already lists these nine surfaces,
  // so navigation here would be a duplicate menu eating the width.
  const ownNav = isProgressHost(typeof window !== 'undefined' ? window.location.hostname : '');

  if (!ownNav) {
    return (
      <div className="min-w-0">
        <ProgressErrorBoundary key={location.pathname}>
          <Outlet />
        </ProgressErrorBoundary>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>

          <span className="shrink-0 text-[12px] font-semibold text-foreground">Progress</span>

          <div className="hidden min-w-0 flex-1 lg:block">
            <TopNav items={items} />
          </div>

          <a
            href="https://dashboard.legenex.com/"
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </a>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-background/80"
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-[13px] font-semibold text-foreground">Progress Control Center</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DrawerNav items={items} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 p-3 lg:p-4">
        {/* Keyed on pathname so navigating away from a broken surface clears the
            error instead of trapping the shell in it. */}
        <ProgressErrorBoundary key={location.pathname}>
          <Outlet />
        </ProgressErrorBoundary>
      </main>
    </div>
  );
}
