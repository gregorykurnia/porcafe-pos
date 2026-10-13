import { cn } from "@/lib/utils";

export type LegendItem = { label: string; swatch: string; dashed?: boolean; dotted?: boolean };

/**
 * Wraps a recharts chart (DESIGN_SYSTEM §10 "Charts"): a legend that names each mark, a one-line takeaway under the
 * chart, and role="img" with a sentence-long aria-label. The chart itself stays in recharts.
 */
export function ChartFrame({
  label,
  takeaway,
  legend,
  children,
  className,
}: {
  label: string;
  takeaway?: string;
  legend: LegendItem[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("space-y-3", className)}>
      <div role="img" aria-label={label}>
        {children}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-muted" aria-label="Legend">
        {legend.map((item) => (
          <li key={item.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "inline-block h-2.5 w-4 rounded-sm",
                item.dashed && "border border-dashed bg-transparent",
                item.dotted && "border-t-2 border-dotted bg-transparent"
              )}
              style={item.dashed || item.dotted ? { borderColor: item.swatch } : { background: item.swatch }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      {takeaway ? <figcaption className="border-t border-line pt-3 text-small text-ink-muted">{takeaway}</figcaption> : null}
    </figure>
  );
}
