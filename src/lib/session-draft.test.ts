import assert from "node:assert/strict";
import test from "node:test";
import { clearSessionDraft, closeDraftKey, readSessionDraft, writeSessionDraft } from "./session-draft";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    raw: data,
  };
}

test("keys drafts per operating date", () => {
  assert.equal(closeDraftKey("2026-10-11"), "porcafe.close.draft.2026-10-11");
});

test("round-trips a draft with the time it was saved", () => {
  const storage = memoryStorage();
  const key = closeDraftKey("2026-10-11");
  assert.equal(writeSessionDraft(key, { "item-1": "3" }, storage, 1_700_000_000_000), true);
  assert.deepEqual(readSessionDraft<Record<string, string>>(key, storage), {
    value: { "item-1": "3" },
    savedAt: 1_700_000_000_000,
  });
});

test("clearing removes the draft", () => {
  const storage = memoryStorage();
  const key = closeDraftKey("2026-10-11");
  writeSessionDraft(key, { "item-1": "3" }, storage);
  clearSessionDraft(key, storage);
  assert.equal(readSessionDraft(key, storage), null);
});

test("ignores corrupt or unexpected stored values", () => {
  const storage = memoryStorage();
  const key = "k";
  storage.setItem(key, "{not json");
  assert.equal(readSessionDraft(key, storage), null);
  storage.setItem(key, JSON.stringify({ value: 1 }));
  assert.equal(readSessionDraft(key, storage), null);
  storage.setItem(key, "null");
  assert.equal(readSessionDraft(key, storage), null);
});

test("is safe when storage is missing or throws", () => {
  assert.equal(readSessionDraft("k", null), null);
  assert.equal(writeSessionDraft("k", {}, null), false);
  clearSessionDraft("k", null);

  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readSessionDraft("k", throwing), null);
  assert.equal(writeSessionDraft("k", {}, throwing), false);
  clearSessionDraft("k", throwing);
});
