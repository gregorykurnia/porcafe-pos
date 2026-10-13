"use client";

import { useRef } from "react";
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
 * Confirmation (DESIGN_SYSTEM §10). A normal confirm focuses the action. A destructive one shows a danger disc and
 * focuses the safe choice, so a stray Enter does not delete anything.
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
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  detail?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          if (!destructive) return;
          event.preventDefault();
          cancelRef.current?.focus();
        }}
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
 * Unsaved-changes guard (DESIGN_SYSTEM §10): Save draft & continue (primary), Stay, and Discard (danger text).
 * If the save fails the dialog stays open and says so. Closing it with Escape counts as Stay.
 */
export function UnsavedGuardDialog({
  open,
  saving = false,
  error,
  onSaveAndContinue,
  onStay,
  onDiscard,
}: {
  open: boolean;
  saving?: boolean;
  error?: string | null;
  onSaveAndContinue: () => void;
  onStay: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save your changes first?</AlertDialogTitle>
          <AlertDialogDescription>Your draft is only on this device until it is saved.</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-small text-danger">{error}</p> : null}
        <AlertDialogFooter className="tablet:flex-row-reverse tablet:justify-start">
          <Button className="w-full tablet:w-auto" loading={saving} onClick={onSaveAndContinue}>
            {saving ? "Saving…" : "Save draft & continue"}
          </Button>
          <Button variant="secondary" className="w-full tablet:w-auto" onClick={onStay} disabled={saving}>
            Stay
          </Button>
          <Button variant="ghost" className="w-full text-danger hover:bg-danger-tint tablet:w-auto" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
