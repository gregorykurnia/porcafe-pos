import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "primary" | "success" | "warning" | "danger";

const VALUE_TONE: Record<StatTone, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * One figure with its label. `range` names the period the figure covers. `delta` is a signed
 * fraction (0.12 is up 12%), shown with an arrow. It is green when the move is good, and
 * `deltaUpIsGood={false}` flips that for figures such as stock to order.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
  range,
  delta,
  deltaLabel,
  deltaUpIsGood = true,
  emphasized = false,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  range?: string;
  delta?: number | null;
  deltaLabel?: string;
  deltaUpIsGood?: boolean;
  emphasized?: boolean;
  className?: string;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const up = hasDelta && delta >= 0;
  const good = hasDelta && (deltaUpIsGood ? up : !up);

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg px-3 py-2",
        emphasized ? "bg-accent" : "border border-border bg-surface/70",
        className
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">
        {label}
        {range && <span> · {range}</span>}
      </p>
      <p
        className={cn(
          "mt-1 break-words tabular-nums",
          emphasized ? "text-lg font-bold text-primary" : cn("text-base font-semibold", VALUE_TONE[tone])
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      {hasDelta && (
        <p className={cn("mt-0.5 flex items-center gap-0.5 text-xs font-medium", good ? "text-success" : "text-danger")}>
          {up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
          <span>{Math.abs(Math.round(delta * 100))}%</span>
          {deltaLabel && <span className="font-normal text-muted-foreground">{deltaLabel}</span>}
        </p>
      )}
    </div>
  );
}
