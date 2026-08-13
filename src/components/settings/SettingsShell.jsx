import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, RefreshCw } from 'lucide-react';
import { PulseDot } from '@/components/settings/settingsUi';
import { SectionHeaderSlot } from '@/components/layout/SectionShell';

// Shared Settings shell. Renders the header ("Settings / <PageName>" with a LIVE pill,
// Search + Refresh actions), a subtitle, the active panel, and a SETTINGS TELEMETRY
// footer bar with real values loaded once here.
export default function SettingsShell({ title, subtitle, children }) {
  const qc = useQueryClient();
  const [refreshedAt, setRefreshedAt] = useState(Date.now());
  const [nowTick, setNowTick] = useState(Date.now());

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list() });
  const { data: apiKeys = [] } = useQuery({ queryKey: ['api-keys'], queryFn: () => base44.entities.ApiKey.list('-created_date', 200) });
  const { data: integrations = [] } = useQuery({ queryKey: ['integration-configs'], queryFn: () => base44.entities.IntegrationConfig.list() });
  const { data: errors = [] } = useQuery({ queryKey: ['error-logs'], queryFn: () => base44.entities.ErrorLog.list('-created_date', 500) });

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const connectedCount = integrations.filter(i => i.connected || i.enabled || i.status === 'connected').length;
  const unresolvedCount = errors.filter(e => !e.resolved).length;
  const secsAgo = Math.max(0, Math.round((nowTick - refreshedAt) / 1000));

  const handleRefresh = () => {
    qc.invalidateQueries();
    setRefreshedAt(Date.now());
  };

  const Metric = ({ label, value, tone }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70">{label}</span>
      <span className={`text-[11px] font-mono font-semibold tabular-nums ${tone || 'text-foreground'}`}>{value}</span>
    </span>
  );

  return (
    <div className="flex flex-col min-h-full">
      {/* Header.

          Portalled into the shell's full-width header slot so the title sits
          ABOVE the sub-menu, matching Operations, Tools and Lead Distribution.
          It used to render inline here, which put it inside the content column
          and left it floating beside the sub-menu rather than above it. */}
      <SectionHeaderSlot>
        <div className="mb-5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-[17px] lg:text-[22px] font-bold tracking-tight truncate">
                <span className="text-muted-foreground font-medium hidden lg:inline">Settings / </span>
                <span className="text-foreground">{title}</span>
              </h1>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-status-sold px-2 py-0.5 text-[9.5px] font-semibold tracking-wider status-sold">
                <PulseDot /> LIVE
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button aria-label="Search settings" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 lg:px-2.5 h-8 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                <Search className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Search settings</span>
              </button>
              <button onClick={handleRefresh} aria-label="Refresh" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 lg:px-2.5 h-8 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Refresh</span>
              </button>
            </div>
          </div>
          {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
      </SectionHeaderSlot>

      {/* Panel content */}
      <div className="flex-1 min-h-0">{children}</div>

      {/* Telemetry footer */}
      <div className="mt-6 flex items-center gap-4 flex-wrap rounded-lg border border-border bg-card px-4 py-2.5">
        <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70">Settings Telemetry</span>
        <span className="inline-flex items-center gap-1.5">
          <PulseDot />
          <Metric label="Gateway" value="live" tone="status-sold" />
        </span>
        <Metric label="Users" value={users.length} />
        <Metric label="Integrations" value={`${connectedCount} connected`} />
        <Metric label="API Keys" value={apiKeys.length} />
        <Metric label="Errors" value={unresolvedCount} tone={unresolvedCount > 0 ? 'text-primary' : 'text-foreground'} />
        <span className="ml-auto text-[10.5px] text-muted-foreground/70 font-mono">refreshed {secsAgo}s ago</span>
      </div>
    </div>
  );
}