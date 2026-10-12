"use client";

import { useReducer } from "react";

// idle → compressing → scanning → review → saving → (closed)
//                 ↘ error → retry (same photo) or a new photo
// Only the phase, the photo and the last error live here. Review rows are edited by the screen.

export type ScanPhase = "idle" | "compressing" | "scanning" | "review" | "saving" | "error";

export type ScanMachine = {
  phase: ScanPhase;
  /** The original photo, kept so a failed scan can be retried without choosing it again. */
  file: File | null;
  /** Object URL of the photo shown on screen. The caller revokes it when it is replaced. */
  photoUrl: string | null;
  error: string | null;
};

export type ScanAction =
  | { type: "photo-chosen"; file: File; photoUrl: string }
  | { type: "retry" }
  | { type: "compressed" }
  | { type: "scan-succeeded" }
  | { type: "scan-failed"; message: string }
  | { type: "save-started" }
  | { type: "save-succeeded" }
  | { type: "save-failed" }
  | { type: "reset" };

export const initialScanMachine: ScanMachine = { phase: "idle", file: null, photoUrl: null, error: null };

/** Transitions that are not valid from the current phase leave the state unchanged. */
export function scanMachineReducer(state: ScanMachine, action: ScanAction): ScanMachine {
  switch (action.type) {
    case "photo-chosen":
      if (state.phase !== "idle" && state.phase !== "error") return state;
      return { phase: "compressing", file: action.file, photoUrl: action.photoUrl, error: null };
    case "retry":
      return state.phase === "error" && state.file ? { ...state, phase: "compressing", error: null } : state;
    case "compressed":
      return state.phase === "compressing" ? { ...state, phase: "scanning" } : state;
    case "scan-succeeded":
      return state.phase === "scanning" ? { ...state, phase: "review" } : state;
    case "scan-failed":
      return state.phase === "compressing" || state.phase === "scanning"
        ? { ...state, phase: "error", error: action.message }
        : state;
    case "save-started":
      return state.phase === "review" ? { ...state, phase: "saving", error: null } : state;
    case "save-succeeded":
      return state.phase === "saving" ? initialScanMachine : state;
    case "save-failed":
      // A failed save keeps the review, so nothing typed is lost.
      return state.phase === "saving" ? { ...state, phase: "review" } : state;
    case "reset":
      return initialScanMachine;
  }
}

export function useScanMachine() {
  return useReducer(scanMachineReducer, initialScanMachine);
}
