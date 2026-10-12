import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "primary" | "success" | "warning" | "danger";

/**
 * tile: a bordered box for a row of figures. plain: no box, for a headline grid. card: a card with
 * an icon, for the top row of the Dashboard. Use size "sm" for the compact cards on the inventory
 * screens, where the icon sits to the left of the text.
 */
export type StatVariant = "tile" | "plain" | "card";

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
  variant = "tile",
  size = "md",
  icon,
  iconClassName = "bg-primary",
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
  variant?: StatVariant;
  size?: "md" | "sm";
  icon?: ReactNode;
  iconClassName?: string;
  className?: string;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const up = hasDelta && delta >= 0;
  const good = hasDelta && (deltaUpIsGood ? up : !up);

  const deltaLine = hasDelta ? (
    <p className={cn("mt-0.5 flex items-center gap-0.5 text-xs font-medium", good ? "text-success" : "text-danger")}>
      {up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
      <span>{Math.abs(Math.round(delta * 100))}%</span>
      {deltaLabel && <span className="font-normal text-muted-foreground">{deltaLabel}</span>}
    </p>
  ) : null;

  if (variant === "card" && size === "sm") {
    return (
      <Card size="sm" className={className}>
        <CardContent className={cn("p-3", icon && "flex items-center gap-3")}>
          {icon}
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("mt-1 break-words text-xl font-semibold tabular-nums", VALUE_TONE[tone])}>{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            {deltaLine}
          </div>
        </CardContent>
      </Card>
    );
  }

  const valueClass = emphasized
    ? "text-lg font-bold text-primary"
    : variant === "card"
      ? cn("text-lg font-semibold sm:text-xl", VALUE_TONE[tone])
      : cn("text-base font-semibold", VALUE_TONE[tone]);

  const body = (
    <>
      {variant === "card" && icon && (
        <div className={cn("mb-2 flex size-7 items-center justify-center rounded-full text-white", iconClassName)}>{icon}</div>
      )}
      <p className="text-xs font-medium text-muted-foreground">
        {label}
        {range && <span> · {range}</span>}
      </p>
      <p className={cn("mt-1 break-words tabular-nums", valueClass)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      {deltaLine}
    </>
  );

  if (variant === "card") {
    return (
      <Card className={cn("gap-2 py-4", className)}>
        <CardContent className="px-4">{body}</CardContent>
      </Card>
    );
  }

  if (variant === "plain") {
    return <div className={cn("min-w-0", className)}>{body}</div>;
  }

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg px-3 py-2",
        emphasized ? "bg-accent" : "border border-border bg-surface/70",
        className
      )}
    >
      {body}
    </div>
  );
}
