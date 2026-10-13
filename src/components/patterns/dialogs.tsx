"use client";

import { useLayoutEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDetail,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Radix returns focus to its own trigger, and these dialogs are opened from code with no trigger, so focus would
 * fall to the page top. This records what had focus when the dialog opened and gives it back on close.
 */
function useReturnFocus(open: boolean) {
  const openerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  return (event: Event) => {
    event.preventDefault();
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus();
  };
}

/**
 * Confirmation (DESIGN_SYSTEM §10). A normal confirm focuses the action. A destructive one shows a danger disc and
 * focuses the safe choice, so a stray Enter does not delete anything. Closing with Escape counts as the safe choice.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  detail,
  confirmLabel,
  cancelLabel = "Keep it",
  destructive = false,
  wide = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  detail?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** A wider dialog for a before/after table. */
  wide?: boolean;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useReturnFocus(open);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={wide ? "max-w-lg" : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (destructive ? cancelRef.current : confirmRef.current)?.focus();
        }}
        onCloseAutoFocus={returnFocus}
      >
        <AlertDialogHeader>
          {destructive ? (
            <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-danger-tint text-danger">
              <Trash2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
          ) : null}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {detail ? <AlertDialogDetail>{detail}</AlertDialogDetail> : null}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef}>{cancelLabel}</AlertDialogCancel>
          <Button
            ref={confirmRef}
            variant={destructive ? "destructive" : "primary"}
            className="w-full tablet:w-auto"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The one unsaved-changes prompt (DESIGN_SYSTEM §10 "Dialogs"): Save draft & continue (primary), Stay, and Discard
 * (danger ghost). Pages with nothing to save omit `onSaveAndContinue`, which leaves Stay and "Leave without saving".
 * If the save fails the dialog stays open and says so through `error`. Closing it with Escape counts as Stay.
 */
export function UnsavedGuardDialog({
  open,
  saving = false,
  error,
  description = "Your draft is only on this device until it is saved.",
  onSaveAndContinue,
  onStay,
  onDiscard,
}: {
  open: boolean;
  saving?: boolean;
  error?: string | null;
  /** The page's own sentence about what is unsaved. */
  description?: string;
  onSaveAndContinue?: () => void;
  onStay: () => void;
  onDiscard: () => void;
}) {
  const canSave = onSaveAndContinue !== undefined;
  const returnFocus = useReturnFocus(open);
  const saveRef = useRef<HTMLButtonElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          // Save is the first choice when there is one; otherwise Stay has the focus.
          event.preventDefault();
          (canSave ? saveRef.current : stayRef.current)?.focus();
        }}
        onCloseAutoFocus={returnFocus}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{canSave ? "Save your changes first?" : "Unsaved changes"}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-small text-danger">{error}</p> : null}
        <AlertDialogFooter className="tablet:flex-row-reverse tablet:justify-start">
          {canSave ? (
            <Button ref={saveRef} className="w-full tablet:w-auto" loading={saving} onClick={onSaveAndContinue}>
              {saving ? "Saving…" : "Save draft & continue"}
            </Button>
          ) : null}
          <Button ref={stayRef} variant="secondary" className="w-full tablet:w-auto" onClick={onStay} disabled={saving}>
            Stay
          </Button>
          <Button variant="ghost" className="w-full text-danger hover:bg-danger-tint tablet:w-auto" onClick={onDiscard} disabled={saving}>
            {canSave ? "Discard" : "Leave without saving"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
