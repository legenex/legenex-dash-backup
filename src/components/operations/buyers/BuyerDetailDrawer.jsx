import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import BuyerStatusPill from './BuyerStatusPill';
import BuyerProfileTab from './BuyerProfileTab';
import BuyerCoverageTab from './BuyerCoverageTab';

// Right side drawer for a single buyer. Header shows identity + status pill,
// body switches between Profile and Coverage tabs. UI only; all writes are
// scoped to the Buyer and BuyerStateCpl entities inside the tab components.
export default function BuyerDetailDrawer({ open, onOpenChange, buyer, verticals, initialTab = 'profile' }) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => { if (open) setTab(initialTab); }, [open, buyer?.id, initialTab]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0 bg-background">
        {buyer && (
          <>
            <div className="border-b border-border px-6 pt-6 pb-0">
              <div className="flex items-start gap-3 pr-8">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold text-foreground truncate">{buyer.company_name || 'Buyer'}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[11px] text-muted-foreground">{buyer.buyer_code || 'No code'}</span>
                    <span className="text-muted-foreground/40">|</span>
                    <span className="text-[12px] text-muted-foreground">{buyer.client_type || 'Unclassified'}</span>
                  </div>
                </div>
                <div className="ml-auto shrink-0">
                  <BuyerStatusPill status={buyer.status} />
                </div>
              </div>
              <div className="flex gap-1 mt-4">
                {[
                  { key: 'profile', label: 'Profile' },
                  { key: 'coverage', label: 'Coverage' },
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
              {tab === 'profile'
                ? <BuyerProfileTab buyer={buyer} verticals={verticals} />
                : <BuyerCoverageTab buyer={buyer} verticals={verticals} />}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}