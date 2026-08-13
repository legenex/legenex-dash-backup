import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Calculator, ShieldCheck, FlaskConical, LayoutGrid } from 'lucide-react';
import SubNavShell from '@/components/layout/SubNavShell';
import { PulseDot } from '@/components/finances/financeUi';

const ITEMS = [
  { label: 'Dashboard', path: '/tools', icon: LayoutGrid },
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Calculated Fields', path: '/calculated-fields', icon: Calculator },
  { label: 'Verification', path: '/verification', icon: ShieldCheck },
  { label: 'Payload Tester', path: '/payload-tester', icon: FlaskConical },
];

// Left sub-sidebar for the Tools section.
export default function ToolsNav() {
  const location = useLocation();
  const jobsQueued = 0;

  const railItems = ITEMS.map(item => ({ label: item.label, icon: item.icon, to: item.path, active: location.pathname === item.path }));

  return (
    <SubNavShell items={railItems} title="Tools">
      <div className="flex flex-col h-full">
        <div className="space-y-0.5">
          {ITEMS.map(item => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 border-l-2 border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-4">
          <div className="rounded-lg bg-card border border-border p-3">
            <div className="flex items-center gap-2">
              <PulseDot />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Automation engine</span>
            </div>
            <div className="text-[12px] status-sold font-medium mt-1.5">
              Running - {jobsQueued} jobs queued
            </div>
          </div>
        </div>
      </div>
    </SubNavShell>
  );
}