import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Summary banner shown when one or more active suppliers have no notification
// channel. Hidden entirely when every active supplier has a channel.
export default function NoChannelBanner({ count }) {
  if (!count) return null;
  const plural = count === 1 ? 'supplier' : 'suppliers';
  const verb = count === 1 ? 'has' : 'have';
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-primary/40 bg-primary/10 px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="text-[13px]">
        <span className="font-semibold text-primary">{count} active {plural}</span>
        <span className="text-foreground"> {verb} no notification channel.</span>
        <span className="text-muted-foreground"> They cannot be told when a state closes, so they will keep sending leads into a state that has already closed.</span>
      </div>
    </div>
  );
}