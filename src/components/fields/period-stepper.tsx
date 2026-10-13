"use client";

import { addMonths, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { addDaysISO, formatDayDisplay, formatMonthDisplay, formatWeekDisplay, monthKey, todayISO } from "@/lib/dates";

export type StepUnit = "day" | "week" | "month";

const UNITS: { value: StepUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function stepISO(value: string, unit: StepUnit, direction: 1 | -1): string {
  if (unit === "day") return addDaysISO(value, direction);
  if (unit === "week") return addDaysISO(value, 7 * direction);
  return format(addMonths(parseISO(value), direction), "yyyy-MM-dd");
}

function labelFor(value: string, unit: StepUnit): string {
  if (unit === "day") return formatDayDisplay(value);
  if (unit === "week") return formatWeekDisplay(value);
  return formatMonthDisplay(monthKey(value));
}

/**
 * Day, Week or Month with ‹ label › and a Today button (DESIGN_SYSTEM §10). The value is any date inside the
 * period, so a week or month steps from there.
 */
export function PeriodStepper({
  unit,
  onUnitChange,
  value,
  onChange,
}: {
  unit: StepUnit;
  onUnitChange: (unit: StepUnit) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  const isCurrent = labelFor(value, unit) === labelFor(todayISO(), unit);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl label="Period unit" value={unit} options={UNITS} onChange={onUnitChange} />
      <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
        <Button variant="ghost" size="icon-sm" aria-label={`Previous ${unit}`} onClick={() => onChange(stepISO(value, unit, -1))}>
          <ChevronLeft strokeWidth={1.5} />
        </Button>
        <p className="min-w-44 px-2 text-center font-display text-title-3 text-ink" aria-live="polite">
          {labelFor(value, unit)}
        </p>
        <Button variant="ghost" size="icon-sm" aria-label={`Next ${unit}`} onClick={() => onChange(stepISO(value, unit, 1))}>
          <ChevronRight strokeWidth={1.5} />
        </Button>
      </div>
      <Button variant="ghost" size="sm" disabled={isCurrent} onClick={() => onChange(todayISO())}>
        Today
      </Button>
    </div>
  );
}
