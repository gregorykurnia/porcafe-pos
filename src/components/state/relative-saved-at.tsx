"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatSavedAgo } from "@/lib/relative-time";

/**
 * "Saved 3 min ago", refreshed every 30 seconds so the wording keeps up. Pass prefix="" when the
 * label is already elsewhere, such as "Last saved" beside the value.
 */
export function RelativeSavedAt({
  savedAt,
  prefix = "Saved",
  className,
}: {
  savedAt: number | null;
  prefix?: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (savedAt === null) return null;
  return (
    <span className={cn("text-xs text-muted-foreground", className)} aria-live="polite">
      {prefix ? `${prefix} ` : ""}
      {formatSavedAgo(savedAt, now)}
    </span>
  );
}
