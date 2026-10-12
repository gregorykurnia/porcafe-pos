"use client";

import { useEffect, useState } from "react";
import { formatSavedAgo } from "@/lib/relative-time";

/** "Saved 3 min ago", refreshed every 30 seconds so the wording keeps up. */
export function RelativeSavedAt({ savedAt, prefix = "Saved" }: { savedAt: number | null; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (savedAt === null) return null;
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {prefix} {formatSavedAgo(savedAt, now)}
    </span>
  );
}
