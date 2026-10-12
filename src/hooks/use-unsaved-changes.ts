"use client";

import { useCallback, useEffect, useRef } from "react";
import { useNavigationGuard, type GuardRegistration } from "@/components/navigation-guard";

type UnsavedChangesOptions = GuardRegistration;

type NavigateEventLike = Event & {
  navigationType: string | null;
  cancelable: boolean;
  destination: { index: number };
};

type NavigationLike = EventTarget & {
  currentEntry: { index: number } | null;
};

/**
 * Guards a page's unsaved state. While `dirty` is true:
 * - the browser's reload and tab-close prompt is shown (beforeunload);
 * - the browser back and forward buttons ask first, where the Navigation API is
 *   supported. Elsewhere they fall back to the restorable session draft;
 * - `confirmLeave()` asks before in-page actions move the user away (date
 *   changes, tab switches). Nav links use the same provider.
 */
export function useUnsavedChangesGuard(options: UnsavedChangesOptions): { confirmLeave: () => Promise<boolean> } {
  const guard = useNavigationGuard();
  const { dirty } = options;

  const latestRef = useRef(options);
  useEffect(() => {
    latestRef.current = options;
  });

  useEffect(() => guard.register(() => latestRef.current), [guard]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
    if (!navigation) return;

    let replayIndex: number | null = null;
    function onNavigate(event: Event) {
      const navigateEvent = event as NavigateEventLike;
      if (navigateEvent.navigationType !== "traverse" || !navigateEvent.cancelable) return;

      const destination = navigateEvent.destination.index;
      const current = navigation?.currentEntry?.index ?? -1;
      // Our own replay after the user chose to leave: let it through once.
      if (replayIndex !== null && destination === replayIndex) {
        replayIndex = null;
        return;
      }
      if (destination < 0 || current < 0) return;

      navigateEvent.preventDefault();
      void guard.confirmLeave().then((leave) => {
        if (!leave) return;
        replayIndex = destination;
        window.history.go(destination - current);
      });
    }

    navigation.addEventListener("navigate", onNavigate);
    return () => navigation.removeEventListener("navigate", onNavigate);
  }, [dirty, guard]);

  const confirmLeave = useCallback(() => guard.confirmLeave(), [guard]);
  return { confirmLeave };
}
