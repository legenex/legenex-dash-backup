import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import SupplierStatusPill from './SupplierStatusPill';
import SupplierChannelsCell from './SupplierChannelsCell';
import SupplierPayoutTab from './SupplierPayoutTab';
import SupplierSourcesTab from './SupplierSourcesTab';
import SupplierNotificationsTab from './SupplierNotificationsTab';

// Right side drawer for a single supplier. Sibling of BuyerDetailDrawer: header
// shows identity + status pill + channel health dot, body switches between
// Payout and Notifications tabs. UI only; all writes are scoped to the Supplier
// entity inside the tab components.
export default function SupplierDetailDrawer({ open, onOpenChange, supplier, initialTab = 'payout' }) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => { if (open) setTab(initialTab); }, [open, supplier?.id, initialTab]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0 bg-background">
        {supplier && (
          <>
            <div className="border-b border-border px-6 pt-6 pb-0">
              <div className="flex items-start gap-3 pr-8">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold text-foreground truncate">{supplier.name || 'Supplier'}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] text-muted-foreground">{supplier.supplier_type || 'Unclassified'}</span>
                    <span className="text-muted-foreground/40">|</span>
                    <SupplierChannelsCell supplier={supplier} onFix={() => setTab('notifications')} />
                  </div>
                </div>
                <div className="ml-auto shrink-0">
                  <SupplierStatusPill status={supplier.status} />
                </div>
              </div>
              <div className="flex gap-1 mt-4">
                {[
                  { key: 'payout', label: 'Payout' },
                  { key: 'sources', label: 'Sources' },
                  { key: 'notifications', label: 'Notifications' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-3.5 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
                      tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {tab === 'payout' && <SupplierPayoutTab supplier={supplier} />}
              {tab === 'sources' && <SupplierSourcesTab supplier={supplier} />}
              {tab === 'notifications' && <SupplierNotificationsTab supplier={supplier} />}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}