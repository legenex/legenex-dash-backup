import React from 'react';
import { formatDistanceToNow } from 'date-fns';

export default function HealthStrip({ hlrProvider, lastLeadTime }) {
  return (
    <div className="bg-card border border-primary/20 rounded-[10px] p-4 flex items-center gap-6 flex-wrap">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${hlrProvider ? 'bg-[#3DD68C]' : 'bg-[#E5484D]'}`} />
        <span className="text-[12px] text-muted-foreground">HLR Provider</span>
        <span className="text-[12px] font-medium text-foreground">{hlrProvider || 'Not configured'}</span>
      </div>
      <div className="w-px h-5 bg-border" />
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#3DD68C]" />
        <span className="text-[12px] text-muted-foreground">Email Validation</span>
        <span className="text-[12px] font-medium text-foreground">Active</span>
      </div>
      {lastLeadTime && (
        <>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Last lead</span>
            <span className="text-[12px] font-medium text-foreground">{formatDistanceToNow(new Date(lastLeadTime), { addSuffix: true })}</span>
          </div>
        </>
      )}
    </div>
  );
}