import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Mobile: horizontal scrolling pill row, no wrapping, hidden scrollbar.
      "flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar",
      // lg and up: original centered rounded muted bar. Unchanged on desktop.
      "lg:inline-flex lg:h-9 lg:flex-nowrap lg:items-center lg:justify-center lg:gap-0 lg:overflow-visible lg:rounded-lg lg:bg-muted lg:p-1 lg:text-muted-foreground",
      className
    )}
    {...props} />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef(({ className, onClick, ...props }, ref) => {
  // On activation, keep the pill visible by scrolling it to center on mobile.
  const handleClick = (e) => {
    onClick?.(e);
    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      onClick={handleClick}
      className={cn(
        // Mobile: filled pill, distinct from the underline sub-nav rail.
        "flex-shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-all data-[state=active]:border-primary/40 data-[state=active]:bg-primary/[0.12] data-[state=active]:text-primary",
        // lg and up: original underline-style trigger. Unchanged on desktop.
        "lg:inline-flex lg:items-center lg:justify-center lg:rounded-md lg:border-0 lg:bg-transparent lg:px-3 lg:py-1 lg:text-sm lg:text-inherit lg:ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 lg:data-[state=active]:border-0 lg:data-[state=active]:bg-background lg:data-[state=active]:text-foreground lg:data-[state=active]:shadow",
        className
      )}
      {...props} />
  );
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }