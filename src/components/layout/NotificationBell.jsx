import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, AlertTriangle, AlertCircle, TriangleAlert, CheckCircle2 } from 'lucide-react';

// Notification bell shown in the sidebar bottom-left, next to the system clock.
// Shows a red badge when there are unresolved system alerts (ErrorLog entries).
// Opens a scrollable popup listing recent errors by severity.
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: errors = [] } = useQuery({
    queryKey: ['notification-bell-errors'],
    queryFn: () => base44.entities.ErrorLog.filter({ resolved: false }, '-created_date', 50),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const count = errors.length;

  const resolveAll = async () => {
    for (const e of errors) {
      await base44.entities.ErrorLog.update(e.id, { resolved: true });
    }
    qc.invalidateQueries({ queryKey: ['notification-bell-errors'] });
    qc.invalidateQueries({ queryKey: ['layout-error-count'] });
  };

  const severityIcon = (sev) => {
    if (sev === 'critical') return <TriangleAlert className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />;
    if (sev === 'warning') return <AlertTriangle className="w-3.5 h-3.5 text-status-unsold shrink-0 mt-0.5" />;
    return <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />;
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="System notifications"
          className="relative w-8 h-8 flex items-center justify-center rounded-md border border-sidebar-border text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-150 shrink-0"
        >
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-none">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-0" collisionPadding={8}>
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold text-foreground">System Alerts</div>
            <div className="text-[11px] text-muted-foreground">{count} unresolved {count === 1 ? 'alert' : 'alerts'}</div>
          </div>
          {count > 0 && (
            <button
              onClick={resolveAll}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {errors.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-status-sold" />
              No system alerts
            </div>
          ) : (
            errors.map(e => (
              <div key={e.id} className="px-3 py-2 border-b border-border last:border-b-0 hover:bg-accent/40 transition-colors">
                <div className="flex items-start gap-2">
                  {severityIcon(e.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-foreground break-words">{e.message}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{e.stage}</span>
                      {e.supplier_name && <span className="text-[10px] text-muted-foreground truncate">· {e.supplier_name}</span>}
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{timeAgo(e.created_date)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}