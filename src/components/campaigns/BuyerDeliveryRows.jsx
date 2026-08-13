import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, ExternalLink } from 'lucide-react';

// Expanded detail strip under a buyer row: one line per Delivery, with that
// delivery's endpoints listed beneath it.
//
// Deliveries are BUYER-OWNED records (Delivery + SubDelivery), created and
// managed in Operations. This strip is a second door onto the same records so
// an operator arranging a campaign does not have to leave the page, never a
// duplicate editor. Anything created here writes to the buyer's own Delivery.
export default function BuyerDeliveryRows({ deliveries, subsByDelivery, onCreate, onOpen }) {
  const list = deliveries || [];

  return (
    <div className="px-6 py-3 space-y-2 bg-background/30 border-b border-border/60">
      {list.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">
          No deliveries yet. This buyer cannot receive leads until it has at least one active delivery.
        </div>
      ) : (
        list.map((d) => {
          const subs = subsByDelivery[d.id] || [];
          const activeSubs = subs.filter((s) => s.active !== false);
          const live = d.status === 'active';
          return (
            <div key={d.id} className="rounded-md border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="font-medium text-[12px] text-foreground min-w-[160px] truncate">
                  {d.name || <span className="text-muted-foreground">Unnamed delivery</span>}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium ${live ? 'status-sold' : 'text-muted-foreground'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-[hsl(var(--chart-5))]' : 'bg-muted-foreground'}`} />
                  {d.status || 'draft'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {activeSubs.length} of {subs.length} endpoint{subs.length === 1 ? '' : 's'} active
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); onOpen(d); }}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Manage
                </Button>
              </div>

              {subs.length > 0 && (
                <div className="mt-2 space-y-1">
                  {subs.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded border border-border/60 bg-background/60 px-2.5 py-1.5">
                      <span className="text-[11px] font-medium text-foreground min-w-[110px] truncate">
                        {s.name || 'Endpoint'}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono truncate flex-1 min-w-0">
                        {s.target_url || 'No URL set'}
                      </span>
                      {s.active === false && (
                        <span className="tag-neutral rounded px-1.5 py-0.5 text-[10px] shrink-0">Paused</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <Button size="sm" variant="outline" className="gap-1.5" onClick={(e) => { e.stopPropagation(); onCreate(); }}>
        <Plus className="w-3.5 h-3.5" /> Create delivery
      </Button>
    </div>
  );
}
