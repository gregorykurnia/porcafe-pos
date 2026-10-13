import { cn } from "@/lib/utils";
import type { StatusTone } from "@/components/patterns/status-chip";

export type StatCell = {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** Only Negative stock colours the figure (`danger`). Otherwise figures stay ink. */
  tone?: Extract<StatusTone, "danger" | "ok" | "warn">;
};

/**
 * One card of figures with hairline cell dividers (DESIGN_SYSTEM §10). Four columns on desk, two on phone.
 */
export function StatStrip({ cells, label }: { cells: StatCell[]; label: string }) {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface shadow-card tablet:grid-cols-4"
    >
      {cells.map((cell, index) => (
        <div
          key={`${cell.label}-${index}`}
          className={cn(
            "min-w-0 border-line p-4 tablet:p-5 [&:nth-child(even)]:border-l tablet:border-l tablet:[&:nth-child(4n+1)]:border-l-0 [&:nth-child(n+3)]:border-t tablet:[&:nth-child(n+3)]:border-t-0"
          )}
        >
          <p className="text-small text-ink-muted">{cell.label}</p>
          <p
            className={cn(
              "mt-1 font-display text-fig-l tabular-nums",
              cell.tone === "danger" ? "text-danger" : "text-ink"
            )}
          >
            {cell.value}
          </p>
          {cell.note ? <p className="mt-1 text-small text-ink-muted">{cell.note}</p> : null}
        </div>
      ))}
    </section>
  );
}
