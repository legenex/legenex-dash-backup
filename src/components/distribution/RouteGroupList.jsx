import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, GitBranch, Users } from 'lucide-react';
import { LifecycleBadge, METHODS } from '@/components/distribution/RouteGroupEditor';

const methodLabel = (m) => METHODS.find((x) => x.value === m)?.label || m || 'priority';

// Left rail: route groups bucketed under their campaign. Selecting a group
// surfaces it in the editor pane.
export default function RouteGroupList({ groups, campaignName, memberCounts, selectedId, onSelect, loading }) {
  const byCampaign = useMemo(() => {
    const map = new Map();
    for (const g of groups) {
      const key = g.campaign_id || '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(g);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    }
    return Array.from(map.entries());
  }, [groups]);

  if (loading) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-10 text-center text-[13px] text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading route groups...
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-8 text-center">
        <GitBranch className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <div className="text-[13px] font-medium text-foreground">No route groups yet</div>
        <div className="text-[12px] text-muted-foreground mt-1">Create a draft route group to start configuring lead distribution.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {byCampaign.map(([campaignId, list]) => (
        <div key={campaignId}>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1 truncate">
            {campaignId === '__none__' ? 'No campaign' : (campaignName[campaignId] || campaignId)}
          </div>
          <div className="space-y-1.5">
            {list.map((g) => {
              const active = g.id === selectedId;
              const count = memberCounts[g.id] ?? 0;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onSelect(g.id)}
                  aria-pressed={active}
                  className={`w-full text-left rounded-[10px] border p-3 transition-colors ${
                    active ? 'border-primary/50 bg-primary/10' : 'border-border bg-card hover:bg-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-foreground truncate">{g.name || 'Untitled group'}</span>
                    <LifecycleBadge lifecycle={g.lifecycle} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{methodLabel(g.method)}</Badge>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Users className="w-3 h-3" /> {count} member{count === 1 ? '' : 's'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {g.published_at ? `Published ${new Date(g.published_at).toLocaleDateString()}` : 'Draft'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
