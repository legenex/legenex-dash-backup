import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { LayoutDashboard, Target, Sparkles, Wand2 } from 'lucide-react';
import SubNavShell from '@/components/layout/SubNavShell';
import { platformsFrom } from '@/lib/adManagerMetrics';

const ITEMS = [
  { label: 'Performance Dashboard', path: '/ad-manager', icon: LayoutDashboard },
  { label: 'Ad Reports', path: '/ad-manager/reports', icon: Target },
  { label: 'Creative Analyzer', path: '/ad-manager/creative-analyzer', icon: Sparkles },
  { label: 'Ad Builder', path: '/ad-manager/builder', icon: Wand2, soon: true },
];

// Left sub-sidebar for the Ad Manager section. Matches the Operations and
// Finances sub-menus exactly. The platform list underneath is driven by real
// AdSpendMapping records, so a platform reads as connected only when it is.
export default function AdManagerNav() {
  const location = useLocation();

  const { data: mappings = [] } = useQuery({
    queryKey: ['adspend-mappings'],
    queryFn: () => base44.entities.AdSpendMapping.list(),
  });

  const platforms = platformsFrom(mappings, []);
  const connectedCount = platforms.filter((p) => p.connected).length;

  const railItems = ITEMS.map(item => ({ label: item.label, icon: item.icon, to: item.path, active: location.pathname === item.path }));

  return (
    <SubNavShell items={railItems} title="Ad Manager">
      <div className="space-y-0.5">
        {ITEMS.map((item) => {
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
              <span className="flex-1 truncate">{item.label}</span>
              {item.soon && <span className="text-[8px] px-1 py-px rounded bg-muted text-muted-foreground/70">SOON</span>}
            </Link>
          );
        })}
      </div>

      <div className="text-[9.5px] font-semibold tracking-[0.14em] uppercase text-muted-foreground/70 px-3 pt-5 pb-2">Platforms</div>
      <div className="space-y-0.5">
        {platforms.map((p) => (
          <div key={p.id} className="w-full flex items-center gap-2.5 px-3 h-8 rounded-md text-[11.5px] text-muted-foreground">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.connected ? 'bg-current status-sold' : 'bg-muted-foreground/40'}`} />
            <span className="flex-1 truncate">{p.label}</span>
            <span className="text-[9.5px] text-muted-foreground/60">{p.connected ? 'connected' : 'not connected'}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-3">
        <div className="text-[10px] font-semibold text-foreground">
          {mappings.length} {mappings.length === 1 ? 'account mapped' : 'accounts mapped'}
        </div>
        <div className="text-[10px] mt-0.5 leading-relaxed text-muted-foreground/70">
          {connectedCount} {connectedCount === 1 ? 'platform' : 'platforms'} connected. Map accounts in Settings Integrations.
        </div>
      </div>
    </SubNavShell>
  );
}