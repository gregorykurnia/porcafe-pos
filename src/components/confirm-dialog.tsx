"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  /** Short inline explanation. Rendered inside a paragraph. */
  body?: ReactNode;
  /** Optional block content, such as an impact list or a before/after table. */
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` styles the confirm button as destructive and focuses Cancel first. */
  tone?: "danger" | "default";
};

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based replacement for the native confirm() prompt. Mount once in the root layout.
 *
 * const ok = await confirm({ title: "Delete sale?", tone: "danger", confirmLabel: "Delete" });
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    resolve?.(ok);
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A new request replaces one that is still open. The old caller gets `false`.
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(next);
      setOpen(true);
    });
  }, []);

  const danger = options.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => { if (!next) settle(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="pr-8">{options.title}</DialogTitle>
            <DialogDescription>{options.body}</DialogDescription>
          </DialogHeader>
          {options.details}
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)} autoFocus={danger}>
              {options.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={danger ? "destructive" : "default"}
              onClick={() => settle(true)}
              autoFocus={!danger}
            >
              {options.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
