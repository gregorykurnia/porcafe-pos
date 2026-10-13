"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { UnsavedGuardDialog } from "@/components/patterns/dialogs";

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
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
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
    setSaveError(null);
    let saved = false;
    try {
      saved = await prompt.onSave();
    } catch (err) {
      console.error("Failed to save before leaving:", err);
    } finally {
      setSaving(false);
    }
    // If the save failed, the dialog stays open so the user can still choose, and says what is kept.
    if (saved) settle(true);
    else setSaveError("Couldn't save. Your changes are still here.");
  }

  function discardAndLeave() {
    prompt?.onDiscard?.();
    settle(true);
  }

  const value: NavigationGuardValue = { register, isDirty, confirmLeave };

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      <UnsavedGuardDialog
        open={open}
        saving={saving}
        error={saveError}
        description={prompt?.message}
        onSaveAndContinue={prompt?.onSave ? () => void saveAndLeave() : undefined}
        onStay={() => { if (!saving) settle(false); }}
        onDiscard={discardAndLeave}
      />
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard(): NavigationGuardValue {
  const guard = useContext(NavigationGuardContext);
  if (!guard) throw new Error("useNavigationGuard must be used inside <NavigationGuardProvider>");
  return guard;
}
