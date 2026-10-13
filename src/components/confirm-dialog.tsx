"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog as ConfirmDialogView } from "@/components/patterns/dialogs";

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
  /** A wider dialog for a before/after table. */
  wide?: boolean;
};

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based replacement for the native confirm() prompt. Mount once in the root layout.
 * The look is the shared ConfirmDialog (DESIGN_SYSTEM §10). Cancel, Escape and a new request resolve false;
 * the confirm button resolves true.
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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialogView
        open={open}
        onOpenChange={(next) => { if (!next) settle(false); }}
        title={options.title}
        description={options.body}
        detail={options.details}
        confirmLabel={options.confirmLabel ?? "Confirm"}
        cancelLabel={options.cancelLabel ?? "Cancel"}
        destructive={options.tone === "danger"}
        wide={options.wide}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
