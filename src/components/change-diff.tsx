"use client";

import { useId, useState } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { ToneShape } from "@/components/patterns/status-chip";

export type ChangeDiffRow = {
  label: string;
  current: number | string | null;
  next: number | string | null;
  /** Formats a non-empty value for display. Plain String() is used when omitted. */
  format?: (value: number | string) => string;
};

/**
 * Before/after diff (DESIGN_SYSTEM §10). Field · Saved · → · Sheet. Changed rows carry the warn triangle and a light
 * warn tint, the old value is struck through and the new one is bold, so the change never relies on colour alone.
 * "Only show changes" is on by default. The count is written into the sentence above the table.
 */
export function ChangeDiff({
  rows,
  currentLabel = "Saved",
  nextLabel = "New",
}: {
  rows: ChangeDiffRow[];
  currentLabel?: string;
  nextLabel?: string;
}) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const switchId = useId();
  const changedCount = rows.filter((row) => row.current !== row.next).length;
  const shown = onlyChanges ? rows.filter((row) => row.current !== row.next) : rows;

  function display(row: ChangeDiffRow, value: number | string | null) {
    if (value === null || value === "") return "—";
    return row.format ? row.format(value) : String(value);
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={switchId} className="text-body text-ink">
          Only show changes
        </label>
        {/* The button is 44 px tall for touch; the drawn track inside it is 24 px. */}
        <SwitchPrimitive.Root
          id={switchId}
          checked={onlyChanges}
          onCheckedChange={setOnlyChanges}
          className="group inline-flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center"
        >
          <span aria-hidden="true" className="inline-flex h-6 w-11 items-center rounded-full bg-line-input transition-colors duration-fast ease-soft group-data-[state=checked]:bg-accent">
            <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-surface shadow-card transition-transform duration-fast ease-soft data-[state=checked]:translate-x-[22px]" />
          </span>
        </SwitchPrimitive.Root>
      </div>
      <p className="text-table text-ink-muted">
        {changedCount === 0 ? (
          "No values change."
        ) : (
          <>
            <b className="font-semibold text-ink">{changedCount} {changedCount === 1 ? "value" : "values"}</b> will change.
          </>
        )}
      </p>
      {shown.length > 0 && (
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-table">
            <thead className="bg-sunken text-small text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Field</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{currentLabel}</th>
                <th scope="col" className="w-6 px-0 py-2"><span className="sr-only">changes to</span></th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{nextLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((row) => {
                const changed = row.current !== row.next;
                return (
                  <tr key={row.label} className={changed ? "bg-warn-tint/50" : undefined}>
                    <th scope="row" className="px-3 py-2.5 text-left font-normal text-ink">
                      <span className="inline-flex items-center gap-2">
                        {changed ? <ToneShape tone="warn" className="text-warn-mark" /> : null}
                        {row.label}
                      </span>
                    </th>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${changed ? "text-ink-muted line-through decoration-1" : "text-ink"}`}>
                      {display(row, row.current)}
                    </td>
                    <td aria-hidden="true" className="w-6 px-0 py-2.5 text-ink-muted">→</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${changed ? "font-semibold text-ink" : "text-ink"}`}>
                      {display(row, row.next)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
