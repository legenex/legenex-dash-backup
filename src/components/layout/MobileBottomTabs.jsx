import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, SlidersHorizontal, BarChart3 } from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';

const TABS = [
  { label: 'Overview', path: '/', icon: LayoutDashboard, permKey: 'overview' },
  { label: 'Leads', path: '/leads', icon: FileText, permKey: 'leads_all' },
  { label: 'Operations', path: '/operations', icon: SlidersHorizontal, permKey: 'operations' },
  { label: 'Reports', path: '/reports', icon: BarChart3, permKey: 'reports' },
];

// Sticky bottom tab bar, mobile only (hidden at lg and up). The drawer still
// holds every other section, so this is a fast-access rail for the four most
// used destinations. Tabs the user cannot open are never rendered.
export default function MobileBottomTabs() {
  const location = useLocation();
  const { can } = usePermissions();

  const visible = TABS.filter(t => can(t.permKey));
  if (visible.length === 0) return null;

  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex bg-card/95 backdrop-blur border-t border-border"
      style={{ height: 'calc(60px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {visible.map((t) => {
        const active = isActive(t.path);
        const Icon = t.icon;
        return (
          <Link
            key={t.path}
            to={t.path}
            className={`tap-target relative flex-1 flex flex-col items-center justify-center gap-1 ${active ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {active && <span className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />}
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}