import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Canopy buttons (DESIGN_SYSTEM §10). Every button is a full pill. `primary` (also `default`) is the one
// solid brand action per view. `outline` is an older name for `secondary`, kept so existing screens still work.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent whitespace-nowrap font-medium transition-colors duration-fast ease-soft select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-on hover:bg-brand-hover",
        default: "bg-brand text-brand-on hover:bg-brand-hover",
        secondary: "border-line-input bg-surface text-ink hover:bg-sunken",
        outline: "border-line-input bg-surface text-ink hover:bg-sunken",
        ghost: "text-brand hover:bg-brand-soft",
        destructive: "bg-danger-solid text-white hover:bg-danger",
        inverse: "bg-canvas text-brand hover:bg-surface",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        // sm is 36 px on desk; touch devices get 44 px.
        sm: "h-9 px-3 text-small [@media(pointer:coarse)]:h-11 [&_svg:not([class*='size-'])]:size-4",
        default: "h-11 px-4 text-body",
        lg: "h-12 px-5 text-body-lg",
        xs: "h-7 px-2.5 text-micro [&_svg:not([class*='size-'])]:size-4",
        icon: "size-11",
        "icon-sm": "size-9 [@media(pointer:coarse)]:size-11",
        "icon-lg": "size-12",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    // Shows a spinner and disables the button. Pass the verb-ing label as children, for example "Saving…".
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={loading || disabled}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? children : (
        <>
          {loading ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
