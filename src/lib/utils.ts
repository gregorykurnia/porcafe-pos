import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The Canopy type scale (DESIGN_SYSTEM §4) adds font sizes that tailwind-merge does not know. Without this,
// `text-body` reads as a text colour and drops the `text-brand-on` next to it.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "title-1",
            "title-2",
            "title-3",
            "body-lg",
            "body",
            "table",
            "small",
            "micro",
            "fig-xl",
            "fig-l",
            "fig-m",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
