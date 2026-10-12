// Unsaved input kept in sessionStorage, so a reload or accidental navigation
// does not lose what someone typed. Storage can be missing or blocked (private
// windows, disabled site data), so every access is guarded and falls back to null.

export type SessionDraft<T> = {
  value: T;
  savedAt: number;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function closeDraftKey(date: string): string {
  return `porcafe.close.draft.${date}`;
}

export function readSessionDraft<T>(key: string, storage: DraftStorage | null = defaultStorage()): SessionDraft<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionDraft<T>>;
    if (parsed === null || typeof parsed !== "object" || typeof parsed.savedAt !== "number" || !("value" in parsed)) {
      return null;
    }
    return { value: parsed.value as T, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function writeSessionDraft<T>(key: string, value: T, storage: DraftStorage | null = defaultStorage(), now = Date.now()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ value, savedAt: now } satisfies SessionDraft<T>));
    return true;
  } catch {
    return false;
  }
}

export function clearSessionDraft(key: string, storage: DraftStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
