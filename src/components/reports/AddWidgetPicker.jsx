import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarChart3, Layers, Table2 } from 'lucide-react';

const WIDGET_OPTIONS = [
  { type: 'rev_spend_profit', label: 'Revenue vs Spend vs Profit', icon: BarChart3 },
  { type: 'status_donut', label: 'Leads by Status', icon: Layers },
  { type: 'campaigns', label: 'Top Campaigns', icon: Table2 },
  { type: 'states', label: 'State Performance', icon: Table2 },
  { type: 'buyers', label: 'Buyers Performance', icon: Table2 },
  { type: 'suppliers', label: 'Suppliers Performance', icon: Table2 },
  { type: 'daily_metrics', label: 'Daily Metrics', icon: Table2 },
  { type: 'utm_source', label: 'UTM Source', icon: Table2 },
  { type: 'buyer_feedback', label: 'Buyer Feedback', icon: Table2 },
  { type: 'injury_type', label: 'Injury Type', icon: Table2 },
  { type: 'accident_date', label: 'Accident Date', icon: Table2 },
  { type: 'treatment_time', label: 'Treatment Time', icon: Table2 },
  { type: 'phone_verification', label: 'Phone Verification', icon: Table2 },
];

export default function AddWidgetPicker({ open, onOpenChange, onPick }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[520px]">
        <DialogHeader><DialogTitle>Add Widget</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
          {WIDGET_OPTIONS.map(o => {
            const Icon = o.icon;
            return (
              <button key={o.type} onClick={() => { onPick(o.type); onOpenChange(false); }}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors text-left">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                <span className="text-[13px] text-foreground">{o.label}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { WIDGET_OPTIONS };