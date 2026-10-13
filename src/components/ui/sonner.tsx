"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Toasts (DESIGN_SYSTEM §10): surface with the overlay shadow. The tone shows only in the icon disc (see the
// [data-sonner-toast] rules in globals.css). Bottom-right on desk and tablet, top-centre on phone.
const PHONE_QUERY = "(max-width: 767px)"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const [isPhone, setIsPhone] = React.useState(false)

  React.useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY)
    const update = () => setIsPhone(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={isPhone ? "top-center" : "bottom-right"}
      closeButton
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" strokeWidth={1.5} />
        ),
        info: (
          <InfoIcon className="size-4" strokeWidth={1.5} />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" strokeWidth={1.5} />
        ),
        error: (
          <OctagonXIcon className="size-4" strokeWidth={1.5} />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" strokeWidth={1.5} />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-ink)",
          "--normal-border": "var(--color-line)",
          "--border-radius": "var(--radius-xl)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-overlay",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
