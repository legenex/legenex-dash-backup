import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { sourceCodes } from './supplierListModel';

// Sources count with a hover popover listing the supplier's source_code values.
export default function SupplierSourcesCell({ supplier, sources }) {
  const codes = sourceCodes(supplier.id, sources);

  if (codes.length === 0) {
    return <span className="font-mono text-[12px] tabular-nums text-muted-foreground">0</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[12px] tabular-nums text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
        >
          {codes.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
          Source codes
        </div>
        <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
          {codes.map((code, i) => (
            <span key={`${code}-${i}`} className="font-mono text-[11px] text-foreground px-1 py-0.5">
              {code}
            </span>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}