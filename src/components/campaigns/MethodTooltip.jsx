import React from 'react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

// A small info affordance that shows a method explainer in a bg-popover card.
// Used next to every routing-method option (campaign level and group level).
// No em dashes. Semantic tokens only.
export default function MethodTooltip({ text, className = '' }) {
  if (!text) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`text-muted-foreground hover:text-foreground transition-colors ${className}`}
            aria-label="Method explanation"
            onClick={(e) => e.preventDefault()}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-popover border-border text-popover-foreground text-[12px] leading-relaxed p-3"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}