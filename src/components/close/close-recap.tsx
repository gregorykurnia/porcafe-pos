"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDisplay, idr } from "@/lib/dates";
import { Check } from "lucide-react";

// The undo window the hook enforces. The countdown here only shows it; the hook clears the recap.
const UNDO_SECONDS = 10;

/** Whole seconds left in the undo window, counted down from the moment the recap appears. */
function useSecondsLeft(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, seconds - elapsed));
    }, 250);
    return () => clearInterval(timer);
  }, [seconds]);
  return left;
}

/**
 * Shown in place of the Complete day actions for 10 seconds after a day is completed (DESIGN_SYSTEM §10). On phone it
 * replaces the totals bar; on desk and tablet it replaces the actions in the summary card. Undo puts the day back.
 */
export function CloseRecap({
  date,
  portions,
  revenue,
  stockStatus,
  undoing,
  onUndo,
}: {
  date: string;
  portions: number;
  revenue: number;
  stockStatus: string;
  undoing: boolean;
  onUndo: () => void;
}) {
  const secondsLeft = useSecondsLeft(UNDO_SECONDS);
  // The countdown bar starts full and drains over the window. Reduced motion shows only the number.
  const [draining, setDraining] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDraining(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl bg-brand p-4 text-brand-on">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-on/15" aria-hidden="true">
          <Check className="size-5" strokeWidth={1.5} />
        </span>
        <p role="status" className="min-w-0 flex-1">
          <span className="block font-display text-[1.0625rem] font-medium leading-6">{formatDisplay(date)} closed</span>
          <span className="mt-0.5 block text-small text-brand-on/80">
            {portions} portions · {idr(revenue)} · {stockStatus}
          </span>
        </p>
      </div>
      <div className="mt-3">
        <Button variant="inverse" className="w-full" onClick={onUndo} disabled={undoing}>
          {undoing ? "Undoing…" : `Undo · ${secondsLeft} s`}
        </Button>
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1 origin-left bg-brand-on/50 motion-safe:transition-transform motion-safe:duration-[10000ms] motion-safe:ease-linear motion-reduce:hidden"
        style={{ transform: draining ? "scaleX(0)" : "scaleX(1)" }}
      />
    </div>
  );
}
