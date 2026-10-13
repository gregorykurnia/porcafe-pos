import { Loader2 } from "lucide-react";
import { ToneShape, type StatusTone } from "@/components/patterns/status-chip";

export type SaveStateKind = "unsaved" | "saving" | "saved" | "ready";

const SAVE_STATE: Record<SaveStateKind, { tone: StatusTone; word: string }> = {
  unsaved: { tone: "warn", word: "Unsaved changes" },
  saving: { tone: "info", word: "Saving…" },
  saved: { tone: "ok", word: "Saved" },
  ready: { tone: "neutral", word: "Ready to close" },
};

/** Save state with its word, shape and tone (DESIGN_SYSTEM §6, the Day close set). `savedAt` adds "Saved 21:42". */
export function SaveState({ kind, savedAt }: { kind: SaveStateKind; savedAt?: string }) {
  const { tone, word } = SAVE_STATE[kind];
  const text = kind === "saved" && savedAt ? `Saved ${savedAt}` : word;
  return (
    <span role="status" data-tone={tone} className="inline-flex items-center gap-1.5 text-small font-medium text-ink-muted">
      {kind === "saving" ? (
        <Loader2 className="size-3 animate-spin" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <ToneShape tone={tone} className={tone === "warn" ? "text-warn-mark" : undefined} />
      )}
      {text}
    </span>
  );
}
