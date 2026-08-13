import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, X } from "lucide-react";

/**
 * Multi-select combobox built on Popover + Command.
 * Props:
 *  - value: array of selected values
 *  - onValueChange: (array) => void
 *  - options: [{ value, label }]
 *  - placeholder: string
 */
export const MultiSelect = React.forwardRef(function MultiSelect(
  // `portal` false renders the dropdown inline instead of in document.body, so
  // it stays scrollable by wheel when opened from inside a Dialog.
  { value = [], onValueChange, options = [], placeholder = "Select…", className, emptyText = "No results found.", portal = true },
  ref
) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const toggle = (val) => {
    if (value.includes(val)) {
      onValueChange(value.filter(v => v !== val));
    } else {
      onValueChange([...value, val]);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "text-left",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              value.map(v => {
                const opt = options.find(o => o.value === v);
                return (
                  <span key={v} className="inline-flex items-center gap-1 bg-secondary rounded px-1.5 py-0.5 text-[11px]">
                    {opt?.label || v}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); toggle(v); }}
                    />
                  </span>
                );
              })
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        portal={portal}
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)", minWidth: "12rem" }}
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder="Search…" value={search} onValueChange={setSearch} className="h-9" />
          <CommandList className="max-h-[260px] overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label || opt.value}
                  onSelect={() => toggle(opt.value)}
                  className="gap-2"
                >
                  <Check className={cn("h-4 w-4", value.includes(opt.value) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{opt.label || opt.value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

export default MultiSelect;