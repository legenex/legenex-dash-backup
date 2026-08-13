import React from 'react';

// Bordered-panel section header: icon + title on the left, right-aligned meta chip.
export default function PanelSectionHeader({ icon: Icon, title, meta }) {
  return (
    <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
      <div className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4 text-primary" />} {title}
      </div>
      {meta != null && (
        <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 border border-border rounded-md px-2 py-0.5 whitespace-nowrap">
          {meta}
        </span>
      )}
    </div>
  );
}