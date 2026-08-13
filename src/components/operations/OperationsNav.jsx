import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Users, Factory, MapPin, ReceiptText, UserPlus, LayoutDashboard, Layers } from 'lucide-react';
import SubNavShell from '@/components/layout/SubNavShell';

const ITEMS = [
  { label: 'Dashboard', path: '/operations', icon: LayoutDashboard },
  { label: 'Verticals', path: '/operations/verticals', icon: Layers },
  { label: 'Buyers', path: '/operations/buyers', icon: Users },
  { label: 'Suppliers', path: '/operations/suppliers', icon: Factory },
  { label: 'Active States', path: '/operations/active-states', icon: MapPin },
  { label: 'Billing Reports', path: '/operations/billing-reports', icon: ReceiptText },
  { label: 'Buyer Onboarding', path: '/operations/buyer-onboarding', icon: UserPlus },
];

// Left sub-sidebar for the Operations section. Routes to each sub page.
export default function OperationsNav() {
  const location = useLocation();

  const railItems = ITEMS.map(item => ({ label: item.label, icon: item.icon, to: item.path, active: location.pathname === item.path }));

  return (
    <SubNavShell items={railItems} title="Operations">
      <div className="space-y-0.5">
        {ITEMS.map(item => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              style={isActive ? { boxShadow: 'inset 2px 0 0 hsl(var(--primary))' } : undefined}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/70'}`} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </SubNavShell>
  );
}