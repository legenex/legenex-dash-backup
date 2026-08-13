import React from 'react';
import { Plus, Gauge, CalendarDays, Scale, Target, CreditCard, Database } from 'lucide-react';
import SubNavShell from '@/components/layout/SubNavShell';

const STANDARD = [
  { key: 'performance_overview', label: 'Performance Overview', icon: Gauge },
  { key: 'daily', label: 'Daily Performance', icon: CalendarDays },
  { key: 'pnl', label: 'Profit & Loss', icon: Scale },
  { key: 'ad', label: 'Ad Performance', icon: Target },
  { key: 'buyer', label: 'Buyer Performance', icon: CreditCard },
  { key: 'supplier', label: 'Supplier Performance', icon: Database },
];

// Left sub-sidebar for the Reports report-builder.
export default function ReportSidebar({ active, onSelect, customReports = [], onNewReport }) {
  const Item = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => onSelect(id)}
      className={`w-full text-left px-3 py-1.5 rounded-md text-[13px] transition-colors flex items-center gap-2 ${
        active === id ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />}
      <span className="truncate">{label}</span>
    </button>
  );

  const railItems = STANDARD.map(s => ({
    label: s.label,
    icon: s.icon,
    active: active === `std:${s.key}`,
    onClick: () => onSelect(`std:${s.key}`),
  }));

  return (
    <SubNavShell items={railItems} title="Reports">
      <div className="space-y-0.5 mb-5">
        {STANDARD.map(s => <Item key={s.key} id={`std:${s.key}`} label={s.label} icon={s.icon} />)}
      </div>

      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">Custom</div>
      <div className="space-y-0.5">
        {customReports.map(r => <Item key={r.id} id={`custom:${r.id}`} label={r.name} />)}
        <button onClick={onNewReport} className="w-full text-left px-3 py-1.5 rounded-md text-[13px] text-primary hover:bg-accent/40 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Report
        </button>
      </div>
    </SubNavShell>
  );
}

export { STANDARD };