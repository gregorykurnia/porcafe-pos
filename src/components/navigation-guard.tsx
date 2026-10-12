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

export type GuardRegistration = {
  dirty: boolean;
  message: string;
  /** Saves the page's unsaved state. Resolve true only if it saved and the user may leave. */
  onSave?: () => Promise<boolean>;
  /** Clears the page's unsaved state when the user chooses to discard it. */
  onDiscard?: () => void;
};

type PromptState = {
  message: string;
  onSave?: () => Promise<boolean>;
  onDiscard?: () => void;
  resolve: (leave: boolean) => void;
};

type NavigationGuardValue = {
  register: (getRegistration: () => GuardRegistration) => () => void;
  isDirty: () => boolean;
  /** Resolves true when there is nothing unsaved or the user chose to leave. */
  confirmLeave: () => Promise<boolean>;
};

const NavigationGuardContext = createContext<NavigationGuardValue | null>(null);

/**
 * Mounted once in the root layout. Pages register an unsaved-changes guard with
 * useUnsavedChangesGuard(). Nav links and in-page actions ask this provider
 * before they move away.
 */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const registrationsRef = useRef(new Set<() => GuardRegistration>());
  const pendingRef = useRef<((leave: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [saving, setSaving] = useState(false);

  const activeRegistration = useCallback((): GuardRegistration | null => {
    for (const getRegistration of registrationsRef.current) {
      const registration = getRegistration();
      if (registration.dirty) return registration;
    }
    return null;
  }, []);

  const register = useCallback((getRegistration: () => GuardRegistration) => {
    registrationsRef.current.add(getRegistration);
    return () => {
      registrationsRef.current.delete(getRegistration);
    };
  }, []);

  const isDirty = useCallback(() => activeRegistration() !== null, [activeRegistration]);

  const confirmLeave = useCallback(() => {
    const registration = activeRegistration();
    if (!registration) return Promise.resolve(true);

    // A second request while the prompt is open answers the first as "stay".
    pendingRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      pendingRef.current = resolve;
      setPrompt({
        message: registration.message,
        onSave: registration.onSave,
        onDiscard: registration.onDiscard,
        resolve,
      });
      setOpen(true);
    });
  }, [activeRegistration]);

  function settle(leave: boolean) {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    resolve?.(leave);
  }

  async function saveAndLeave() {
    if (!prompt?.onSave) return;
    setSaving(true);
    let saved = false;
    try {
      saved = await prompt.onSave();
    } catch (err) {
      console.error("Failed to save before leaving:", err);
    } finally {
      setSaving(false);
    }
    // If the save failed, the dialog stays open so the user can still choose.
    if (saved) settle(true);
  }

  function discardAndLeave() {
    prompt?.onDiscard?.();
    settle(true);
  }

  const value: NavigationGuardValue = { register, isDirty, confirmLeave };

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) settle(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="pr-8">Unsaved changes</DialogTitle>
            <DialogDescription>{prompt?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {prompt?.onSave && (
              <Button onClick={() => void saveAndLeave()} disabled={saving} autoFocus>
                {saving ? "Saving…" : "Save draft & continue"}
              </Button>
            )}
            <Button variant="destructive" onClick={discardAndLeave} disabled={saving}>
              {prompt?.onSave ? "Discard" : "Leave without saving"}
            </Button>
            <Button variant="outline" onClick={() => settle(false)} disabled={saving} autoFocus={!prompt?.onSave}>
              Stay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard(): NavigationGuardValue {
  const guard = useContext(NavigationGuardContext);
  if (!guard) throw new Error("useNavigationGuard must be used inside <NavigationGuardProvider>");
  return guard;
}
