import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

// `portal` controls whether the content renders in document.body (the default)
// or inline where it is declared.
//
// Inline matters when the popover is opened from inside a Dialog. Radix locks
// scrolling while a dialog is open using react-remove-scroll, which cancels
// wheel events whose target is outside the dialog's DOM subtree. A portalled
// popover lands in document.body, so it is outside that subtree and the wheel
// is swallowed: the list looks scrollable, the scrollbar grip drags fine, but
// mouse wheel and trackpad do nothing. Rendering inline keeps it inside the
// dialog, and scrolling works normally.
const PopoverContent = React.forwardRef(({ className, align = "center", sideOffset = 4, portal = true, ...props }, ref) => {
  const content = (
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props} />
  );
  return portal ? <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal> : content;
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
