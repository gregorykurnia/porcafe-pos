"use client";

import { Button } from "@/components/ui/button";
import { formatDisplay, idr } from "@/lib/dates";

/**
 * Shown in place of the action bar for a few seconds after a day is completed.
 * Undo is available for the same window.
 */
export function CloseRecap({
  date,
  portions,
  revenue,
  stockStatus,
  undoing,
  onUndo,
}: {
  date: string;
  portions: number;
  revenue: number;
  stockStatus: string;
  undoing: boolean;
  onUndo: () => void;
}) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-foreground">
        {formatDisplay(date)} closed · {portions} portions · {idr(revenue)} · {stockStatus}
      </p>
      <Button variant="outline" size="sm" onClick={onUndo} disabled={undoing}>
        {undoing ? "Undoing…" : "Undo"}
      </Button>
    </div>
  );
}
