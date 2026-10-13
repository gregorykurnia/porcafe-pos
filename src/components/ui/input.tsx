import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, onWheel, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      onWheel={(event) => {
        // A scroll over a focused number field changes its value by accident. Blur it instead.
        if (type === "number") event.currentTarget.blur();
        onWheel?.(event);
      }}
      data-slot="input"
      className={cn(
        // 44 px and 16 px text on phone and tablet (touch); 40 px and body text on desk.
        "h-11 w-full min-w-0 rounded-md border border-line-input bg-surface px-3 py-1 text-[16px] text-ink transition-colors outline-none placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-faint aria-invalid:border-danger desk:h-10 desk:text-body",
        className
      )}
      {...props}
    />
  )
}

export { Input }
