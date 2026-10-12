import assert from "node:assert/strict";
import test from "node:test";
import { queryWithValues } from "./query-state";

test("sets a value and keeps other keys in place", () => {
  assert.equal(queryWithValues("date=2026-10-10&view=history", { view: "catalog" }), "date=2026-10-10&view=catalog");
  assert.equal(queryWithValues("", { date: "2026-10-10" }), "date=2026-10-10");
});

test("a null value removes the key", () => {
  assert.equal(queryWithValues("date=2026-10-10&view=history", { date: null }), "view=history");
  assert.equal(queryWithValues("date=2026-10-10", { date: null }), "");
});

test("accepts a leading question mark and leaves an absent key absent", () => {
  assert.equal(queryWithValues("?view=history", { date: null }), "view=history");
});
