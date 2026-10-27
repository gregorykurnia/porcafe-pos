import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDaysISO, formatDisplay, todayISO } from "@/lib/dates";
import { acceptDateInput } from "@/lib/field-input";

const TYPING_PAUSE_MS = 1000;

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
 * Clearing the picker keeps the current date instead of jumping to today. A date typed into
 * the box moves the day once typing stops (Enter, leaving the box, or a short pause);
 * one picked from the calendar moves it at once.
 */
export function DateStepper({ id, label, value, onChange, onBeforeChange, warnFuture = false }: DateStepperProps) {
  // The picker shows a draft set in the same event as each keystroke. Showing `value` alone
  // would write the old date back while onBeforeChange runs, which resets the browser's
  // typing in that segment: typing 14 into the day became 04.
  const [draft, setDraft] = useState(value);
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setDraft(value);
  }

  async function move(next: string) {
    if (next === value) return;
    if (onBeforeChange && !(await onBeforeChange(next))) {
      setDraft(value);
      return;
    }
    onChange(next);
  }

  // Set by a key press in the box, so typing 14 doesn't open the 1st on the way.
  const typing = useRef(false);
  const pending = useRef<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  function commitTyped() {
    clearTimeout(idleTimer.current);
    typing.current = false;
    const next = pending.current;
    pending.current = null;
    if (next !== null) void move(next);
  }

  function typeDate(raw: string) {
    const next = acceptDateInput(raw, value);
    setDraft(next);
    if (!typing.current) {
      void move(next);
      return;
    }
    pending.current = next;
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(commitTyped, TYPING_PAUSE_MS);
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
          value={draft}
          onChange={(event) => typeDate(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitTyped();
            else typing.current = true;
          }}
          onPointerDown={() => {
            typing.current = false;
          }}
          onBlur={commitTyped}
          className="h-11 w-[10.5rem] bg-surface pl-9 sm:h-10 [@media(pointer:coarse)]:h-11"
        />
      </div>
    </div>
  );
}
