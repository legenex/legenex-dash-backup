import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";

// Tracks whether we are below the lg breakpoint (1024px), matching the CSS
// used everywhere else in this build so the sheet and the layout agree.
function useBelowLg() {
  const [below, setBelow] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setBelow(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return below;
}

/**
 * Searchable combobox built on top of shadcn Popover + Command.
 * Props:
 *  - value: currently selected value
 *  - onValueChange: (value) => void
 *  - options: [{ value, label }]  (label defaults to value)
 *  - placeholder: string
 *  - className: applied to trigger
 *  - popoverClassName: applied to popover content
 *  - disabled: boolean
 *  - emptyText: text when no options match
 */
export const SearchableSelect = React.forwardRef(function SearchableSelect(
  // `portal` false renders the dropdown inline instead of in document.body.
  // Needed when this select sits inside a Dialog: the dialog's scroll lock
  // cancels wheel events outside its own DOM subtree, so a portalled list can
  // be dragged by its scrollbar but ignores mouse wheel and trackpad.
  { value, onValueChange, options = [], placeholder = "Select…", className, popoverClassName, disabled, emptyText = "No results found.", renderLabel, renderItem, portal = true },
  ref
) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const belowLg = useBelowLg();

  const selected = options.find((o) => o.value === value);

  const display = selected
    ? (typeof renderLabel === "function" ? renderLabel(selected) : selected.label || selected.value)
    : placeholder;

  const trigger = (
    <button
      ref={ref}
      type="button"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      onClick={belowLg ? () => setOpen(true) : undefined}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 text-left",
        className
      )}
    >
      <span className={cn("truncate", !selected && "text-muted-foreground")}>{display}</span>
      <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
    </button>
  );

  // Mobile: options in a bottom Sheet, search pinned at top, 70vh cap.
  if (belowLg) {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? options.filter((opt) => (opt.label || opt.value || "").toLowerCase().includes(q))
      : options;
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
          <SheetContent side="bottom" className="p-0 flex flex-col max-h-[70vh] rounded-t-2xl">
            <div className="p-3 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-11"
                  autoFocus
                />
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto p-1"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
              )}
              {filtered.map((opt) => {
                const label = typeof renderLabel === "function" ? renderLabel(opt) : (opt.label || opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onValueChange(opt.value); setOpen(false); setSearch(""); }}
                    className="tap-target w-full flex items-center gap-2 rounded-md px-3 min-h-[44px] text-[15px] text-left active:bg-accent"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", value === opt.value ? "opacity-100" : "opacity-0")} />
                    {typeof renderItem === "function" ? renderItem(opt) : <span className="truncate">{label}</span>}
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: popover with collision padding so it never extends beyond the
  // viewport (and never gets clipped by a parent Dialog). The list scrolls
  // internally with overscroll containment so wheel events don't chain.
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        portal={portal}
        className={cn("p-0", popoverClassName)}
        align="start"
        sideOffset={4}
        collisionPadding={8}
        style={{ width: "var(--radix-popover-trigger-width)", minWidth: "12rem" }}
      >
        <Command shouldFilter={true} className="h-auto overflow-visible">
          <CommandInput
            placeholder="Search…"
            value={search}
            onValueChange={setSearch}
            className="h-9"
          />
          <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const label = typeof renderLabel === "function" ? renderLabel(opt) : (opt.label || opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.label || opt.value}
                    onSelect={() => { onValueChange(opt.value); setOpen(false); setSearch(""); }}
                    className="gap-2"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", value === opt.value ? "opacity-100" : "opacity-0")} />
                    {typeof renderItem === "function" ? renderItem(opt) : <span className="truncate">{label}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

export default SearchableSelect;