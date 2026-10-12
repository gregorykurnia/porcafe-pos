import { ChevronLeft, ChevronRight } from "lucide-react";
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
 * ‹ readable date › with Today and the native picker. Clearing the picker keeps the
 * current date instead of jumping to today.
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
      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface px-1 py-1 shadow-sm">
        <Button type="button" variant="ghost" size="icon" aria-label="Previous day" onClick={() => void move(addDaysISO(value, -1))}>
          <ChevronLeft />
        </Button>
        <div className="min-w-36 px-2 text-center">
          <p className="text-sm font-semibold text-foreground">{formatDisplay(value)}</p>
          {isToday && <p className="text-xs text-muted-foreground">Today</p>}
          {isFuture && <p className="text-xs text-warning">Future date</p>}
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Next day" onClick={() => void move(addDaysISO(value, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <Button type="button" variant="ghost" disabled={isToday} onClick={() => void move(todayISO())}>
        Today
      </Button>
      <Input
        id={id}
        aria-label={label}
        type="date"
        value={value}
        onChange={(event) => void move(acceptDateInput(event.target.value, value))}
        className="h-10 w-[9.5rem] bg-surface"
      />
    </div>
  );
}
