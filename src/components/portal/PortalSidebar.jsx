import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, BarChart3 } from 'lucide-react';
import { usePortalScope } from '@/hooks/usePortalScope';
import SidebarProfile from '@/components/layout/SidebarProfile';

const ITEMS = [
  { label: 'Overview', path: '/portal', icon: LayoutDashboard },
  { label: 'Leads', path: '/portal/leads', icon: FileText },
  { label: 'Reports', path: '/portal/reports', icon: BarChart3 },
];

// Minimal left sidebar for the buyer portal. Preserves ?buyer_id= when previewing.
export default function PortalSidebar() {
  const location = useLocation();
  const { previewBuyerId } = usePortalScope();
  const suffix = previewBuyerId ? `?buyer_id=${encodeURIComponent(previewBuyerId)}` : '';

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[248px] bg-sidebar flex flex-col border-r border-sidebar-border z-50"
      style={{ borderTopRightRadius: '16px', borderBottomRightRadius: '16px' }}>
      <div className="flex items-center px-5 py-6">
        <img src="https://media.base44.com/images/public/6a363ed8bf1b77641238d41d/f9cc21785_LogoWideLightClear.png" alt="Legenex" className="h-10 w-auto max-w-full object-contain" />
      </div>
      <div className="px-5 -mt-3 mb-2">
        <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">Buyer Portal</span>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 mt-2 overflow-y-auto">
        {ITEMS.map(item => {
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={`${item.path}${suffix}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative
                ${active ? 'bg-primary/10 text-foreground' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
            >
              {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
              <Icon className={`w-[18px] h-[18px] ${active ? 'text-primary' : ''}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        <SidebarProfile />
        <div className="text-[11px] text-muted-foreground text-center">v1.0.0</div>
      </div>
    </aside>
  );
}