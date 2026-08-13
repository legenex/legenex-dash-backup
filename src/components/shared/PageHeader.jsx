import React from 'react';

export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-0 mb-6">
      <div>
        <h1 className="text-[19px] sm:text-[22px] font-bold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">{children}</div>}
    </div>
  );
}