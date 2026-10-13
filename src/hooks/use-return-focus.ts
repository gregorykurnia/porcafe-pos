"use client";

import { useRef } from "react";

/**
 * Radix returns focus to its trigger. Dialogs, sheets and confirmations opened from code have no trigger, so focus
 * would fall to the top of the page. Wire both halves into a dialog's content:
 * - `remember()` from onOpenAutoFocus, before the dialog moves focus, records the opener;
 * - `restore(event)` from onCloseAutoFocus gives focus back to it.
 */
export function useReturnFocus() {
  const openerRef = useRef<HTMLElement | null>(null);
  return {
    remember() {
      // Skip anything already inside a dialog: Strict Mode can run the open handler a second time, after the
      // dialog has taken focus, and that element is not the opener.
      const active = document.activeElement;
      if (active instanceof HTMLElement && !active.closest('[role="dialog"], [role="alertdialog"]')) openerRef.current = active;
    },
    restore(event: Event) {
      event.preventDefault();
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    },
  };
}
