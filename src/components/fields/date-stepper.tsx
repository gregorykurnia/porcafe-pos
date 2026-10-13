import { CalendarDays, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDaysISO, formatDisplay, todayISO } from "@/lib/dates";
import { acceptDateInput } from "@/lib/field-input";

type DateStepperProps = {
  id?: string;
  /** Names the picker for screen readers. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Asked before the date moves, e.g. to guard unsaved work. Resolve false to keep
   * the current date.
   */
  onBeforeChange?: (next: string) => Promise<boolean>;
  warnFuture?: boolean;
};

/**
 * ‹ long date › with a Today tag (or a Future date chip), a Today button and the native picker (DESIGN_SYSTEM §10).
 * Clearing the picker keeps the current date instead of jumping to today.
 */
export function DateStepper({ id, label, value, onChange, onBeforeChange, warnFuture = false }: DateStepperProps) {
  async function move(next: string) {
    if (next === value) return;
    if (onBeforeChange && !(await onBeforeChange(next))) return;
    onChange(next);
  }

  const isToday = value === todayISO();
  const isFuture = warnFuture && value > todayISO();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => void move(addDaysISO(value, -1))}>
          <ChevronLeft strokeWidth={1.5} />
        </Button>
        <div className="min-w-44 px-2 text-center">
          <p className="font-display text-title-3 text-ink">{formatDisplay(value)}</p>
          {isToday && (
            <span className="inline-flex h-5 items-center rounded-md bg-ok-tint px-2 text-micro font-semibold text-ok">Today</span>
          )}
          {isFuture && (
            <span className="inline-flex h-5 items-center gap-1 rounded-md bg-warn-tint px-2 text-micro font-semibold text-warn">
              <TriangleAlert className="size-3" strokeWidth={1.5} aria-hidden="true" />
              Future date
            </span>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Next day" onClick={() => void move(addDaysISO(value, 1))}>
          <ChevronRight strokeWidth={1.5} />
        </Button>
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={isToday} onClick={() => void move(todayISO())}>
        Today
      </Button>
      <div className="relative inline-flex items-center">
        <CalendarDays className="pointer-events-none absolute left-3 size-4 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
        <Input
          id={id}
          aria-label={label}
          type="date"
          value={value}
          onChange={(event) => void move(acceptDateInput(event.target.value, value))}
          className="h-11 w-[10.5rem] bg-surface pl-9 sm:h-10"
        />
      </div>
    </div>
  );
}
