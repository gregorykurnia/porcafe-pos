import { Circle, CircleCheck, CircleDot, CircleX, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusTone, StatusView } from "@/lib/status";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "border-border bg-surface text-muted-foreground",
  info: "border-info/25 bg-info/10 text-info",
  success: "border-ok/25 bg-ok/10 text-ok",
  warning: "border-warn/25 bg-warn/10 text-warn",
  danger: "border-danger/25 bg-danger/10 text-danger",
  primary: "border-primary/20 bg-primary/10 text-primary",
};

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  neutral: Circle,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  primary: CircleDot,
};

/**
 * A status as text, colour and icon together. The label carries the meaning, so colour is never
 * the only cue. Build the view with a function from src/lib/status.ts, so the wording stays in one place.
 */
export function StatusBadge({ view, className }: { view: StatusView; className?: string }) {
  const Icon = TONE_ICON[view.tone];
  return (
    <Badge
      variant="outline"
      className={cn("h-auto gap-1 py-0.5 whitespace-normal text-left", TONE_CLASS[view.tone], className)}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {view.label}
    </Badge>
  );
}
