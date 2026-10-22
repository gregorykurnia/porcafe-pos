"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatPeriodRange, isValidPeriod, presetFor, presetRange, REPORT_PRESETS, type ReportPeriod } from "@/lib/report-period";

/**
 * The period for a report (DESIGN_SYSTEM §10). A segmented control holds the presets and Custom range. The date-range
 * button opens a popover with From and To. An invalid range shows the danger message there and disables Apply.
 * While a custom range is in use, Clear in the popover goes back to This month.
 */
export function PeriodChoice({
  period,
  today,
  onChange,
}: {
  period: ReportPeriod;
  today: string;
  onChange: (next: ReportPeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReportPeriod>(period);
  const valid = isValidPeriod(draft);
  const preset = presetFor(period, today);

  const options = [
    ...REPORT_PRESETS.map((item) => ({ value: item.key as string, label: item.label })),
    { value: "custom", label: "Custom range" },
  ];

  function openRange() {
    setDraft(period);
    setOpen(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label="Period"
        // One row on phone: it scrolls sideways instead of wrapping "Custom range" onto its own line.
        className="flex-nowrap overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap"
        value={preset === "custom" ? "custom" : preset}
        options={options}
        onChange={(value) => {
          if (value === "custom") openRange();
          else onChange(presetRange(value as Exclude<typeof preset, "custom">, today));
        }}
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setDraft(period);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" aria-haspopup="dialog">
            {formatPeriodRange(period)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] gap-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="period-from" className="text-small text-ink-muted">From</Label>
              <Input
                id="period-from"
                type="date"
                value={draft.from}
                onChange={(event) => event.target.value && setDraft({ ...draft, from: event.target.value })}
                aria-invalid={!valid || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period-to" className="text-small text-ink-muted">To</Label>
              <Input
                id="period-to"
                type="date"
                value={draft.to}
                onChange={(event) => event.target.value && setDraft({ ...draft, to: event.target.value })}
                aria-invalid={!valid || undefined}
              />
            </div>
          </div>
          {!valid && (
            <p role="alert" className="text-small text-danger">
              The start date must be on or before the end date.
            </p>
          )}
          <div className="flex justify-end gap-2">
            {preset === "custom" && (
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto"
                onClick={() => {
                  onChange(presetRange("this-month", today));
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!valid}
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
