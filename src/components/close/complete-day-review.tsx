"use client";

import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ToneShape } from "@/components/patterns/status-chip";
import type { CloseWarning } from "@/lib/close-checks";
import { formatDisplay, idr } from "@/lib/dates";

/**
 * Checks before a day is completed (DESIGN_SYSTEM §10 dialogs). Warnings inform but never block: the primary button reads
 * "Complete anyway" when there is something to look at. The dialog stays open if the save fails, as before.
 */
export function CompleteDayReview({
  open,
  onOpenChange,
  date,
  portions,
  payments,
  warnings,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  portions: number;
  payments: number;
  warnings: CloseWarning[];
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const hasWarnings = warnings.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          // The confirm button takes focus, as the design asks for a normal confirmation.
          event.preventDefault();
          confirmRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Complete {formatDisplay(date)}?</AlertDialogTitle>
          <AlertDialogDescription>
            {portions} portions · {idr(payments)} in payments
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasWarnings ? (
          <div className="space-y-2">
            <p className="text-small font-semibold text-ink">
              {warnings.length === 1 ? "1 thing to look at" : `${warnings.length} things to look at`}
            </p>
            <ul className="divide-y divide-line rounded-md border border-line">
              {warnings.map((warning) => (
                <li key={warning.code} className="flex gap-3 px-3 py-3 text-table text-ink">
                  <ToneShape tone="warn" className="mt-1 text-warn-mark" />
                  <span className="min-w-0">{warning.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex gap-3 text-table text-ink">
            <ToneShape tone="ok" className="mt-1 text-ok" />
            <span>No issues found.</span>
          </p>
        )}

        <p className="text-small text-ink-muted">
          Completing updates the daily close, the reports and stock usage. You can undo for 10 seconds.
        </p>

        <AlertDialogFooter>
          <Button variant="secondary" className="w-full tablet:w-auto" onClick={() => onOpenChange(false)} disabled={busy}>
            Back
          </Button>
          <Button
            ref={confirmRef}
            className="w-full tablet:w-auto"
            loading={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Completing…" : hasWarnings ? "Complete anyway" : "Complete day"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
