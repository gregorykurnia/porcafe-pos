"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// The four review widths from the plan. The canvas runs in an iframe so Tailwind breakpoints apply at each one.
const WIDTHS = [
  { label: "Phone", px: 390 },
  { label: "Tablet", px: 820 },
  { label: "Tablet landscape", px: 1024 },
  { label: "Desk", px: 1280 },
] as const;

export function LabFrame() {
  const [px, setPx] = useState<number>(WIDTHS[0].px);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-title-1 text-brand">Component lab</h1>
        <p className="w-full text-small text-ink-muted">Fake data only. No Firestore calls. Development builds only.</p>
      </div>
      <div role="group" aria-label="Preview width" className="inline-flex flex-wrap gap-1 rounded-full bg-sunken p-1">
        {WIDTHS.map((width) => (
          <button
            key={width.px}
            type="button"
            aria-pressed={px === width.px}
            onClick={() => setPx(width.px)}
            className={cn(
              "h-9 rounded-full px-3 text-small font-medium transition-colors",
              px === width.px ? "bg-surface text-brand shadow-raised" : "text-ink-muted hover:text-ink"
            )}
          >
            {width.label} · {width.px}
          </button>
        ))}
      </div>
      <div className="max-w-full overflow-auto rounded-xl border border-line bg-canvas">
        <iframe
          key={px}
          title={`Component lab at ${px} pixels`}
          src="/lab/canvas"
          style={{ width: px, maxWidth: "100%", height: "calc(100dvh - 15rem)" }}
          className="mx-auto block border-0 bg-canvas"
        />
      </div>
    </div>
  );
}
