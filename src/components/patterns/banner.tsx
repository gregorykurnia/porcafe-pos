import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToneShape, type StatusTone } from "@/components/patterns/status-chip";

type BannerTone = Extract<StatusTone, "info" | "warn" | "danger">;

const BANNER_TONE: Record<BannerTone, string> = {
  info: "bg-info-tint",
  warn: "bg-warn-tint",
  danger: "bg-danger-tint",
};

/**
 * Restored draft (info), conflict (warn), negative stock (danger), duplicates (warn). A tint background, ink text,
 * the tone shape, and an optional underlined action (DESIGN_SYSTEM §10).
 */
export function Banner({
  tone,
  children,
  action,
  className,
}: {
  tone: BannerTone;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-md p-3 text-body text-ink", BANNER_TONE[tone], className)}>
      <ToneShape tone={tone} className={cn("mt-1.5", tone === "info" ? "text-info" : tone === "warn" ? "text-warn-mark" : "text-danger")} />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? (
        <button type="button" onClick={action.onClick} className="inline-flex min-h-11 shrink-0 items-center self-center text-small font-medium text-accent underline underline-offset-4">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** The 40 px strip across the top of the content when the connection drops. Save buttons stay visible but disabled. */
export function OfflineStrip() {
  return (
    <div role="status" className="flex h-10 items-center justify-center gap-2 bg-warn-tint px-4 text-small font-medium text-warn">
      <WifiOff className="size-4" strokeWidth={1.5} aria-hidden="true" />
      Offline. Saving is paused until the connection comes back.
    </div>
  );
}
