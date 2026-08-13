import React from 'react';
import { channelHealth } from './supplierListModel';

// Status dot summarising notification health for a supplier. The accent case is
// deliberately loud: an active supplier with no channel will keep sending leads
// into a state that has closed, because nothing can tell them it closed.
export default function SupplierChannelsCell({ supplier, onFix }) {
  const health = channelHealth(supplier);

  if (health === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-status-sold status-sold" />
        Reachable
      </span>
    );
  }

  if (health === 'muted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-status-unsold status-unsold" />
        Muted
      </span>
    );
  }

  if (health === 'none') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px]">
        <span className="w-2 h-2 rounded-full bg-primary" />
        <span className="text-primary font-medium">No channel</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onFix && onFix(supplier); }}
          className="text-[11px] underline text-primary/80 hover:text-primary"
        >
          Fix
        </button>
      </span>
    );
  }

  return <span className="text-[12px] text-muted-foreground">-</span>;
}