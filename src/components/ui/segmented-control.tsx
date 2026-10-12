import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: string };

/**
 * A row of buttons where one is chosen, for switching views on the same card. Each button reports
 * its state with aria-pressed. Use Tabs only when every tab has a panel to control.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              active ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
