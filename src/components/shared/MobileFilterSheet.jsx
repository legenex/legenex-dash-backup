import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Search, Filter } from 'lucide-react';

/**
 * Responsive filter wrapper.
 *
 * At lg and up: renders `children` inline, exactly as before. No sheet, no
 * button, no extra wrapper markup around the controls.
 *
 * Below lg: renders a single row with a full-width search input on the left
 * and a Filters button on the right showing a badge with the active filter
 * count. Tapping Filters opens a bottom Sheet holding `children`, with a
 * Clear all and an Apply button pinned above the safe-area inset.
 *
 * Props:
 *  - search, onSearchChange, searchPlaceholder: the mobile search input
 *  - activeCount: number shown on the Filters badge
 *  - onClearAll: called by the sheet's Clear all button
 *  - children: the filter controls (rendered inline on desktop, in the sheet on mobile)
 */
export default function MobileFilterSheet({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  activeCount = 0,
  onClearAll,
  children,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: inline, untouched */}
      <div className="hidden lg:contents">{children}</div>

      {/* Mobile: search + Filters button */}
      <div className="lg:hidden flex items-center gap-2 w-full">
        {onSearchChange && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 bg-card border-border h-11"
            />
          </div>
        )}
        <Button
          variant={activeCount > 0 ? 'default' : 'outline'}
          onClick={() => setOpen(true)}
          className={`gap-1.5 h-11 tap-target ${onSearchChange ? '' : 'flex-1'}`}
        >
          <Filter className="w-4 h-4" /> Filters
          {activeCount > 0 && <Badge variant="secondary" className="ml-1">{activeCount}</Badge>}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="lg:hidden p-0 flex flex-col max-h-[85vh] rounded-t-2xl"
        >
          <div className="px-4 pt-5 pb-2 shrink-0">
            <div className="text-[15px] font-semibold text-foreground">Filters</div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
            {children}
          </div>
          <div
            className="shrink-0 border-t border-border p-4 flex items-center gap-2 bg-background"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={() => { if (onClearAll) onClearAll(); }}
            >
              Clear all
            </Button>
            <Button className="flex-1 h-11" onClick={() => setOpen(false)}>
              Apply
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}