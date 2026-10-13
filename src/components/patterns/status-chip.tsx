import { cn } from "@/lib/utils";

// Five tones, each with one meaning and one shape (DESIGN_SYSTEM §6). `solid` is the Negative stock chip only.
export type StatusTone = "ok" | "info" | "warn" | "danger" | "neutral" | "solid";

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "bg-ok-tint text-ok",
  info: "bg-info-tint text-info",
  warn: "bg-warn-tint text-warn",
  danger: "bg-danger-tint text-danger",
  neutral: "bg-neutral-tint text-neutral",
  solid: "bg-danger-solid text-white",
};

/** The 12 px shape for a tone: check, half-filled circle, triangle, diamond, open circle. */
export function ToneShape({ tone, className }: { tone: StatusTone; className?: string }) {
  const common = { viewBox: "0 0 12 12", width: 12, height: 12, fill: "none", "aria-hidden": true, className: cn("shrink-0", className) };
  switch (tone) {
    case "ok":
      return (
        <svg {...common}>
          <path d="M2.5 6.2 5 8.5 9.5 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 1.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />
        </svg>
      );
    case "warn":
      return (
        <svg {...common}>
          <path d="M6 1.8 11 10.2H1z" fill="currentColor" />
        </svg>
      );
    case "danger":
    case "solid":
      return (
        <svg {...common}>
          <path d="M6 .8 11.2 6 6 11.2.8 6z" fill="currentColor" />
        </svg>
      );
    case "neutral":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

/** A status with its word, its shape and its tone together. Never colour alone. */
export function StatusChip({
  tone,
  children,
  header = false,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  /** Header chips are 28 px tall instead of 24. */
  header?: boolean;
  className?: string;
}) {
  return (
    <span
      data-slot="status-chip"
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 text-micro font-semibold whitespace-nowrap",
        header ? "h-7" : "h-6",
        TONE_CLASS[tone],
        className
      )}
    >
      <ToneShape tone={tone} />
      {children}
    </span>
  );
}
