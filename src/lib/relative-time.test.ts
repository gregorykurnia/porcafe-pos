import assert from "node:assert/strict";
import test from "node:test";
import { formatSavedAgo } from "./relative-time";

const minute = 60_000;
const now = Date.UTC(2026, 9, 12, 12, 0);

test("describes recent saves in minutes and hours", () => {
  assert.equal(formatSavedAgo(now - 20_000, now), "just now");
  assert.equal(formatSavedAgo(now - 3 * minute, now), "3 min ago");
  assert.equal(formatSavedAgo(now - 2 * 60 * minute, now), "2 h ago");
});

test("falls back to a date for saves older than a day", () => {
  assert.notEqual(formatSavedAgo(now - 3 * 24 * 60 * minute, now), "");
  assert.ok(!formatSavedAgo(now - 3 * 24 * 60 * minute, now).includes("ago"));
});
