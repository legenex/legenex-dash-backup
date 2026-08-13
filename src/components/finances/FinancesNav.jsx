import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { LayoutDashboard, Landmark, FileText, CreditCard, Wallet, Megaphone, TrendingUp, Settings2 } from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import SubNavShell from '@/components/layout/SubNavShell';

const ITEMS = [
  { label: 'Overview', tab: 'overview', icon: LayoutDashboard },
  { label: 'Profitability', tab: 'profit', icon: TrendingUp, perm: 'bank_feed' },
  { label: 'Bank Feed', tab: 'bank', icon: Landmark, perm: 'bank_feed' },
  { label: 'Invoices', tab: 'invoices', icon: FileText },
  { label: 'Buyer Payments', tab: 'payments', icon: CreditCard },
  { label: 'Supplier Payouts', tab: 'payouts', icon: Wallet },
  { label: 'Ad Spend', tab: 'adspend', icon: Megaphone },
  { label: 'Settings', tab: 'settings', icon: Settings2 },
];

// Left sub-sidebar for the Finances section. Drives the ?tab= query param.
export default function FinancesNav() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const active = params.get('tab') || 'overview';

  const { data: mercuryCfg } = useQuery({
    queryKey: ['mercury-config'],
    queryFn: async () => (await base44.entities.IntegrationConfig.filter({ name: 'mercury' }))[0] || null,
  });
  const mercuryConnected = !!mercuryCfg;

  const railItems = ITEMS
    .filter(item => !item.perm || can(item.perm))
    .map(item => ({ label: item.label, icon: item.icon, to: `/finances?tab=${item.tab}`, active: active === item.tab }));

  return (
    <SubNavShell items={railItems} title="Finances">
      <div className="space-y-0.5">
        {ITEMS.filter(item => !item.perm || can(item.perm)).map(item => {
          const isActive = active === item.tab;
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              onClick={() => setParams({ tab: item.tab }, { replace: true })}
              style={isActive ? { boxShadow: 'inset 2px 0 0 hsl(var(--primary))' } : undefined}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/70'}`} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${mercuryConnected ? 'bg-current status-sold' : 'bg-primary'}`} />
          <span className="text-[11.5px] font-semibold text-foreground">Mercury</span>
        </div>
        <div className={`text-[10.5px] mt-1 ${mercuryConnected ? 'status-sold' : 'text-primary'}`}>
          {mercuryConnected ? 'connected' : 'bank truth unavailable'}
        </div>
      </div>
    </SubNavShell>
  );
}