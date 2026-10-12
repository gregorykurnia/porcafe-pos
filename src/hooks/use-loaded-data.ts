"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncStatus } from "@/components/state/async-section";

/**
 * Loads the records for one Setup section. `reload` runs after a change and keeps the current records
 * on screen until the new ones arrive, so the section does not drop back to its loading state.
 */
export function useLoadedData<T>(load: () => Promise<T>, label: string) {
  const loaderRef = useRef(load);
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    loaderRef.current = load;
  }, [load]);

  const reload = useCallback(async () => {
    try {
      setData(await loaderRef.current());
      setStatus("ready");
    } catch (err) {
      console.error(`Failed to load ${label}`, err);
      setStatus((current) => (current === "ready" ? "ready" : "error"));
    }
  }, [label]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return { status, data, reload };
}
