"use client";

import { useSyncExternalStore } from "react";

// Phone is below the tablet breakpoint (DESIGN_SYSTEM §5: 768 px).
const PHONE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True on phone widths, false otherwise. Null until the browser has measured the window, so a page that
 * shows different content on phone can wait instead of rendering the desk version first.
 */
export function useIsPhone(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => null
  );
}
