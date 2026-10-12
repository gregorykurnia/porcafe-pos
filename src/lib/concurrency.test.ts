import assert from "node:assert/strict";
import test from "node:test";
import { ConflictError, isStale, recordVersion } from "./concurrency";

test("a write is stale whenever the stored version differs from the loaded one", () => {
  assert.equal(isStale(100, 100), false);
  assert.equal(isStale(100, 200), true);
  // Another device saved the day after this one loaded it.
  assert.equal(isStale(100, null), true);
});

test("a write expecting no record is stale once someone else has created one", () => {
  assert.equal(isStale(null, null), false);
  assert.equal(isStale(null, 300), true);
});

test("records written before updatedAt existed are versioned by createdAt", () => {
  assert.equal(recordVersion({ createdAt: 10 }), 10);
  assert.equal(recordVersion({ createdAt: 10, updatedAt: 25 }), 25);
});

test("ConflictError carries the reload message and its own name", () => {
  const error = new ConflictError();
  assert.ok(error instanceof ConflictError);
  assert.ok(error instanceof Error);
  assert.equal(error.name, "ConflictError");
  assert.equal(error.message, "This day was changed on another device — reload to see the latest.");
});
