"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useReturnFocus } from "@/hooks/use-return-focus"

// Review-and-save flows (DESIGN_SYSTEM §10 "Sheets"). A 680 px side sheet on tablet and desk, full screen on phone.
function Sheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Set false when the screen draws its own close control, for example one that is disabled while work runs. */
  showCloseButton?: boolean
}) {
  const focus = useReturnFocus()
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-ink/30"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        onOpenAutoFocus={(event) => {
          focus.remember()
          onOpenAutoFocus?.(event)
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          if (!event.defaultPrevented) focus.restore(event)
        }}
        className={cn(
          "fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain bg-surface p-4 text-ink shadow-overlay outline-none",
          "tablet:inset-y-0 tablet:right-0 tablet:left-auto tablet:w-[min(680px,100vw)] tablet:rounded-l-xl tablet:p-6",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="sheet-close-button"
            className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-sunken hover:text-ink tablet:top-4 tablet:right-4"
          >
            <XIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 pr-12", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-display text-title-2 text-ink", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-small text-ink-muted", className)}
      {...props}
    />
  )
}

// The bottom bar holds the save button and says what blocks saving. It sticks to the bottom of the sheet.
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("sticky bottom-0 -mx-4 -mb-4 mt-auto flex flex-col-reverse gap-2 border-t border-line bg-surface p-4 tablet:-mx-6 tablet:-mb-6 tablet:flex-row tablet:justify-end tablet:p-6", className)}
      {...props}
    />
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter }
