import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import StatusPill from '@/components/shared/StatusPill';
import { getLeadErrorReason } from '@/utils/leadError';
import { AlertCircle, Clock, Copy } from 'lucide-react';

export default function ErrorStatusPill({ lead, errorLogEntry, onOpenDetail, size = 'sm' }) {
  const [open, setOpen] = useState(false);

  if (!lead) return <StatusPill status={undefined} size={size} />;

  // Queued status: show queue_reason in tooltip and popover
  if (lead.final_status === 'Queued') {
    const reason = lead.queue_reason || 'Queued for manual handling';
    return (
      <TooltipProvider delayDuration={150}>
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1 focus:outline-none">
                  <span className="inline-flex items-center rounded-full bg-status-queued status-queued px-2 py-0.5 text-[11px] font-semibold gap-1">
                    <Clock className="w-3 h-3" />
                    Queued
                  </span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-[11px]">
              {reason}
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="start" sideOffset={6} className="w-[300px] p-3 bg-popover border-border text-[12px]">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 status-queued shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">Queue reason</div>
                <div className="text-foreground break-words leading-relaxed">{reason}</div>
                {onOpenDetail && (
                  <button type="button" onClick={() => { setOpen(false); onOpenDetail(lead, 'summary'); }} className="mt-2 text-[11px] text-primary hover:underline">
                    Open details
                  </button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TooltipProvider>
    );
  }

  if (lead.final_status === 'Duplicate') {
    const reason = lead.queue_reason || 'Duplicate lead detected';
    return (
      <TooltipProvider delayDuration={150}>
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1 focus:outline-none">
                  <span className="inline-flex items-center rounded-full bg-status-duplicate status-duplicate px-2 py-0.5 text-[11px] font-semibold gap-1">
                    <Copy className="w-3 h-3" />
                    Duplicate
                  </span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-[11px]">
              {reason}
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="start" sideOffset={6} className="w-[300px] p-3 bg-popover border-border text-[12px]">
            <div className="flex items-start gap-2">
              <Copy className="w-4 h-4 mt-0.5 status-duplicate shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">Duplicate reason</div>
                <div className="text-foreground break-words leading-relaxed">{reason}</div>
                {onOpenDetail && (
                  <button type="button" onClick={() => { setOpen(false); onOpenDetail(lead, 'delivery'); }} className="mt-2 text-[11px] text-primary hover:underline">
                    Open details
                  </button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TooltipProvider>
    );
  }

  if (lead.final_status !== 'Error') {
    return <StatusPill status={lead.final_status} size={size} />;
  }

  const reason = getLeadErrorReason(lead, errorLogEntry);
  const stage = lead.error_stage || errorLogEntry?.stage || 'error';

  return (
    <TooltipProvider delayDuration={150}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 focus:outline-none">
                <span className="inline-flex items-center rounded-full bg-status-error status-error px-2 py-0.5 text-[11px] font-semibold gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Error
                </span>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-[11px]">
            {reason}
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="start" sideOffset={6} className="w-[300px] p-3 bg-popover border-border text-[12px]">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 status-error shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Failure reason · {stage}
              </div>
              <div className="text-foreground break-words leading-relaxed">{reason}</div>
              {onOpenDetail && (
                <button type="button" onClick={() => { setOpen(false); onOpenDetail(lead, stage); }} className="mt-2 text-[11px] text-primary hover:underline">
                  Open trace
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}