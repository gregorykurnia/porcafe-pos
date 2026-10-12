"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CloseWarning } from "@/lib/close-checks";

/**
 * Checks before a day is completed. Warnings inform but never block: the primary
 * button reads "Complete anyway" when there is something to look at.
 */
export function CompleteDayReview({
  open,
  onOpenChange,
  warnings,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: CloseWarning[];
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8">Complete this day?</DialogTitle>
          <DialogDescription>
            {warnings.length === 0
              ? "No issues found. Completing updates the daily close, the reports and stock usage."
              : "Check these first. You can still complete the day."}
          </DialogDescription>
        </DialogHeader>
        {warnings.length > 0 && (
          <ul className="space-y-2">
            {warnings.map((warning) => (
              <li key={warning.code} className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-sm text-foreground">
                {warning.message}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Back
          </Button>
          <Button onClick={() => void onConfirm()} disabled={busy} className="bg-primary hover:bg-primary-hover">
            {busy ? "Completing…" : warnings.length > 0 ? "Complete anyway" : "Complete day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
